import prisma from "../config/database.js";
import { logger } from "../config/logger.js";
import { getRegisteredSocketServer } from "./socket.registry.js";
import { isViewingChatWith, userRoom } from "./presence.state.js";
import { MessageRow } from "../modules/chat/messages/message.repository.js";
import { toMessageDto } from "../modules/chat/messages/message.service.js";
import { getUserNameByUserOrgId } from "../modules/user/user.repository.js";
import { sendPersonalChatPushNotification, sendPushNotification } from "../modules/notification/notification.service.js";
import { GroupMessageRow, isGroupMuted, toGroupMessageDto } from "../modules/group/group.service.js";

const isMuted = async (owner: bigint, peer: bigint) => {
    const state = await prisma.conversation_state.findUnique({
        where: {
            owner_user_organization_id_peer_user_organization_id: {
                owner_user_organization_id: owner,
                peer_user_organization_id: peer,
            },
        },
        select: { muted_until: true },
    });

    return Boolean(state?.muted_until && state.muted_until.getTime() > Date.now());
};

const ATTACHMENT_LABELS: Record<string, string> = {
    IMAGE: "📷 Photo",
    VIDEO: "🎥 Video",
    AUDIO: "🎵 Audio",
    VOICE: "🎤 Voice message",
    DOCUMENT: "📄 Document",
};

export const attachmentLabel = (messageType: string) => ATTACHMENT_LABELS[messageType] ?? "New message";

/**
 * Sends a new message to the receiver's devices and to the sender's other
 * devices. Each side gets its own view of the message. Push is skipped for a
 * self message, a muted chat, or a receiver already looking at this chat.
 */
export const deliverNewMessage = (row: MessageRow, excludeSocketId?: string) => {
    const io = getRegisteredSocketServer();
    const sender = row.sender_user_organization_id;
    const receiver = row.receiver_user_organization_id;

    if (!io) {
        return;
    }

    const toSender = excludeSocketId
        ? io.to(userRoom(sender)).except(excludeSocketId)
        : io.to(userRoom(sender));
    toSender.emit("message:new", toMessageDto(row, sender));

    if (sender === receiver) {
        return;
    }

    io.to(userRoom(receiver)).emit("message:new", toMessageDto(row, receiver));

    if (isViewingChatWith(receiver, sender)) {
        return;
    }

    isMuted(receiver, sender)
        .then(async (muted) => {
            if (muted) {
                return;
            }

            await sendPersonalChatPushNotification({
                receiverUserOrganizationId: receiver,
                senderUserOrganizationId: sender,
                senderName: await getUserNameByUserOrgId(sender),
                messageText: row.message || attachmentLabel(row.message_type),
                chatId: row.chat_id.toString(),
            });
        })
        .catch((err) => logger.error({ err }, "Failed to send push notification"));
};

/** Tells both people in the chat that a message changed. */
export const emitMessageUpdated = (
    row: MessageRow,
    reason: "edited" | "deleted" | "pinned" | "unpinned" | "reaction",
) => {
    const io = getRegisteredSocketServer();

    if (!io) {
        return;
    }

    const people = new Set([
        row.sender_user_organization_id,
        row.receiver_user_organization_id,
    ]);

    for (const viewer of people) {
        io.to(userRoom(viewer)).emit("message:updated", {
            reason,
            message: toMessageDto(row, viewer),
        });
    }
};

/** Something only this member sees changed (star, delete for me, chat settings). */
export const emitToMember = (
    userOrganizationId: bigint,
    event: string,
    payload: unknown,
) => {
    getRegisteredSocketServer()?.to(userRoom(userOrganizationId)).emit(event, payload);
};

// ---------------------------------------------------------------- groups

export const groupChatKey = (groupId: bigint | string) => `group:${groupId.toString()}`;

/**
 * Sends a group message to every participating member and to the sender's
 * other devices. Members who muted the group or have it open get no push.
 */
export const deliverGroupMessage = async (
    row: GroupMessageRow,
    recipients: bigint[],
    groupName: string,
    excludeSocketId?: string,
) => {
    const io = getRegisteredSocketServer();
    if (!io) return;

    const sender = row.sender_user_organization_id;
    const toSender = excludeSocketId ? io.to(userRoom(sender)).except(excludeSocketId) : io.to(userRoom(sender));
    toSender.emit("group:message:new", toGroupMessageDto(row, sender));

    for (const member of recipients) {
        io.to(userRoom(member)).emit("group:message:new", toGroupMessageDto(row, member));

        if (row.message_type === "SYSTEM" || isViewingChatWith(member, groupChatKey(row.group_id))) continue;
        if (await isGroupMuted(row.group_id, member)) continue;

        sendPushNotification({
            receiverUserOrganizationId: member,
            category: "GROUP",
            thread: `group:${row.group_id}`,
            title: groupName,
            body: `${toGroupMessageDto(row, member).senderName}: ${row.message || attachmentLabel(row.message_type)}`,
            data: { type: "GROUP_CHAT", groupId: row.group_id.toString(), groupName, messageId: row.group_chat_id.toString() },
        }).catch((err) => logger.error({ err }, "Group push failed"));
    }
};

/** Sends an event to a list of members, shaped for each of them. */
export const emitToMembers = (members: bigint[], event: string, payloadFor: (member: bigint) => unknown) => {
    const io = getRegisteredSocketServer();
    if (!io) return;
    for (const member of members) io.to(userRoom(member)).emit(event, payloadFor(member));
};
