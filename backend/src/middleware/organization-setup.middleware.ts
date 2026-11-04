import { Request, Response, NextFunction } from "express";
import { ApiError } from "../utils/api-error.js";
import { verifyOrganizationSetupToken } from "../utils/jwt.js";
import { extractBearerToken, toTokenError } from "./auth.middleware.js";

export interface OrganizationSetupRequest extends Request {
  user?: {
    userId: bigint;
    organizationId: bigint;
  };
}

export const authenticateOrganizationSetup = (
  req: OrganizationSetupRequest,
  _res: Response,
  next: NextFunction,
) => {
  try {
    const decoded = verifyOrganizationSetupToken(extractBearerToken(req));

    if (decoded.type !== "ORGANIZATION_SETUP") {
      throw new ApiError(
        403,
        "INVALID_TOKEN_TYPE",
        "Organization setup token is required",
      );
    }

    req.user = {
      userId: BigInt(decoded.userId),
      organizationId: BigInt(decoded.organizationId),
    };

    next();
  } catch (error) {
    next(toTokenError(error));
  }
};
