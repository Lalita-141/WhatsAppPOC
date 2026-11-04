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
    sessionId?: bigint,
) => {
    if (!fcmToken || typeof fcmToken !== "string" || !fcmToken.trim()) {
        throw new ApiError(400, "FCM_TOKEN_REQUIRED", "FCM token is required");
    }

    if (
        fcmToken.length > 500 ||
        (deviceType !== undefined &&
            (typeof deviceType !== "string" || deviceType.length > 20)) ||
        (deviceName !== undefined &&
            (typeof deviceName !== "string" || deviceName.length > 100))
    ) {
        throw new ApiError(400, "VALIDATION_ERROR", "Invalid device details");
    }

    const device = await upsertUserDevice(
        userOrganizationId,
        fcmToken.trim(),
        deviceType?.toUpperCase(),
        deviceName,
        sessionId,
    );

    return {
        deviceId: device.device_id.toString(),
        userOrganizationId: device.user_organization_id.toString(),
        deviceType: device.device_type,
        isActive: device.is_active,
    };
};

export const unregisterDeviceToken = async (
    fcmToken: string,
    userOrganizationId: bigint,
) => {
    if (!fcmToken || typeof fcmToken !== "string" || !fcmToken.trim()) {
        throw new ApiError(400, "FCM_TOKEN_REQUIRED", "FCM token is required");
    }

    // Only removes the caller's own token. The response does not reveal whether
    // the token exists for someone else.
    await deleteUserDevice(fcmToken.trim(), userOrganizationId);

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
