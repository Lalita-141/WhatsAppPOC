import prisma from "../../../config/database.js";


/**
 * Get all personal messages involving the logged-in user.
 */
export const findPersonalChatMessages = async (
    userOrganizationId: bigint,
) => {
    return await prisma.personal_chat_history.findMany({
        where: {
            deleted_at: null,

            OR: [
                {
                    sender_user_organization_id:
                        userOrganizationId,
                },
                {
                    receiver_user_organization_id:
                        userOrganizationId,
                },
            ],
        },

        orderBy: {
            send_time: "desc",
        },

        select: {
            chat_id: true,
            sender_user_organization_id: true,
            receiver_user_organization_id: true,
            message: true,
            media: true,
            send_time: true,
            receive_time: true,
            status: true,
        },
    });
};


/**
 * Get profile details of the other users.
 */
export const findUsersByUserOrganizationIds = async (
    userOrganizationIds: bigint[],
) => {
    return await prisma.user_organization.findMany({
        where: {
            user_organization_id: {
                in: userOrganizationIds,
            },

            deleted_at: null,
        },

        select: {
            user_organization_id: true,

            user_master: {
                select: {
                    user_id: true,
                    first_name: true,
                    last_name: true,
                    mobile_no: true,
                    profile_photo: true,
                    about: true,
                    last_seen: true,
                },
            },
        },
    });
};