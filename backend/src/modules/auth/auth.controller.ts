import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../middleware/auth.middleware.js";
import {
  SendOtpRequest,
  VerifyOtpRequest,
  validateSendOtpRequest,
  validateVerifyOtpRequest,
} from "./auth.validation.js";
import {
  sendOtp,
  verifyOtp,
} from "./auth.service.js";

export const sendOtpController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const body = req.body as SendOtpRequest;

    const validationError = validateSendOtpRequest(body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
        errorCode: "VALIDATION_ERROR",
      });
    }

    const result = await sendOtp(body);

    return res.status(200).json({
      success: true,
      message: "OTP sent successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const verifyOtpController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const body = req.body as VerifyOtpRequest;

    const validationError =
      validateVerifyOtpRequest(body);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
        errorCode: "VALIDATION_ERROR",
      });
    }

    const result = await verifyOtp(body);

    return res.status(200).json({
      success: true,
      message: "OTP verified successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};


export const getMeController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    return res.status(200).json({
      success: true,
      message: "Authenticated user",
      data: {
        userId: req.user!.userId.toString(),
        organizationId: req.user!.organizationId.toString(),
        userOrganizationId:
          req.user!.userOrganizationId.toString(),
      },
    });
  } catch (error) {
    next(error);
  }
};