import prisma from "../../../config/database.js";
import { Prisma } from "../../../generated/prisma/client.js";
import { mediaDtoSelect } from "../../media/media.dto.js";

export const messageSelect = (viewerUserOrganizationId: bigint) =>
    ({
        chat_id: true,
        sender_user_organization_id: true,
        receiver_user_organization_id: true,
        message: true,
        media: true,
        message_type: true,
        client_message_id: true,
        forwarded: true,
        send_time: true,
        receive_time: true,
        read_time: true,
        status: true,
        edited_at: true,
        deleted_for_everyone_at: true,
        pinned_at: true,
        media_file: { select: mediaDtoSelect },
        reply_to: {
            select: {
                chat_id: true,
                sender_user_organization_id: true,
                message: true,
                deleted_for_everyone_at: true,
            },
        },
        reactions: {
            select: {
                emoji: true,
                user_organization_id: true,
            },
            orderBy: { created_at: "asc" },
        },
        message_states: {
            where: { user_organization_id: viewerUserOrganizationId },
            select: { starred_at: true, deleted_at: true },
        },
    }) satisfies Prisma.personal_chat_historySelect;

export type MessageRow = Prisma.personal_chat_historyGetPayload<{
    select: ReturnType<typeof messageSelect>;
}>;

export const pairWhere = (a: bigint, b: bigint) => ({
    OR: [
        { sender_user_organization_id: a, receiver_user_organization_id: b },
        { sender_user_organization_id: b, receiver_user_organization_id: a },
    ],
});

// Rows the viewer may see: part of their conversation, and not deleted for them.
export const visibleToWhere = (viewer: bigint) => ({
    deleted_at: null,
    NOT: {
        message_states: {
            some: { user_organization_id: viewer, deleted_at: { not: null } },
        },
    },
});

export const findMembership = async (userOrganizationId: bigint) =>
    prisma.user_organization.findUnique({
        where: { user_organization_id: userOrganizationId },
        select: { user_organization_id: true, org_id: true, deleted_at: true },
    });

export const findBlockBetween = async (a: bigint, b: bigint) =>
    prisma.user_block.findFirst({
        where: {
            OR: [
                { blocker_user_organization_id: a, blocked_user_organization_id: b },
                { blocker_user_organization_id: b, blocked_user_organization_id: a },
            ],
        },
        select: { blocker_user_organization_id: true },
    });

export const findMessageForViewer = async (chatId: bigint, viewer: bigint) =>
    prisma.personal_chat_history.findFirst({
        where: {
            chat_id: chatId,
            ...visibleToWhere(viewer),
            OR: [
                { sender_user_organization_id: viewer },
                { receiver_user_organization_id: viewer },
            ],
        },
        select: messageSelect(viewer),
    });

export const findByClientMessageId = async (
    sender: bigint,
    clientMessageId: string,
) =>
    prisma.personal_chat_history.findUnique({
        where: {
            sender_user_organization_id_client_message_id: {
                sender_user_organization_id: sender,
                client_message_id: clientMessageId,
            },
        },
        select: messageSelect(sender),
    });

export const insertMessage = async (data: {
    sender: bigint;
    receiver: bigint;
    message: string;
    clientMessageId?: string;
    replyToChatId?: bigint;
    forwarded: boolean;
    mediaId?: bigint;
    messageType?: string;
}) => {
    const now = new Date();
    const isSelf = data.sender === data.receiver;

    return prisma.$transaction(async (tx) => {
        const created = await tx.personal_chat_history.create({
            data: {
                sender_user_organization_id: data.sender,
                receiver_user_organization_id: data.receiver,
                message: data.message,
                client_message_id: data.clientMessageId,
                reply_to_chat_id: data.replyToChatId,
                forwarded: data.forwarded,
                media_id: data.mediaId,
                message_type: data.messageType ?? "TEXT",
                send_time: now,
                status: isSelf ? "SEEN" : "SENT",
                receive_time: isSelf ? now : null,
                read_time: isSelf ? now : null,
                created_by: data.sender,
            },
            select: messageSelect(data.sender),
        });

        await tx.conversation_state.upsert({
            where: {
                owner_user_organization_id_peer_user_organization_id: {
                    owner_user_organization_id: data.sender,
                    peer_user_organization_id: data.receiver,
                },
            },
            create: {
                owner_user_organization_id: data.sender,
                peer_user_organization_id: data.receiver,
                last_message_id: created.chat_id,
            },
            update: { last_message_id: created.chat_id, updated_at: now },
        });

        if (!isSelf) {
            await tx.conversation_state.upsert({
                where: {
                    owner_user_organization_id_peer_user_organization_id: {
                        owner_user_organization_id: data.receiver,
                        peer_user_organization_id: data.sender,
                    },
                },
                create: {
                    owner_user_organization_id: data.receiver,
                    peer_user_organization_id: data.sender,
                    last_message_id: created.chat_id,
                    unread_count: 1,
                },
                update: {
                    last_message_id: created.chat_id,
                    unread_count: { increment: 1 },
                    updated_at: now,
                },
            });
        }

        return created;
    });
};

