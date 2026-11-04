import { NextFunction, Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import {
  deleteAccount,
  getPrivacySettings,
  getNotificationSettings,
  listOrganizations,
  updateNotificationSettings,
  setProfilePhoto,
  switchOrganization,
  updatePrivacySettings,
} from "./account.service.js";

export const listOrganizationsController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = await listOrganizations(
      req.user!.userId,
      req.user!.userOrganizationId,
    );

    return res.status(200).json({
      success: true,
      message: "Organizations fetched successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const switchOrganizationController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const target = String(req.body?.userOrganizationId ?? "");

    if (!/^\d{1,20}$/.test(target)) {
      throw new ApiError(400, "VALIDATION_ERROR", "userOrganizationId is required");
    }

    const data = await switchOrganization(req.user!, BigInt(target));

    return res.status(200).json({
      success: true,
      message: "Organization switched successfully",
      data,
    });
  } catch (error) {
    next(error);
  }
};

export const getPrivacyController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Privacy settings fetched successfully",
      data: await getPrivacySettings(req.user!.userOrganizationId),
    });
  } catch (error) {
    next(error);
  }
};

export const updatePrivacyController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Privacy settings updated successfully",
      data: await updatePrivacySettings(req.user!.userOrganizationId, req.body),
    });
  } catch (error) {
    next(error);
  }
};

export const deleteAccountController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    await deleteAccount(req.user!.userId, req.body?.confirmation);

    return res.status(200).json({
      success: true,
      message: "Account deleted",
    });
  } catch (error) {
    next(error);
  }
};

export const profilePhotoController = (remove: boolean) => async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    return res.status(200).json({
      success: true,
      message: remove ? "Profile photo removed" : "Profile photo updated",
      data: await setProfilePhoto(req.user!, remove ? null : req.body?.mediaId),
    });
  } catch (error) {
    next(error);
  }
};

export const notificationSettingsController = (update: boolean) => async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const data = update
      ? await updateNotificationSettings(req.user!.userOrganizationId, req.body)
      : await getNotificationSettings(req.user!.userOrganizationId);
    return res.status(200).json({ success: true, message: "Notification settings", data });
  } catch (error) {
    next(error);
  }
};
