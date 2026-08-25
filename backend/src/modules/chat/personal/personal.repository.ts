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


// ======================================================
// Find user organization
// ======================================================

export const findUserOrganizationById = async (
    userOrganizationId: bigint,
) => {

    return await prisma.user_organization.findFirst({
        where: {
            user_organization_id: userOrganizationId,
            deleted_at: null,
        },
        select: {
            user_organization_id: true,
            user_id: true,
            org_id: true,
        },
    });
};


// ======================================================
// Create personal message
// ======================================================

export const createPersonalMessage = async (data: {
    senderUserOrganizationId: bigint;
    receiverUserOrganizationId: bigint;
    message?: string | null;
    media?: unknown;
    createdBy?: bigint;
}) => {

    return await prisma.personal_chat_history.create({
        data: {
            sender_user_organization_id:
                data.senderUserOrganizationId,

            receiver_user_organization_id:
                data.receiverUserOrganizationId,

            message:
                data.message ?? null,

            media:
                data.media ?? undefined,

            send_time:
                new Date(),

            status:
                "SENT",

            created_by:
                data.createdBy ?? data.senderUserOrganizationId,
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

            created_at: true,
        },
    });
};

// ======================================================
// Mark personal message as delivered
// ======================================================

export const markPersonalMessageDelivered = async (
    chatId: bigint,
    receiverUserOrganizationId: bigint,
) => {

    return await prisma.personal_chat_history.updateMany({
        where: {
            chat_id: chatId,

            receiver_user_organization_id:
                receiverUserOrganizationId,

            deleted_at: null,

            status: "SENT",
        },

        data: {
            status: "DELIVERED",

            receive_time:
                new Date(),

            updated_at:
                new Date(),

            updated_by:
                receiverUserOrganizationId,
        },
    });
};

// ======================================================
// Find personal message
// ======================================================

export const findPersonalMessageById = async (
    chatId: bigint,
) => {

    return await prisma.personal_chat_history.findFirst({
        where: {
            chat_id: chatId,
            deleted_at: null,
        },

        select: {
            chat_id: true,

            sender_user_organization_id: true,

            receiver_user_organization_id: true,

            message: true,

            status: true,

            receive_time: true,

            send_time: true,
        },
    });
};