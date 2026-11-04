import { ApiError } from "../../../utils/api-error.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { getOrganizationSetting, organizationsCanCommunicate } from "../../policy/communication.policy.js";
import { attachableMedia } from "../../media/media.service.js";
import { toMediaDto } from "../../media/media.dto.js";
import {
    countPinnedInConversation,
    deleteForEveryone,
    findBlockBetween,
    findByClientMessageId,
    findHistory,
    findMembership,
    findMessageForViewer,
    findPinned,
    findReadReceiptSettings,
    findSince,
    findStarred,
    insertMessage,
    markConversationRead,
    markDelivered,
    MessageRow,
    searchMessages,
    setPinned,
    setReaction,
    updateMessageText,
    upsertMessageState,
} from "./message.repository.js";

export const MAX_MESSAGE_LENGTH = 5000;
export const EDIT_WINDOW_MS = 15 * 60 * 1000;
export const DELETE_FOR_EVERYONE_WINDOW_MS = 48 * 60 * 60 * 1000;
export const MAX_PINNED_PER_CONVERSATION = 3;
const CLIENT_MESSAGE_ID = /^[A-Za-z0-9_-]{8,64}$/;
// One emoji, possibly with skin tone or joiners. Plain text is refused.
const EMOJI = /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator})[\p{Extended_Pictographic}\p{Emoji_Modifier}\p{Emoji_Component}‍️]*$/u;

export interface MessageDto {
    messageId: string;
    clientMessageId: string | null;
    senderUserOrganizationId: string;
    receiverUserOrganizationId: string;
    message: string | null;
    messageType: string;
    media: unknown;
    sendTime: Date;
    receiveTime: Date | null;
    readTime: Date | null;
    status: string;
    isMine: boolean;
    isSelf: boolean;
    forwarded: boolean;
    editedAt: Date | null;
    isDeleted: boolean;
    pinnedAt: Date | null;
    isStarred: boolean;
    replyTo: {
        messageId: string;
        senderUserOrganizationId: string;
        message: string | null;
        isDeleted: boolean;
    } | null;
    reactions: { emoji: string; userOrganizationId: string }[];
}

/**
 * Shapes a row for one viewer. When either side has read receipts off, the
 * sender sees "delivered" instead of "seen", so the setting cannot be bypassed
 * by reading history.
 */
export const toMessageDto = (
    row: MessageRow,
    viewer: bigint,
    showReadState = true,
): MessageDto => {
    const isMine = row.sender_user_organization_id === viewer;
    const isSelf = row.sender_user_organization_id === row.receiver_user_organization_id;
    const hideRead = isMine && !isSelf && !showReadState && row.status === "SEEN";
    const state = row.message_states?.[0];

    return {
        messageId: row.chat_id.toString(),
        clientMessageId: isMine ? row.client_message_id : null,
        senderUserOrganizationId: row.sender_user_organization_id.toString(),
        receiverUserOrganizationId: row.receiver_user_organization_id.toString(),
        message: row.deleted_for_everyone_at ? null : row.message,
        messageType: row.message_type,
        media: row.deleted_for_everyone_at || !row.media_file ? null : toMediaDto(row.media_file),
        sendTime: row.send_time,
        receiveTime: row.receive_time,
        readTime: hideRead ? null : row.read_time,
        status: hideRead ? "DELIVERED" : row.status,
        isMine,
        isSelf,
        forwarded: row.forwarded,
        editedAt: row.edited_at,
        isDeleted: Boolean(row.deleted_for_everyone_at),
        pinnedAt: row.pinned_at,
        isStarred: Boolean(state?.starred_at),
        replyTo: row.reply_to
            ? {
                messageId: row.reply_to.chat_id.toString(),
                senderUserOrganizationId: row.reply_to.sender_user_organization_id.toString(),
                message: row.reply_to.deleted_for_everyone_at ? null : row.reply_to.message,
                isDeleted: Boolean(row.reply_to.deleted_for_everyone_at),
            }
            : null,
        reactions: (row.reactions ?? []).map((reaction) => ({
            emoji: reaction.emoji,
            userOrganizationId: reaction.user_organization_id.toString(),
        })),
    };
};

/** True when both people allow read receipts. */
export const readReceiptsAllowed = async (a: bigint, b: bigint) => {
    const settings = await findReadReceiptSettings([a, b]);
    return (
        settings.get(a.toString())?.read_receipts !== false &&
        settings.get(b.toString())?.read_receipts !== false
    );
};

export const typingAllowed = async (userOrganizationId: bigint) => {
    const settings = await findReadReceiptSettings([userOrganizationId]);
    return settings.get(userOrganizationId.toString())?.typing_indicator !== false;
};