export const markDelivered = async (chatIds: bigint[], receiver: bigint) => {
    const pending = await prisma.personal_chat_history.findMany({
        where: {
            chat_id: { in: chatIds },
            receiver_user_organization_id: receiver,
            status: "SENT",
            deleted_at: null,
        },
        select: { chat_id: true, sender_user_organization_id: true },
    });

    if (pending.length === 0) {
        return [];
    }

    const now = new Date();

    await prisma.personal_chat_history.updateMany({
        where: { chat_id: { in: pending.map((row) => row.chat_id) }, status: "SENT" },
        data: { status: "DELIVERED", receive_time: now, updated_at: now, updated_by: receiver },
    });

    return pending.map((row) => ({ ...row, receive_time: now }));
};

export const markConversationRead = async (reader: bigint, peer: bigint) => {
    const now = new Date();

    return prisma.$transaction(async (tx) => {
        const unread = await tx.personal_chat_history.findMany({
            where: {
                sender_user_organization_id: peer,
                receiver_user_organization_id: reader,
                status: { in: ["SENT", "DELIVERED"] },
                deleted_at: null,
            },
            select: { chat_id: true },
        });

        if (unread.length > 0) {
            await tx.personal_chat_history.updateMany({
                where: { chat_id: { in: unread.map((row) => row.chat_id) } },
                data: {
                    status: "SEEN",
                    read_time: now,
                    receive_time: now,
                    updated_at: now,
                    updated_by: reader,
                },
            });
        }

        await tx.conversation_state.updateMany({
            where: {
                owner_user_organization_id: reader,
                peer_user_organization_id: peer,
                unread_count: { gt: 0 },
            },
            data: { unread_count: 0, updated_at: now },
        });

        return { chatIds: unread.map((row) => row.chat_id), readTime: now };
    });
};

export const findReadReceiptSettings = async (ids: bigint[]) => {
    const settings = await prisma.user_setting.findMany({
        where: { user_organization_id: { in: ids } },
        select: { user_organization_id: true, read_receipts: true, typing_indicator: true },
    });

    return new Map(settings.map((s) => [s.user_organization_id.toString(), s]));
};

export const updateMessageText = async (chatId: bigint, text: string, editor: bigint) =>
    prisma.personal_chat_history.update({
        where: { chat_id: chatId },
        data: { message: text, edited_at: new Date(), updated_at: new Date(), updated_by: editor },
        select: messageSelect(editor),
    });

export const deleteForEveryone = async (chatId: bigint, actor: bigint) => {
    const now = new Date();

    return prisma.$transaction(async (tx) => {
        await tx.message_reaction.deleteMany({ where: { chat_id: chatId } });

        return tx.personal_chat_history.update({
            where: { chat_id: chatId },
            data: {
                message: null,
                media: Prisma.DbNull,
                media_id: null,
                deleted_for_everyone_at: now,
                pinned_at: null,
                pinned_by: null,
                updated_at: now,
                updated_by: actor,
            },
            select: messageSelect(actor),
        });
    });
};

