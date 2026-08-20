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
import {
    SendPersonalMessageRequest,
    validateSendPersonalMessageRequest,
} from "./chat.validation.js";

import {
    sendPersonalMessage,
} from "./chat.service.js";


// send personal message 
export const sendPersonalMessageController = async (
    req: AuthRequest,
    res: Response,
    next: NextFunction,
) => {
    try {
        const body =
            req.body as SendPersonalMessageRequest;

        // 1. Validate request
        const validationError =
            validateSendPersonalMessageRequest(body);

        if (validationError) {
            throw new ApiError(
                400,
                "VALIDATION_ERROR",
                validationError,
            );
        }

        // 2. Get sender from JWT
        const senderUserOrganizationId =
            req.user?.userOrganizationId;

        if (!senderUserOrganizationId) {
            throw new ApiError(
                401,
                "UNAUTHORIZED",
                "Authentication required",
            );
        }

        // 3. Send message
        const result = await sendPersonalMessage(
            senderUserOrganizationId,
            body.receiverUserOrganizationId,
            body.message,
            senderUserOrganizationId,
            "text",


        );

        // 4. Return response
        return res.status(201).json({
            success: true,
            message: "Message sent successfully",
            data: result,
        });
    } catch (error) {
        next(error);
    }
};






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
            BigInt(userId),
            BigInt(organizationId),
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