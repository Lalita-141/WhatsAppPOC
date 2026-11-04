import { Request, Response, NextFunction } from "express";
import { AuthRequest } from "../../middleware/auth.middleware.js";
import {
  SendOtpRequest,
  VerifyOtpRequest,
  validateSendOtpRequest,
  validateVerifyOtpRequest,
  validateRefreshRequest,
} from "./auth.validation.js";
import {
  sendOtp,
  verifyOtp,
} from "./auth.service.js";
import {
  listSessions,
  logoutAllDevices,
  refreshSession,
  revokeByRefreshToken,
  revokeOwnedSession,
  revokeSessions,
} from "./session.service.js";
import { ApiError } from "../../utils/api-error.js";

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

export const refreshController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const validationError = validateRefreshRequest(req.body);

    if (validationError) {
      throw new ApiError(400, "VALIDATION_ERROR", validationError);
    }

    const result = await refreshSession(req.body.refreshToken);

    return res.status(200).json({
      success: true,
      message: "Session refreshed successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const revokeRefreshTokenController = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const validationError = validateRefreshRequest(req.body);

    if (validationError) {
      throw new ApiError(400, "VALIDATION_ERROR", validationError);
    }

    await revokeByRefreshToken(req.body.refreshToken);

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const logoutController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    await revokeSessions([req.user!.sessionId], "LOGOUT");

    return res.status(200).json({
      success: true,
      message: "Logged out successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const logoutAllController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    await logoutAllDevices(req.user!.userId);

    return res.status(200).json({
      success: true,
      message: "Logged out from all devices",
    });
  } catch (error) {
    next(error);
  }
};

export const listSessionsController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const result = await listSessions(
      req.user!.userOrganizationId,
      req.user!.sessionId,
    );

    return res.status(200).json({
      success: true,
      message: "Sessions fetched successfully",
      data: result,
    });
  } catch (error) {
    next(error);
  }
};

export const revokeSessionController = async (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  try {
    const sessionId = String(req.params.sessionId);

    if (!/^\d{1,20}$/.test(sessionId)) {
      throw new ApiError(404, "SESSION_NOT_FOUND", "Session not found");
    }

    await revokeOwnedSession(
      BigInt(sessionId),
      req.user!.userOrganizationId,
    );

    return res.status(200).json({
      success: true,
      message: "Session revoked successfully",
    });
  } catch (error) {
    next(error);
  }
};
