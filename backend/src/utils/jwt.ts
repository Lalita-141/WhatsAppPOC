import jwt from "jsonwebtoken";
import { env } from "../config/env.js";

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
const SETUP_TOKEN_TTL_SECONDS = 10 * 60;

const verifyOptions = { algorithms: ["HS256"] as jwt.Algorithm[] };

export interface AccessTokenPayload {
  userId: string;
  organizationId: string;
  userOrganizationId: string;
  sessionId: string;
  type: "ACCESS";
}

export interface ProfileSetupTokenPayload {
  orgId: string;
  countryId: string;
  mobileNo: string;
  type: "PROFILE_SETUP";
}

export interface OrganizationSetupTokenPayload {
  userId: string;
  organizationId: string;
  type: "ORGANIZATION_SETUP";
}

export const generateAccessToken = (
  payload: AccessTokenPayload,
) => {
  return jwt.sign(payload, env.jwtAccessSecret, {
    algorithm: "HS256",
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  });
};

export const generateProfileSetupToken = (
  payload: ProfileSetupTokenPayload,
) => {
  return jwt.sign(
    payload,
    env.jwtProfileSetupSecret,
    {
      algorithm: "HS256",
      expiresIn: SETUP_TOKEN_TTL_SECONDS,
    },
  );
};

export const generateOrganizationSetupToken = (
  payload: OrganizationSetupTokenPayload,
) => {
  return jwt.sign(
    payload,
    env.jwtAccessSecret,
    {
      algorithm: "HS256",
      expiresIn: SETUP_TOKEN_TTL_SECONDS,
    },
  );
};

export const verifyAccessToken = (token: string) =>
  jwt.verify(token, env.jwtAccessSecret, verifyOptions) as AccessTokenPayload;

export const verifyProfileSetupToken = (token: string) =>
  jwt.verify(
    token,
    env.jwtProfileSetupSecret,
    verifyOptions,
  ) as ProfileSetupTokenPayload;

export const verifyOrganizationSetupToken = (token: string) =>
  jwt.verify(
    token,
    env.jwtAccessSecret,
    verifyOptions,
  ) as OrganizationSetupTokenPayload;