/**
 * The single check for whether one member may message another: active
 * memberships, the organization policy, and blocks. A blocked sender gets the
 * same answer as any other refusal, so blocking is not revealed to them.
 */
export const assertCanMessage = async (sender: bigint, receiver: bigint) => {
    if (sender === receiver) {
        return;
    }

    const [from, to] = await Promise.all([findMembership(sender), findMembership(receiver)]);

    if (!from || from.deleted_at) {
        throw new ApiError(403, "SENDER_NOT_ALLOWED", "Your membership is not active");
    }

    if (!to || to.deleted_at || !(await organizationsCanCommunicate(from.org_id, to.org_id))) {
        throw new ApiError(403, "CANNOT_MESSAGE", "You cannot message this user");
    }

    const block = await findBlockBetween(sender, receiver);

    if (block?.blocker_user_organization_id === sender) {
        throw new ApiError(403, "USER_BLOCKED", "Unblock this contact to send a message");
    }

    if (block) {
        throw new ApiError(403, "CANNOT_MESSAGE", "You cannot message this user");
    }
};

/** Both organizations must allow file sharing for an attachment to be sent. */
export const assertFileSharing = async (...members: bigint[]) => {
    for (const member of members) {
        const membership = await findMembership(member);
        if (membership && !(await getOrganizationSetting(membership.org_id)).file_sharing_enabled) {
            throw new ApiError(403, "FILE_SHARING_DISABLED", "File sharing is turned off for this chat");
        }
    }
};

export const canReach = async (viewer: bigint, target: bigint) => {
    try {
        await assertCanMessage(viewer, target);
        return true;
    } catch {
        return false;
    }
};

const cleanText = (text: unknown) => {
    if (typeof text !== "string") {
        throw new ApiError(400, "INVALID_MESSAGE", "Message must be text");
    }

    const trimmed = text.trim();

    if (!trimmed) {
        throw new ApiError(400, "MESSAGE_REQUIRED", "Message is required");
    }

    if (trimmed.length > MAX_MESSAGE_LENGTH) {
        throw new ApiError(400, "INVALID_MESSAGE", `Message must be at most ${MAX_MESSAGE_LENGTH} characters`);
    }

    return trimmed;
};

const sameConversation = (row: MessageRow, a: bigint, b: bigint) =>
    (row.sender_user_organization_id === a && row.receiver_user_organization_id === b) ||
    (row.sender_user_organization_id === b && row.receiver_user_organization_id === a);

export interface SendInput {
    sender: bigint;
    receiver: bigint;
    message: unknown;
    clientMessageId?: unknown;
    replyToMessageId?: bigint | null;
    forwarded?: boolean;
    mediaId?: bigint | null;
}

/**
 * Saves a message once. A retry with the same clientMessageId returns the
 * stored message with created = false, so the client never shows a duplicate.
 */
export const sendMessage = async (input: SendInput) => {
    // With an attachment the text is an optional caption.
    const text = input.mediaId && (input.message === undefined || input.message === null || input.message === "")
        ? ""
        : cleanText(input.message);

    let clientMessageId: string | undefined;

    if (input.clientMessageId !== undefined && input.clientMessageId !== null) {
        if (typeof input.clientMessageId !== "string" || !CLIENT_MESSAGE_ID.test(input.clientMessageId)) {
            throw new ApiError(400, "INVALID_CLIENT_MESSAGE_ID", "clientMessageId must be 8-64 letters, digits, _ or -");
        }
        clientMessageId = input.clientMessageId;

        const existing = await findByClientMessageId(input.sender, clientMessageId);

        if (existing) {
            if (existing.receiver_user_organization_id !== input.receiver) {
                throw new ApiError(409, "CLIENT_MESSAGE_ID_REUSED", "clientMessageId was already used");
            }
            return { message: existing, created: false };
        }
    }

    await assertCanMessage(input.sender, input.receiver);

    let messageType = "TEXT";
    if (input.mediaId) {
        const media = await attachableMedia(input.sender, input.mediaId, Boolean(input.forwarded));
        await assertFileSharing(input.sender, input.receiver);
        messageType = media.kind;
    }

    let replyToChatId: bigint | undefined;

    if (input.replyToMessageId) {
        const target = await findMessageForViewer(input.replyToMessageId, input.sender);

        if (!target || !sameConversation(target, input.sender, input.receiver) || target.deleted_for_everyone_at) {
            throw new ApiError(400, "INVALID_REPLY", "You can only reply to a message in this chat");
        }
        replyToChatId = target.chat_id;
    }

    try {
        const message = await insertMessage({
            sender: input.sender,
            receiver: input.receiver,
            message: text,
            clientMessageId,
            replyToChatId,
            forwarded: Boolean(input.forwarded),
            mediaId: input.mediaId ?? undefined,
            messageType,
        });

        return { message, created: true };
    } catch (error) {
        // Two attempts raced; the other one stored it.
        if (
            clientMessageId &&
            error instanceof Prisma.PrismaClientKnownRequestError &&
            error.code === "P2002"
        ) {
            const existing = await findByClientMessageId(input.sender, clientMessageId);
            if (existing) {
                return { message: existing, created: false };
            }
        }
        throw error;
    }
};

