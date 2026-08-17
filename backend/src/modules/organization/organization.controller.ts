import {
  Response,
  NextFunction,
} from "express";

import { AuthRequest } from "../../middleware/auth.middleware.js";

import { setupOrganization } from "./organization.service.js";

import {
  validateOrganizationSetupRequest,
} from "./organization.validation.js";

export const setupOrganizationController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const error = validateOrganizationSetupRequest(
      req.body,
    );

    if (error) {
      return res.status(400).json({
        success: false,
        message: error,
        errorCode: "VALIDATION_ERROR",
      });
    }

    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: "Authentication required",
        errorCode: "AUTH_REQUIRED",
      });
    }

    const result = await setupOrganization({
      userId: req.user.userId,
      organizationId: req.user.organizationId,
      orgCode: req.body.orgCode,
    });

    return res.status(201).json({
      success: true,
      message: "Organization setup completed successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};