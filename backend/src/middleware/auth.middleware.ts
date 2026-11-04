import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/api-error.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { getActiveSessionContext } from "../modules/auth/session.service.js";

export interface AuthRequest extends Request {
  user?: {
    userId: bigint;
    organizationId: bigint;
    userOrganizationId: bigint;
    sessionId: bigint;
  };
}

export const extractBearerToken = (req: Request) => {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    throw new ApiError(
      401,
      "TOKEN_REQUIRED",
      "Authorization token is required",
    );
  }

  if (!authHeader.startsWith("Bearer ")) {
    throw new ApiError(
      401,
      "INVALID_AUTH_HEADER",
      "Invalid authorization header",
    );
  }

  return authHeader.substring(7);
};

export const toTokenError = (error: unknown) => {
  if (error instanceof jwt.TokenExpiredError) {
    return new ApiError(
      401,
      "TOKEN_EXPIRED",
      "Session expired. Please login again.",
    );
  }

  if (error instanceof jwt.JsonWebTokenError) {
    return new ApiError(
      401,
      "INVALID_TOKEN",
      "Invalid or malformed authentication token.",
    );
  }

  return error;
};

/**
 * Accepts ACCESS tokens only. The session is checked on every request so that
 * logout, removal from an organization and account deletion apply immediately.
 */
export const authenticate = async (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const decoded = verifyAccessToken(extractBearerToken(req));

    if (decoded.type !== "ACCESS") {
      throw new ApiError(
        403,
        "INVALID_TOKEN_TYPE",
        "This token cannot access this resource",
      );
    }

    if (!decoded.sessionId) {
      throw new ApiError(
        401,
        "INVALID_TOKEN",
        "Invalid or malformed authentication token.",
      );
    }

    const session = await getActiveSessionContext(BigInt(decoded.sessionId));

    if (
      !session ||
      session.user_organization_id.toString() !== decoded.userOrganizationId
    ) {
      throw new ApiError(
        401,
        "SESSION_REVOKED",
        "Session expired. Please login again.",
      );
    }

    req.user = {
      userId: session.user_organization.user_id,
      organizationId: session.user_organization.org_id,
      userOrganizationId: session.user_organization_id,
      sessionId: session.session_id,
    };

    next();
  } catch (error) {
    next(toTokenError(error));
  }
};
