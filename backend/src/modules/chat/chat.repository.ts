import prisma from "../../config/database.js";

export const createPersonalMessage = async (data: {
    senderUserOrganizationId: bigint;
    receiverUserOrganizationId: bigint;
    message: string;
    createdBy: bigint;
    media: string;
    // messageType: string;

}) => {
    return await prisma.personal_chat_history.create({
        data: {
            sender_user_organization_id:
                data.senderUserOrganizationId,

            receiver_user_organization_id:
                data.receiverUserOrganizationId,

            message: data.message,
            created_by: data.createdBy,
            media: data.media,
            status: "SENT",
        },
    });
};


// 
export const findUsersByMobileNumbers = async (
    mobileNumbers: string[],
) => {
    return await prisma.user_master.findMany({
        where: {
            mobile_no: {
                in: mobileNumbers,
            },
            deleted_at: null,
        },
        select: {
            user_id: true,
            mobile_no: true,
            first_name: true,
            last_name: true,

            user_organization: {
                where: {
                    deleted_at: null,
                },
                select: {
                    user_organization_id: true,
                    org_id: true,
                },
            },
        },
    });
};


export const getUsersForChat = async (
    organizationId: bigint,
    currentUserId: bigint,
) => {
    return await prisma.user_master.findMany({
        where: {
            deleted_at: null,

            // Don't show myself
            user_id: {
                not: currentUserId,
            },

            // User must belong to same organization
            user_organization: {
                some: {
                    org_id: organizationId,
                    deleted_at: null,
                },
            },
        },

        select: {
            user_id: true,
            first_name: true,
            last_name: true,
            mobile_no: true,
            profile_photo: true,
            about: true,
            last_seen: true,

            user_organization: {
                where: {
                    org_id: organizationId,
                    deleted_at: null,
                },
                select: {
                    user_organization_id: true,
                    org_id: true,
                },
            },
        },

        orderBy: {
            first_name: "asc",
        },
    });
};