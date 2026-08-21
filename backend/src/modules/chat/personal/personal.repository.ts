import prisma from "../../../config/database.js";

export const findPersonalChatHistory = async (
    currentUserOrganizationId: bigint,
    otherUserOrganizationId: bigint,
    limit: number,
    beforeChatId?: bigint,
) => {

    return await prisma.personal_chat_history.findMany({

        where: {
            deleted_at: null,

            OR: [
                {
                    sender_user_organization_id:
                        currentUserOrganizationId,

                    receiver_user_organization_id:
                        otherUserOrganizationId,
                },

                {
                    sender_user_organization_id:
                        otherUserOrganizationId,

                    receiver_user_organization_id:
                        currentUserOrganizationId,
                },
            ],

            ...(beforeChatId
                ? {
                    chat_id: {
                        lt: beforeChatId,
                    },
                }
                : {}),
        },

        orderBy: {
            chat_id: "desc",
        },

        take: limit,

        select: {
            chat_id: true,

            sender_user_organization_id: true,

            receiver_user_organization_id: true,

            message: true,

            media: true,

            send_time: true,

            receive_time: true,

            status: true,

            created_at: true,
        },
    });
};