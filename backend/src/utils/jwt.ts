import jwt from "jsonwebtoken";

const accessSecret = process.env.JWT_ACCESS_SECRET;
const profileSetupSecret =
  process.env.JWT_PROFILE_SETUP_SECRET;

if (!accessSecret) {
  throw new Error(
    "JWT_ACCESS_SECRET is not configured",
  );
}

if (!profileSetupSecret) {
  throw new Error(
    "JWT_PROFILE_SETUP_SECRET is not configured",
  );
}

export interface AccessTokenPayload {
  userId: string;
  organizationId: string;
  userOrganizationId: string;
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
  return jwt.sign(payload, accessSecret, {
    expiresIn: "15m",
  });
};

export const generateProfileSetupToken = (
  payload: ProfileSetupTokenPayload,
) => {
  return jwt.sign(
    payload,
    profileSetupSecret,
    {
      expiresIn: "10m",
    },
  );
};

export const generateOrganizationSetupToken = (
  payload: OrganizationSetupTokenPayload,
) => {
  return jwt.sign(
    payload,
    accessSecret,
    {
      expiresIn: "10m",
    },
  );
};