import prisma from "../../config/database.js";

export const upsertUserDevice = async (
    userOrganizationId: bigint,
    fcmToken: string,
    deviceType?: string,
    deviceName?: string,
) => {
    return await prisma.user_device.upsert({
        where: {
            fcm_token: fcmToken,
        },
        update: {
            user_organization_id: userOrganizationId,
            device_type: deviceType,
            device_name: deviceName,
            is_active: true,
            updated_at: new Date(),
        },
        create: {
            user_organization_id: userOrganizationId,
            fcm_token: fcmToken,
            device_type: deviceType,
            device_name: deviceName,
            is_active: true,
        },
    });
};

export const deleteUserDevice = async (fcmToken: string) => {
    return await prisma.user_device.deleteMany({
        where: {
            fcm_token: fcmToken,
        },
    });
};

export const getActiveDevicesByUserOrganizationId = async (
    userOrganizationId: bigint,
) => {
    return await prisma.user_device.findMany({
        where: {
            user_organization_id: userOrganizationId,
            is_active: true,
        },
        select: {
            device_id: true,
            fcm_token: true,
            device_type: true,
        },
    });
};

export const deleteStaleDeviceTokens = async (staleTokens: string[]) => {
    if (!staleTokens || staleTokens.length === 0) return;
    return await prisma.user_device.deleteMany({
        where: {
            fcm_token: {
                in: staleTokens,
            },
        },
    });
};
