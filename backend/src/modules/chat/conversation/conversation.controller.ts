import { NextFunction, Response } from "express";
import { AuthRequest } from "../../../middleware/auth.middleware.js";
import { ApiError } from "../../../utils/api-error.js";
import { getConversations } from "./conversation.service.js";



export const getConversationsController =
    async (
        req: AuthRequest,
        res: Response,
        next: NextFunction,
    ) => {

        try {

            // Get authenticated user's organization membership
            const userOrganizationId =
                req.user?.userOrganizationId;


            if (!userOrganizationId) {
                throw new ApiError(
                    401,
                    "UNAUTHORIZED",
                    "Authentication required",
                );
            }


            const result =
                await getConversations(
                    BigInt(userOrganizationId),
                );


            return res.status(200).json({
                success: true,
                message:
                    "Conversations fetched successfully",
                data: result,
            });

        } catch (error) {

            next(error);

        }
    };