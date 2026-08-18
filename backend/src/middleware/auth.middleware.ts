import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { ApiError } from "../utils/api-error.js";

export interface AuthRequest extends Request {
  user?: {
    userId: bigint;
    organizationId: bigint;
    userOrganizationId: bigint;
  };
}

export const authenticate = (
  req: AuthRequest,
  _res: Response,
  next: NextFunction,
) => {
  try {
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

    const token = authHeader.substring(7);

    const secret = process.env.JWT_ACCESS_SECRET;

    if (!secret) {
      throw new Error("JWT_ACCESS_SECRET is not configured");
    }

    const decoded = jwt.verify(token, secret) as {
      userId: string;
      organizationId: string;
      userOrganizationId: string;
      type: string;
    };

    if (decoded.type !== "ACCESS") {
      throw new ApiError(
        403,
        "INVALID_TOKEN_TYPE",
        "This token cannot access this resource",
      );
    }

    req.user = {
      userId: BigInt(decoded.userId),
      organizationId: BigInt(decoded.organizationId),
      userOrganizationId: BigInt(decoded.userOrganizationId),
    };

    next();
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return next(
        new ApiError(
          401,
          "TOKEN_EXPIRED",
          "Session expired. Please login again.",
        ),
      );
    }

    if (error instanceof jwt.JsonWebTokenError) {
      return next(
        new ApiError(
          401,
          "INVALID_TOKEN",
          "Invalid or malformed authentication token.",
        ),
      );
    }

    next(error);
  }
};