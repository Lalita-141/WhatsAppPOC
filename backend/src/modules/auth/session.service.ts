import crypto from "crypto";
import { ApiError } from "../../utils/api-error.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  ACCESS_TOKEN_TTL_SECONDS,
  generateAccessToken,
} from "../../utils/jwt.js";
import { disconnectSessions } from "../../socket/socket.registry.js";
import {
  createSessionRecord,
  deleteExpiredSessions,
  findActiveSessionById,
  findActiveSessionByPreviousHash,
  findActiveSessionByRefreshHash,
  findActiveSessionIdsByUser,
  findOwnedActiveSessionId,
  findSessionIdByAnyRefreshHash,
  findSessionsByUserOrganization,
  revokeSessionRecords,
  rotateSessionRefreshHash,
} from "./session.repository.js";

// A lost refresh response must not log the user out, so the previous token
// stays usable briefly. Any later use of it is treated as theft.
const REFRESH_RETRY_GRACE_MS = 15 * 1000;

export interface DeviceInfo {
  deviceType?: string;
  deviceName?: string;
}

const hashRefreshToken = (refreshToken: string) =>
  crypto.createHash("sha256").update(refreshToken).digest("hex");

const newRefreshToken = () => crypto.randomBytes(48).toString("base64url");

const refreshExpiry = () =>
  new Date(
    Date.now() + env.refreshTokenTtlDays * 24 * 60 * 60 * 1000,
  );

const invalidRefreshToken = () =>
  new ApiError(
    401,
    "INVALID_REFRESH_TOKEN",
    "Session expired. Please login again.",
  );

const buildTokenResponse = (
  session: {
    userId: bigint;
    organizationId: bigint;
    userOrganizationId: bigint;
    sessionId: bigint;
  },
  refreshToken: string,
) => ({
  token: generateAccessToken({
    userId: session.userId.toString(),
    organizationId: session.organizationId.toString(),
    userOrganizationId: session.userOrganizationId.toString(),
    sessionId: session.sessionId.toString(),
    type: "ACCESS",
  }),
  refreshToken,
  expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  sessionId: session.sessionId.toString(),
});

export const createSession = async (
  membership: {
    userId: bigint;
    organizationId: bigint;
    userOrganizationId: bigint;
  },
  device: DeviceInfo = {},
) => {
  await deleteExpiredSessions(membership.userOrganizationId);

  const refreshToken = newRefreshToken();

  const session = await createSessionRecord({
    userOrganizationId: membership.userOrganizationId,
    refreshTokenHash: hashRefreshToken(refreshToken),
    expiresAt: refreshExpiry(),
    deviceType: device.deviceType,
    deviceName: device.deviceName,
  });

  return buildTokenResponse(
    {
      ...membership,
      sessionId: session.session_id,
    },
    refreshToken,
  );
};

export const refreshSession = async (refreshToken: string) => {
  const presentedHash = hashRefreshToken(refreshToken);

  const session =
    (await findActiveSessionByRefreshHash(presentedHash)) ??
    (await resolveRotatedToken(presentedHash));

  const nextRefreshToken = newRefreshToken();

  const rotated = await rotateSessionRefreshHash({
    sessionId: session.session_id,
    currentHash: session.refresh_token_hash,
    newHash: hashRefreshToken(nextRefreshToken),
    expiresAt: refreshExpiry(),
  });

  if (!rotated) {
    throw invalidRefreshToken();
  }

  return buildTokenResponse(
    {
      userId: session.user_organization.user_id,
      organizationId: session.user_organization.org_id,
      userOrganizationId: session.user_organization_id,
      sessionId: session.session_id,
    },
    nextRefreshToken,
  );
};

const resolveRotatedToken = async (presentedHash: string) => {
  const session = await findActiveSessionByPreviousHash(presentedHash);

  if (!session) {
    throw invalidRefreshToken();
  }

  const rotatedAgo = session.rotated_at
    ? Date.now() - session.rotated_at.getTime()
    : Number.POSITIVE_INFINITY;

  if (rotatedAgo <= REFRESH_RETRY_GRACE_MS) {
    return session;
  }

  logger.warn(
    { sessionId: session.session_id.toString() },
    "Rotated refresh token reused; revoking session",
  );

  await revokeSessions([session.session_id], "REFRESH_TOKEN_REUSED");

  throw new ApiError(
    401,
    "REFRESH_TOKEN_REUSED",
    "Session expired. Please login again.",
  );
};

export const revokeSessions = async (
  sessionIds: bigint[],
  reason: string,
) => {
  await revokeSessionRecords(sessionIds, reason);
  disconnectSessions(sessionIds);
};

// Lets a device log out even when its 15-minute access token has expired.
// Holding the refresh token proves ownership, and the outcome is not revealed.
export const revokeByRefreshToken = async (refreshToken: string) => {
  const session = await findSessionIdByAnyRefreshHash(
    hashRefreshToken(refreshToken),
  );

  if (session) {
    await revokeSessions([session.session_id], "LOGOUT");
  }
};

export const logoutAllDevices = async (userId: bigint) => {
  await revokeSessions(
    await findActiveSessionIdsByUser(userId),
    "LOGOUT_ALL",
  );
};

export const listSessions = async (
  userOrganizationId: bigint,
  currentSessionId: bigint,
) => {
  const sessions = await findSessionsByUserOrganization(
    userOrganizationId,
  );

  return sessions.map((session) => ({
    sessionId: session.session_id.toString(),
    deviceType: session.device_type,
    deviceName: session.device_name,
    createdAt: session.created_at,
    lastUsedAt: session.last_used_at,
    expiresAt: session.expires_at,
    isCurrent: session.session_id === currentSessionId,
  }));
};

export const revokeOwnedSession = async (
  sessionId: bigint,
  userOrganizationId: bigint,
) => {
  const session = await findOwnedActiveSessionId(
    sessionId,
    userOrganizationId,
  );

  // Same response for "not yours" and "does not exist".
  if (!session) {
    throw new ApiError(404, "SESSION_NOT_FOUND", "Session not found");
  }

  await revokeSessions([session.session_id], "USER_REVOKED");
};

export const getActiveSessionContext = async (sessionId: bigint) => {
  return await findActiveSessionById(sessionId);
};
