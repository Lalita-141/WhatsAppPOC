import { ApiError } from "../../../utils/api-error.js";
import { canReach, parseCursor, parseLimit, readReceiptsAllowed, toMessageDto } from "../messages/message.service.js";
import {
    ConversationRow,
    countPinnedConversations,
    findBlockedPeers,
    findConversationPage,
    findConversationState,
    findEmptySelfConversation,
    findPinnedConversations,
    upsertConversationState,
} from "./conversation.repository.js";

export const MAX_PINNED_CONVERSATIONS = 3;
// MySQL DATETIME's maximum, used for "muted until I unmute".
const MUTED_FOREVER = new Date("9999-12-31T00:00:00Z");
const MUTE_DURATIONS: Record<string, number> = {
    "8h": 8 * 60 * 60 * 1000,
    "1w": 7 * 24 * 60 * 60 * 1000,
};

const toConversation = async (
    row: ConversationRow,
    owner: bigint,
    blocked: Set<string>,
) => {
    const peerId = row.peer_user_organization_id;
    const isSelf = peerId === owner;
    const person = row.peer.user_master;
    const isDeletedAccount = Boolean(row.peer.deleted_at || person.deleted_at);
    const settings = row.peer.user_setting;
    // In a conversation list the two people have exchanged messages, which is
    // what "contacts" means until a contact list exists. Only NOBODY hides.
    const hidden = (level?: string | null) => !isSelf && level === "NOBODY";

    return {
        userOrganizationId: peerId.toString(),
        userId: person.user_id.toString(),
        name: isDeletedAccount
            ? "Deleted account"
            : [person.first_name, person.last_name].filter(Boolean).join(" "),
        firstName: isDeletedAccount ? "Deleted account" : person.first_name,
        lastName: isDeletedAccount ? null : person.last_name,
        mobileNo: isDeletedAccount ? "" : person.mobile_no,
        profilePhoto: isDeletedAccount || hidden(settings?.profile_privacy) ? null : person.profile_photo,
        // The download link itself is checked against profile photo privacy.
        profilePhotoMediaId:
            isDeletedAccount || hidden(settings?.profile_privacy)
                ? null
                : person.profile_photo_media_id?.toString() ?? null,
        about: isDeletedAccount || hidden(settings?.about_privacy) ? null : person.about,
        lastSeen: isDeletedAccount || hidden(settings?.last_seen_privacy) ? null : person.last_seen,
        lastMessage: row.last_message
            ? toMessageDto(row.last_message, owner, isSelf || (await readReceiptsAllowed(owner, peerId)))
            : null,
        unreadCount: row.unread_count,
        isSelf,
        isPinned: Boolean(row.pinned_at),
        mutedUntil: row.muted_until && row.muted_until.getTime() > Date.now() ? row.muted_until : null,
        isArchived: Boolean(row.archived_at),
        isBlocked: blocked.has(peerId.toString()),
        isDeletedAccount,
    };
};

/**
 * Pinned chats first, then the rest by newest message, one page at a time. The
 * cursor is the last message ID of the final row, so new messages arriving
 * between pages cannot repeat or skip a chat that was already shown.
 */
export const getConversations = async (
    owner: bigint,
    query: { cursor?: unknown; limit?: unknown; archived?: unknown } = {},
) => {
    const limit = parseLimit(query.limit);
    const cursor = parseCursor(query.cursor);
    const archived = query.archived === "true";
    const firstPage = cursor === undefined;

    const [pinned, emptySelf, rest] = await Promise.all([
        firstPage ? findPinnedConversations(owner, archived) : Promise.resolve([]),
        firstPage && !archived ? findEmptySelfConversation(owner) : Promise.resolve(null),
        findConversationPage(owner, archived, limit, cursor),
    ]);

    const rows = [...(emptySelf ? [emptySelf] : []), ...pinned, ...rest];
    const blocked = await findBlockedPeers(owner, rows.map((row) => row.peer_user_organization_id));
    const conversations = [];

    for (const row of rows) {
        conversations.push(await toConversation(row, owner, blocked));
    }

    return {
        conversations,
        pagination: {
            limit,
            hasMore: rest.length === limit,
            nextCursor: rest.length > 0 ? rest[rest.length - 1].last_message_id!.toString() : null,
        },
    };
};

/** Pin, mute or archive one chat for the owner only. */
export const updateConversation = async (owner: bigint, peer: bigint, body: unknown) => {
    if (!body || typeof body !== "object" || Array.isArray(body)) {
        throw new ApiError(400, "VALIDATION_ERROR", "Changes are required");
    }

    const input = body as Record<string, unknown>;
    const allowed = ["pinned", "muted", "archived"];
    const unknown = Object.keys(input).filter((key) => !allowed.includes(key));

    if (unknown.length > 0 || Object.keys(input).length === 0) {
        throw new ApiError(400, "VALIDATION_ERROR", "Send pinned, muted or archived");
    }

    if (peer !== owner && !(await findConversationState(owner, peer)) && !(await canReach(owner, peer))) {
        throw new ApiError(404, "CONVERSATION_NOT_FOUND", "Conversation not found");
    }

    const data: { pinned_at?: Date | null; muted_until?: Date | null; archived_at?: Date | null } = {};

    if ("pinned" in input) {
        if (typeof input.pinned !== "boolean") {
            throw new ApiError(400, "VALIDATION_ERROR", "pinned must be true or false");
        }
        if (input.pinned) {
            const current = await findConversationState(owner, peer);
            if (!current?.pinned_at && (await countPinnedConversations(owner)) >= MAX_PINNED_CONVERSATIONS) {
                throw new ApiError(400, "PIN_LIMIT", `You can pin up to ${MAX_PINNED_CONVERSATIONS} chats`);
            }
            data.pinned_at = current?.pinned_at ?? new Date();
        } else {
            data.pinned_at = null;
        }
    }

    if ("muted" in input) {
        const muted = input.muted;
        if (muted === false) {
            data.muted_until = null;
        } else if (muted === "forever") {
            data.muted_until = MUTED_FOREVER;
        } else if (typeof muted === "string" && MUTE_DURATIONS[muted]) {
            data.muted_until = new Date(Date.now() + MUTE_DURATIONS[muted]);
        } else {
            throw new ApiError(400, "VALIDATION_ERROR", "muted must be 8h, 1w, forever or false");
        }
    }

    if ("archived" in input) {
        if (typeof input.archived !== "boolean") {
            throw new ApiError(400, "VALIDATION_ERROR", "archived must be true or false");
        }
        data.archived_at = input.archived ? new Date() : null;
        // An archived chat leaves the pinned list, as in WhatsApp.
        if (input.archived) {
            data.pinned_at = null;
        }
    }

    const row = await upsertConversationState(owner, peer, data);
    const blocked = await findBlockedPeers(owner, [peer]);

    return toConversation(row, owner, blocked);
};
