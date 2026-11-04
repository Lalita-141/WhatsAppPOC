import {
  Response,
  NextFunction,
} from "express";

import { OrganizationSetupRequest } from "../../middleware/organization-setup.middleware.js";

import { setupOrganization } from "./organization.service.js";

import {
  validateOrganizationSetupRequest,
} from "./organization.validation.js";

export const setupOrganizationController = async (
  req: OrganizationSetupRequest,
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
      deviceType: req.body.deviceType?.toUpperCase(),
      deviceName: req.body.deviceName,
    });

    if (result.status === "PENDING_APPROVAL") {
      return res.status(202).json({
        success: true,
        message: "Your request to join was sent to the organization's admins",
        data: result,
      });
    }

    return res.status(201).json({
      success: true,
      message: "Organization setup completed successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};