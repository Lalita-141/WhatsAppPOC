import { Response, NextFunction } from "express";
import { AuthRequest } from "../../middleware/auth.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { registerDeviceToken, unregisterDeviceToken } from "./device.service.js";

export const registerDeviceController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
) => {
    try {
        const userOrganizationId = req.user?.userOrganizationId;
        if (!userOrganizationId || userOrganizationId === BigInt(0)) {
            throw new ApiError(401, "AUTH_REQUIRED", "User organization ID is required");
        }

        const { fcmToken, deviceType, deviceName } = req.body;

        const result = await registerDeviceToken(
            userOrganizationId,
            fcmToken,
            deviceType,
            deviceName,
        );

        return res.status(200).json({
            success: true,
            message: "Device registered successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};

export const unregisterDeviceController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
) => {
    try {
        const { fcmToken } = req.body;

        const result = await unregisterDeviceToken(fcmToken);

        return res.status(200).json({
            success: true,
            message: result.message,
        });
    } catch (error) {
        next(error);
    }
};
