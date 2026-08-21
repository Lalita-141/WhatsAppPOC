import { ApiError } from "../../../utils/api-error.js";

import {
    findPersonalChatHistory,
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