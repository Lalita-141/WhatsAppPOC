import {
  Request,
  Response,
  NextFunction,
} from "express";

import { ApiError } from "../../utils/api-error.js";

import { profileSetup, getMyProfile, updateProfile } from "./user.service.js";

import {
  validateProfileSetupRequest,
  validateProfileUpdateRequest,
} from "./user.validation.js";
import { AuthRequest } from "../../middleware/auth.middleware.js";

export const profileSetupController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const validationError =
      validateProfileSetupRequest(req.body);

    if (validationError) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        validationError,
      );
    }

    const result = await profileSetup(req.body);

    return res.status(201).json({
      success: true,
      message: "Profile created successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const getMyProfileController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction) => {
  try {
    const userId = req.user?.userId.toString();
    console.log("userId", userId);
    if (!userId) {
      throw new ApiError(
        401,
        "AUTH_REQUIRED",
        "Authentication required",
      );
    }


    const result = await getMyProfile(userId);

    return res.status(200).json({
      success: true,
      message: "Profile fetched successfully",
      data: result,
    })


  } catch (error) {
    next(error);
  }
}

// 
export const updateProfileController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    const userId = req.user?.userId.toString();
    if (!userId) {
      throw new ApiError(
        401,
        "AUTH_REQUIRED",
        "Authentication required",
      );

    }
console.log("updateProfileController req.body", req.body);
    const validationError = validateProfileUpdateRequest(req.body);

    if (validationError) {
      throw new ApiError(
        400,
        "VALIDATION_ERROR",
        validationError,
      );
    }

    const result = await updateProfile(userId, req.body);

    return res.status(200).json({
      success: true,
      message: "Profile updated successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};