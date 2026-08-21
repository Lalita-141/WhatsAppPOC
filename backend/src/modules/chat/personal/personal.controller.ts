import {
    Request,
    Response,
    NextFunction,
} from "express";

import { AuthRequest } from "../../../middleware/auth.middleware.js";

import { ApiError } from "../../../utils/api-error.js";

import {
    getPersonalChatHistory,
} from "./personal.service.js";


export const getPersonalChatHistoryController =
    async (
        req: AuthRequest,
        res: Response,
        next: NextFunction,
    ) => {

        try {

            // ------------------------------------------------
            // 1. Logged-in user
            // ------------------------------------------------

            const currentUserOrganizationId =
                req.user?.userOrganizationId;


            if (!currentUserOrganizationId) {
                throw new ApiError(
                    401,
                    "UNAUTHORIZED",
                    "Authentication required",
                );
            }


            // ------------------------------------------------
            // 2. Other user
            // ------------------------------------------------

            const userOrganizationIdParam =
                req.params.userOrganizationId;

            if (!userOrganizationIdParam) {
                throw new ApiError(
                    400,
                    "USER_REQUIRED",
                    "User organization ID is required",
                );
            }

            const userOrganizationId =
                Array.isArray(userOrganizationIdParam)
                    ? userOrganizationIdParam[0]
                    : userOrganizationIdParam;

            let otherUserOrganizationId: bigint;

            try {
                otherUserOrganizationId =
                    BigInt(userOrganizationId);
            } catch {
                throw new ApiError(
                    400,
                    "INVALID_USER_ID",
                    "Invalid user organization ID",
                );
            }

            // ------------------------------------------------
            // 3. Pagination
            // ------------------------------------------------

            const limitParam =
                req.query.limit as string | undefined;

            const beforeChatIdParam =
                req.query.beforeChatId as
                | string
                | undefined;


            const limit =
                limitParam
                    ? Number(limitParam)
                    : 30;


            if (
                !Number.isInteger(limit) ||
                limit < 1 ||
                limit > 50
            ) {
                throw new ApiError(
                    400,
                    "INVALID_LIMIT",
                    "Limit must be between 1 and 50",
                );
            }


            let beforeChatId:
                | bigint
                | undefined;


            if (beforeChatIdParam) {

                try {

                    beforeChatId =
                        BigInt(beforeChatIdParam);

                } catch {

                    throw new ApiError(
                        400,
                        "INVALID_CURSOR",
                        "Invalid beforeChatId",
                    );
                }
            }


            // ------------------------------------------------
            // 4. Get history
            // ------------------------------------------------

            const result =
                await getPersonalChatHistory(
                    BigInt(currentUserOrganizationId),
                    otherUserOrganizationId,
                    limit,
                    beforeChatId,
                );


            // ------------------------------------------------
            // 5. Response
            // ------------------------------------------------

            return res.status(200).json({

                success: true,

                message:
                    "Chat history fetched successfully",

                data: result,

            });

        } catch (error) {

            next(error);

        }
    };