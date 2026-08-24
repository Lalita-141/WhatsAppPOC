import { ApiError } from "../../../utils/api-error.js";

import {
    findPersonalChatHistory,
    findUserOrganizationById,
    createPersonalMessage,
} from "./personal.repository.js";


export const getPersonalChatHistory = async (
    currentUserOrganizationId: bigint,
    otherUserOrganizationId: bigint,
    limit: number = 30,
    beforeChatId?: bigint,
) => {

    // --------------------------------------------------
    // 1. Cannot chat with yourself
    // --------------------------------------------------

    if (
        currentUserOrganizationId ===
        otherUserOrganizationId
    ) {
        throw new ApiError(
            400,
            "INVALID_CHAT_USER",
            "You cannot open a chat with yourself",
        );
    }


    // --------------------------------------------------
    // 2. Limit protection
    // --------------------------------------------------

    const safeLimit = Math.min(
        Math.max(limit, 1),
        50,
    );


    // --------------------------------------------------
    // 3. Get messages
    // --------------------------------------------------

    const messages =
        await findPersonalChatHistory(
            currentUserOrganizationId,
            otherUserOrganizationId,
            safeLimit,
            beforeChatId,
        );


    // --------------------------------------------------
    // 4. Convert BigInt values
    // --------------------------------------------------

    const result = messages
        .reverse()
        .map((message) => ({

            messageId:
                message.chat_id.toString(),

            senderUserOrganizationId:
                message.sender_user_organization_id.toString(),

            receiverUserOrganizationId:
                message.receiver_user_organization_id.toString(),

            message:
                message.message,

            media:
                message.media,

            sendTime:
                message.send_time,

            receiveTime:
                message.receive_time,

            status:
                message.status,

            isMine:
                message.sender_user_organization_id ===
                currentUserOrganizationId,

        }));


    // --------------------------------------------------
    // 5. Check whether more old messages exist
    // --------------------------------------------------

    const hasMore =
        messages.length === safeLimit;


    // --------------------------------------------------
    // 6. Cursor for next request
    // --------------------------------------------------

    const nextCursor =
        messages.length > 0
            ? messages[0].chat_id.toString()
            : null;


    return {
        messages: result,

        pagination: {
            limit: safeLimit,

            hasMore,

            nextCursor,
        },
    };
};

// ======================================================
// Send Personal Message
// ======================================================

export const sendPersonalMessage = async (
    senderUserOrganizationId: bigint,
    receiverUserOrganizationId: bigint,
    message?: string | null,
    media?: unknown,
) => {

    // --------------------------------------------------
    // 1. Cannot send message to yourself
    // --------------------------------------------------

    if (
        senderUserOrganizationId ===
        receiverUserOrganizationId
    ) {
        throw new ApiError(
            400,
            "INVALID_CHAT_USER",
            "You cannot send a message to yourself",
        );
    }


    // --------------------------------------------------
    // 2. Validate sender
    // --------------------------------------------------

    const sender =
        await findUserOrganizationById(
            senderUserOrganizationId,
        );

    if (!sender) {
        throw new ApiError(
            404,
            "SENDER_NOT_FOUND",
            "Sender organization membership not found",
        );
    }


    // --------------------------------------------------
    // 3. Validate receiver
    // --------------------------------------------------

    const receiver =
        await findUserOrganizationById(
            receiverUserOrganizationId,
        );

    if (!receiver) {
        throw new ApiError(
            404,
            "RECEIVER_NOT_FOUND",
            "Receiver organization membership not found",
        );
    }


    // --------------------------------------------------
    // 4. Make sure both users belong to same organization
    // --------------------------------------------------

    if (sender.org_id !== receiver.org_id) {
        throw new ApiError(
            403,
            "ORGANIZATION_MISMATCH",
            "Users do not belong to the same organization",
        );
    }


    // --------------------------------------------------
    // 5. Validate message
    // --------------------------------------------------

    const cleanMessage =
        typeof message === "string"
            ? message.trim()
            : null;

    if (
        !cleanMessage &&
        !media
    ) {
        throw new ApiError(
            400,
            "MESSAGE_REQUIRED",
            "Message or media is required",
        );
    }


    // --------------------------------------------------
    // 6. Save message
    // --------------------------------------------------

    const savedMessage =
        await createPersonalMessage({
            senderUserOrganizationId,
            receiverUserOrganizationId,
            message: cleanMessage,
            media,
            createdBy: senderUserOrganizationId,
        });


    // --------------------------------------------------
    // 7. Return safe response
    // --------------------------------------------------

    return {
        messageId:
            savedMessage.chat_id.toString(),

        senderUserOrganizationId:
            savedMessage
                .sender_user_organization_id
                .toString(),

        receiverUserOrganizationId:
            savedMessage
                .receiver_user_organization_id
                .toString(),

        message:
            savedMessage.message,

        media:
            savedMessage.media,

        sendTime:
            savedMessage.send_time,

        receiveTime:
            savedMessage.receive_time,

        status:
            savedMessage.status,
    };
};