export const upsertMessageState = async (
    chatId: bigint,
    viewer: bigint,
    data: { starred_at?: Date | null; deleted_at?: Date | null },
) =>
    prisma.personal_message_state.upsert({
        where: {
            chat_id_user_organization_id: { chat_id: chatId, user_organization_id: viewer },
        },
        create: { chat_id: chatId, user_organization_id: viewer, ...data },
        update: { ...data, updated_at: new Date() },
    });

export const setReaction = async (chatId: bigint, viewer: bigint, emoji: string | null) => {
    if (emoji === null) {
        await prisma.message_reaction.deleteMany({
            where: { chat_id: chatId, user_organization_id: viewer },
        });
    } else {
        await prisma.message_reaction.upsert({
            where: { chat_id_user_organization_id: { chat_id: chatId, user_organization_id: viewer } },
            create: { chat_id: chatId, user_organization_id: viewer, emoji },
            update: { emoji, created_at: new Date() },
        });
    }

    return prisma.message_reaction.findMany({
        where: { chat_id: chatId },
        select: { emoji: true, user_organization_id: true },
        orderBy: { created_at: "asc" },
    });
};

export const countPinnedInConversation = async (a: bigint, b: bigint) =>
    prisma.personal_chat_history.count({
        where: { ...pairWhere(a, b), pinned_at: { not: null }, deleted_at: null },
    });

export const setPinned = async (chatId: bigint, actor: bigint, pinned: boolean) =>
    prisma.personal_chat_history.update({
        where: { chat_id: chatId },
        data: { pinned_at: pinned ? new Date() : null, pinned_by: pinned ? actor : null },
        select: messageSelect(actor),
    });

export const findHistory = async (
    viewer: bigint,
    peer: bigint,
    limit: number,
    beforeChatId?: bigint,
) =>
    prisma.personal_chat_history.findMany({
        where: {
            ...pairWhere(viewer, peer),
            ...visibleToWhere(viewer),
            ...(beforeChatId ? { chat_id: { lt: beforeChatId } } : {}),
        },
        orderBy: { chat_id: "desc" },
        take: limit,
        select: messageSelect(viewer),
    });

export const findPinned = async (viewer: bigint, peer: bigint) =>
    prisma.personal_chat_history.findMany({
        where: {
            ...pairWhere(viewer, peer),
            ...visibleToWhere(viewer),
            pinned_at: { not: null },
        },
        orderBy: { pinned_at: "desc" },
        select: messageSelect(viewer),
    });

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export const searchMessages = async (
    viewer: bigint,
    query: string,
    limit: number,
    peer?: bigint,
    beforeChatId?: bigint,
) =>
    prisma.personal_chat_history.findMany({
        where: {
            ...(peer
                ? pairWhere(viewer, peer)
                : {
                    OR: [
                        { sender_user_organization_id: viewer },
                        { receiver_user_organization_id: viewer },
                    ],
                }),
            ...visibleToWhere(viewer),
            deleted_for_everyone_at: null,
            message: { contains: escapeLike(query) },
            ...(beforeChatId ? { chat_id: { lt: beforeChatId } } : {}),
        },
        orderBy: { chat_id: "desc" },
        take: limit,
        select: messageSelect(viewer),
    });

export const findStarred = async (viewer: bigint, limit: number, beforeChatId?: bigint) =>
    prisma.personal_chat_history.findMany({
        where: {
            OR: [
                { sender_user_organization_id: viewer },
                { receiver_user_organization_id: viewer },
            ],
            ...visibleToWhere(viewer),
            deleted_for_everyone_at: null,
            message_states: {
                some: { user_organization_id: viewer, starred_at: { not: null } },
            },
            ...(beforeChatId ? { chat_id: { lt: beforeChatId } } : {}),
        },
        orderBy: { chat_id: "desc" },
        take: limit,
        select: messageSelect(viewer),
    });

export const findSince = async (viewer: bigint, afterChatId: bigint, limit: number) =>
    prisma.personal_chat_history.findMany({
        where: {
            OR: [
                { sender_user_organization_id: viewer },
                { receiver_user_organization_id: viewer },
            ],
            ...visibleToWhere(viewer),
            chat_id: { gt: afterChatId },
        },
        orderBy: { chat_id: "asc" },
        take: limit,
        select: messageSelect(viewer),
    });
