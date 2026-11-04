import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error.js";
import {
  ProfileSetupTokenPayload,
  verifyProfileSetupToken,
} from "../utils/jwt.js";
import { extractBearerToken, toTokenError } from "./auth.middleware.js";

export interface ProfileSetupAuthRequest extends Request {
  profileSetup?: ProfileSetupTokenPayload;
}

// The verified phone number comes from this token, never from the request body.
export const authenticateProfileSetup = (
  req: ProfileSetupAuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const decoded = verifyProfileSetupToken(extractBearerToken(req));

    if (decoded.type !== "PROFILE_SETUP") {
      throw new ApiError(
        403,
        "INVALID_TOKEN_TYPE",
        "Profile setup token is required",
      );
    }

    req.profileSetup = decoded;

    next();
  } catch (error) {
    next(toTokenError(error));
  }
};
