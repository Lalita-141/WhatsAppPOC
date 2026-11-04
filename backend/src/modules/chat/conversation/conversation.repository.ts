import prisma from "../../../config/database.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { messageSelect } from "../messages/message.repository.js";

const conversationSelect = (owner: bigint) =>
    ({
        peer_user_organization_id: true,
        last_message_id: true,
        unread_count: true,
        pinned_at: true,
        muted_until: true,
        archived_at: true,
        peer: {
            select: {
                user_organization_id: true,
                deleted_at: true,
                user_master: {
                    select: {
                        user_id: true,
                        first_name: true,
                        last_name: true,
                        mobile_no: true,
                        profile_photo: true,
                        about: true,
                        last_seen: true,
                        deleted_at: true,
                        profile_photo_media_id: true,
                    },
                },
                user_setting: {
                    select: { about_privacy: true, profile_privacy: true, last_seen_privacy: true },
                },
            },
        },
        last_message: { select: messageSelect(owner) },
    }) satisfies Prisma.conversation_stateSelect;

export type ConversationRow = Prisma.conversation_stateGetPayload<{
    select: ReturnType<typeof conversationSelect>;
}>;

const listWhere = (owner: bigint, archived: boolean) => ({
    owner_user_organization_id: owner,
    archived_at: archived ? { not: null } : null,
});

export const findPinnedConversations = async (owner: bigint, archived: boolean) =>
    prisma.conversation_state.findMany({
        where: { ...listWhere(owner, archived), pinned_at: { not: null }, last_message_id: { not: null } },
        orderBy: { pinned_at: "desc" },
        select: conversationSelect(owner),
    });

export const findConversationPage = async (
    owner: bigint,
    archived: boolean,
    limit: number,
    beforeLastMessageId?: bigint,
) =>
    prisma.conversation_state.findMany({
        where: {
            ...listWhere(owner, archived),
            pinned_at: null,
            last_message_id: beforeLastMessageId ? { lt: beforeLastMessageId } : { not: null },
        },
        orderBy: { last_message_id: "desc" },
        take: limit,
        select: conversationSelect(owner),
    });

/**
 * The self-chat before its first message has no last message, so it is not in
 * the paged list. It is fetched separately and shown at the top.
 */
export const findEmptySelfConversation = async (owner: bigint) =>
    prisma.conversation_state.findFirst({
        where: {
            owner_user_organization_id: owner,
            peer_user_organization_id: owner,
            last_message_id: null,
        },
        select: conversationSelect(owner),
    });

export const findBlockedPeers = async (owner: bigint, peers: bigint[]) => {
    const rows = await prisma.user_block.findMany({
        where: { blocker_user_organization_id: owner, blocked_user_organization_id: { in: peers } },
        select: { blocked_user_organization_id: true },
    });
    return new Set(rows.map((row) => row.blocked_user_organization_id.toString()));
};

export const countPinnedConversations = async (owner: bigint) =>
    prisma.conversation_state.count({
        where: { owner_user_organization_id: owner, pinned_at: { not: null } },
    });

export const findConversationState = async (owner: bigint, peer: bigint) =>
    prisma.conversation_state.findUnique({
        where: {
            owner_user_organization_id_peer_user_organization_id: {
                owner_user_organization_id: owner,
                peer_user_organization_id: peer,
            },
        },
        select: conversationSelect(owner),
    });

export const upsertConversationState = async (
    owner: bigint,
    peer: bigint,
    data: { pinned_at?: Date | null; muted_until?: Date | null; archived_at?: Date | null },
) =>
    prisma.conversation_state.upsert({
        where: {
            owner_user_organization_id_peer_user_organization_id: {
                owner_user_organization_id: owner,
                peer_user_organization_id: peer,
            },
        },
        create: { owner_user_organization_id: owner, peer_user_organization_id: peer, ...data },
        update: { ...data, updated_at: new Date() },
        select: conversationSelect(owner),
    });