export const markMessagesDelivered = async (chatIds: bigint[], receiver: bigint) =>
    markDelivered(chatIds.slice(0, 500), receiver);

export const markRead = async (reader: bigint, peer: bigint) => {
    if (reader === peer) {
        return { chatIds: [], readTime: new Date(), notifySender: false };
    }

    const result = await markConversationRead(reader, peer);

    return {
        ...result,
        notifySender: result.chatIds.length > 0 && (await readReceiptsAllowed(reader, peer)),
    };
};

const requireVisible = async (chatId: bigint, viewer: bigint) => {
    const row = await findMessageForViewer(chatId, viewer);

    // Same answer for "not yours" and "does not exist".
    if (!row) {
        throw new ApiError(404, "MESSAGE_NOT_FOUND", "Message not found");
    }

    return row;
};

const peerOf = (row: MessageRow, viewer: bigint) =>
    row.sender_user_organization_id === viewer
        ? row.receiver_user_organization_id
        : row.sender_user_organization_id;

export const editMessage = async (chatId: bigint, editor: bigint, text: unknown) => {
    const row = await requireVisible(chatId, editor);

    if (row.sender_user_organization_id !== editor) {
        throw new ApiError(403, "NOT_SENDER", "You can only edit your own messages");
    }

    if (row.deleted_for_everyone_at) {
        throw new ApiError(400, "MESSAGE_DELETED", "This message was deleted");
    }

    if (Date.now() - row.send_time.getTime() > EDIT_WINDOW_MS) {
        throw new ApiError(400, "EDIT_WINDOW_PASSED", "Messages can only be edited for 15 minutes");
    }

    return updateMessageText(chatId, cleanText(text), editor);
};

export const deleteMessage = async (chatId: bigint, actor: bigint, scope: unknown) => {
    const row = await requireVisible(chatId, actor);

    if (scope === "me") {
        await upsertMessageState(chatId, actor, { deleted_at: new Date() });
        return { scope: "me" as const, row };
    }

    if (scope !== "everyone") {
        throw new ApiError(400, "INVALID_SCOPE", "scope must be me or everyone");
    }

    if (row.sender_user_organization_id !== actor) {
        throw new ApiError(403, "NOT_SENDER", "You can only delete your own messages for everyone");
    }

    if (row.deleted_for_everyone_at) {
        return { scope: "everyone" as const, row };
    }

    if (Date.now() - row.send_time.getTime() > DELETE_FOR_EVERYONE_WINDOW_MS) {
        throw new ApiError(400, "DELETE_WINDOW_PASSED", "Messages can only be deleted for everyone within 48 hours");
    }

    return { scope: "everyone" as const, row: await deleteForEveryone(chatId, actor) };
};

export const reactToMessage = async (chatId: bigint, actor: bigint, emoji: unknown) => {
    const row = await requireVisible(chatId, actor);

    if (row.deleted_for_everyone_at) {
        throw new ApiError(400, "MESSAGE_DELETED", "This message was deleted");
    }

    if (emoji !== null && (typeof emoji !== "string" || emoji.length > 16 || !EMOJI.test(emoji))) {
        throw new ApiError(400, "INVALID_REACTION", "Reaction must be a single emoji");
    }

    const reactions = await setReaction(chatId, actor, emoji as string | null);

    return {
        row,
        reactions: reactions.map((reaction) => ({
            emoji: reaction.emoji,
            userOrganizationId: reaction.user_organization_id.toString(),
        })),
    };
};

export const starMessage = async (chatId: bigint, actor: bigint, starred: boolean) => {
    const row = await requireVisible(chatId, actor);
    await upsertMessageState(chatId, actor, { starred_at: starred ? new Date() : null });
    return toMessageDto({ ...row, message_states: [{ starred_at: starred ? new Date() : null, deleted_at: null }] }, actor);
};

