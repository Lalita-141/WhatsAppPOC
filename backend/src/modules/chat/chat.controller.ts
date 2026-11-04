import {
    Response,
    NextFunction,
} from "express";

import { AuthRequest } from "../../middleware/auth.middleware.js";

import { ApiError } from "../../utils/api-error.js";
import {
    CheckContactsRequest,
    validateCheckContactsRequest,
} from "./chat.validation.js";

import {
    checkContacts,
    getChatContacts,
} from "./chat.service.js";


// for send contact list
export const checkContactsController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
) => {

    try {

        const body =
            req.body as CheckContactsRequest;

        // Validate request
        const validationError =
            validateCheckContactsRequest(body);

        if (validationError) {
            throw new ApiError(
                400,
                "VALIDATION_ERROR",
                validationError,
            );
        }

        // Get logged-in user's organization membership
        const currentOrganizationId =
            req.user?.organizationId;

        if (!currentOrganizationId) {
            throw new ApiError(
                401,
                "UNAUTHORIZED",
                "Authentication required",
            );
        }

        // Check contacts
        const result = await checkContacts(
            currentOrganizationId,
            req.user!.userId,
            body.contacts,
        );

        return res.status(200).json({
            success: true,
            message: "Contacts checked successfully",
            data: result,
        });

    } catch (error) {
        next(error);
    }
};

// for personal chat
export const getChatContactsController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
) => {

    try {

        const userId = req.user?.userId;

        const organizationId =
            req.user?.organizationId;

        if (!userId || !organizationId) {
            throw new ApiError(
                401,
                "UNAUTHORIZED",
                "Authentication required",
            );
        }

        const result = await getChatContacts(
            BigInt(organizationId),
            BigInt(userId),
        );

        return res.status(200).json({
            success: true,
            message: "Contacts fetched successfully",
            data: result,
        });

    } catch (error) {
        next(error);
    }
};