import { NextFunction, Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { blockUser, listBlocked, reportUser, unblockUser } from "./safety.service.js";

const target = (value: unknown) => {
    const text = Array.isArray(value) ? value[0] : value;
    if (typeof text !== "string" || !/^\d{1,20}$/.test(text)) {
        throw new ApiError(400, "VALIDATION_ERROR", "userOrganizationId is required");
    }
    return BigInt(text);
};

export const blockController = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        await blockUser(req.user!.userOrganizationId, target(req.body?.userOrganizationId));
        res.status(200).json({ success: true, message: "User blocked" });
    } catch (error) {
        next(error);
    }
};

export const unblockController = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        await unblockUser(req.user!.userOrganizationId, target(req.params.userOrganizationId));
        res.status(200).json({ success: true, message: "User unblocked" });
    } catch (error) {
        next(error);
    }
};

export const listBlockedController = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        res.status(200).json({ success: true, message: "Blocked users", data: await listBlocked(req.user!.userOrganizationId) });
    } catch (error) {
        next(error);
    }
};

export const reportController = async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        res.status(201).json({ success: true, message: "Report submitted", data: await reportUser(req.user!.userOrganizationId, req.body) });
    } catch (error) {
        next(error);
    }
};