export const pinMessage = async (chatId: bigint, actor: bigint, pinned: boolean) => {
    const row = await requireVisible(chatId, actor);

    if (row.deleted_for_everyone_at) {
        throw new ApiError(400, "MESSAGE_DELETED", "This message was deleted");
    }

    if (pinned && !row.pinned_at) {
        const count = await countPinnedInConversation(
            row.sender_user_organization_id,
            row.receiver_user_organization_id,
        );

        if (count >= MAX_PINNED_PER_CONVERSATION) {
            throw new ApiError(400, "PIN_LIMIT", `You can pin up to ${MAX_PINNED_PER_CONVERSATION} messages in a chat`);
        }
    }

    return setPinned(chatId, actor, pinned);
};

/** The text and attachment of a message the actor can see, for forwarding. */
export const forwardableContent = async (chatId: bigint, actor: bigint) => {
    const source = await requireVisible(chatId, actor);
    if (source.deleted_for_everyone_at || (!source.message && !source.media_file)) {
        throw new ApiError(400, "MESSAGE_DELETED", "This message was deleted");
    }
    return { text: source.message ?? "", mediaId: source.media_file?.media_id ?? null };
};

const PAGE = { min: 1, max: 50, fallback: 30 };

export const parseLimit = (value: unknown, max = PAGE.max) => {
    if (value === undefined) return PAGE.fallback;
    const limit = Number(value);
    if (!Number.isInteger(limit) || limit < PAGE.min || limit > max) {
        throw new ApiError(400, "INVALID_LIMIT", `Limit must be between ${PAGE.min} and ${max}`);
    }
    return limit;
};

export const parseCursor = (value: unknown) => {
    if (value === undefined || value === "") return undefined;
    if (typeof value !== "string" || !/^\d{1,20}$/.test(value)) {
        throw new ApiError(400, "INVALID_CURSOR", "Invalid cursor");
    }
    return BigInt(value);
};

const page = (rows: MessageRow[], viewer: bigint, limit: number, showReadState: (row: MessageRow) => boolean) => ({
    messages: rows.map((row) => toMessageDto(row, viewer, showReadState(row))),
    pagination: {
        limit,
        hasMore: rows.length === limit,
        nextCursor: rows.length > 0 ? rows[rows.length - 1].chat_id.toString() : null,
    },
});

export const getHistory = async (viewer: bigint, peer: bigint, limit: number, before?: bigint) => {
    const rows = await findHistory(viewer, peer, limit, before);
    const showRead = await readReceiptsAllowed(viewer, peer);
    const result = page(rows, viewer, limit, () => showRead);

    // Oldest first for display; the cursor is the oldest message returned.
    return { ...result, messages: result.messages.reverse() };
};

const receiptCache = async (viewer: bigint, rows: MessageRow[]) => {
    const peers = [...new Set(rows.map((row) => peerOf(row, viewer).toString()))];
    const allowed = new Map<string, boolean>();
    for (const peer of peers) {
        allowed.set(peer, await readReceiptsAllowed(viewer, BigInt(peer)));
    }
    return (row: MessageRow) => allowed.get(peerOf(row, viewer).toString()) ?? true;
};

export const getPinned = async (viewer: bigint, peer: bigint) => {
    const rows = await findPinned(viewer, peer);
    const showRead = await readReceiptsAllowed(viewer, peer);
    return rows.map((row) => toMessageDto(row, viewer, showRead));
};

export const search = async (
    viewer: bigint,
    query: unknown,
    limit: number,
    peer?: bigint,
    before?: bigint,
) => {
    if (typeof query !== "string" || query.trim().length < 2 || query.length > 100) {
        throw new ApiError(400, "INVALID_QUERY", "Search for 2 to 100 characters");
    }

    const rows = await searchMessages(viewer, query.trim(), limit, peer, before);
    return page(rows, viewer, limit, await receiptCache(viewer, rows));
};

export const getStarred = async (viewer: bigint, limit: number, before?: bigint) => {
    const rows = await findStarred(viewer, limit, before);
    return page(rows, viewer, limit, await receiptCache(viewer, rows));
};

/** Messages after the newest one a device has, for catching up after being offline. */
export const syncSince = async (viewer: bigint, after: bigint, limit: number) => {
    const rows = await findSince(viewer, after, limit);
    const showRead = await receiptCache(viewer, rows);

    return {
        messages: rows.map((row) => toMessageDto(row, viewer, showRead(row))),
        hasMore: rows.length === limit,
        lastMessageId: rows.length > 0 ? rows[rows.length - 1].chat_id.toString() : after.toString(),
    };
};

export { peerOf };
