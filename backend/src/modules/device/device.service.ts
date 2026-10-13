import { ApiError } from "../../utils/api-error.js";
import {
    upsertUserDevice,
    deleteUserDevice,
    getActiveDevicesByUserOrganizationId,
} from "./device.repository.js";

export const registerDeviceToken = async (
    userOrganizationId: bigint,
    fcmToken: string,
    deviceType?: string,
    deviceName?: string,
) => {
    if (!fcmToken || typeof fcmToken !== "string" || !fcmToken.trim()) {
        throw new ApiError(400, "FCM_TOKEN_REQUIRED", "FCM token is required");
    }

    const device = await upsertUserDevice(
        userOrganizationId,
        fcmToken.trim(),
        deviceType?.toUpperCase(),
        deviceName,
    );

    return {
        deviceId: device.device_id.toString(),
        userOrganizationId: device.user_organization_id.toString(),
        deviceType: device.device_type,
        isActive: device.is_active,
    };
};

export const unregisterDeviceToken = async (fcmToken: string) => {
    if (!fcmToken || typeof fcmToken !== "string" || !fcmToken.trim()) {
        throw new ApiError(400, "FCM_TOKEN_REQUIRED", "FCM token is required");
    }

    await deleteUserDevice(fcmToken.trim());

    return {
        success: true,
        message: "Device token removed successfully",
    };
};

export const getUserDevices = async (userOrganizationId: bigint) => {
    const devices = await getActiveDevicesByUserOrganizationId(userOrganizationId);
    return devices.map((d) => ({
        deviceId: d.device_id.toString(),
        fcmToken: d.fcm_token,
        deviceType: d.device_type,
    }));
};
