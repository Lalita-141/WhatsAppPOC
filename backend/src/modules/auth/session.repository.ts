import prisma from "../../config/database.js";

const activeSessionWhere = () => ({
  revoked_at: null,
  expires_at: {
    gt: new Date(),
  },
  user_organization: {
    deleted_at: null,
    user_master: {
      deleted_at: null,
    },
    organization_master: {
      deleted_at: null,
    },
  },
});

const sessionContextSelect = {
  session_id: true,
  user_organization_id: true,
  refresh_token_hash: true,
  rotated_at: true,
  user_organization: {
    select: {
      user_id: true,
      org_id: true,
    },
  },
} as const;

export const createSessionRecord = async (data: {
  userOrganizationId: bigint;
  refreshTokenHash: string;
  expiresAt: Date;
  deviceType?: string;
  deviceName?: string;
}) => {
  return await prisma.user_session.create({
    data: {
      user_organization_id: data.userOrganizationId,
      refresh_token_hash: data.refreshTokenHash,
      expires_at: data.expiresAt,
      device_type: data.deviceType,
      device_name: data.deviceName,
    },
  });
};

export const deleteExpiredSessions = async (
  userOrganizationId: bigint,
) => {
  return await prisma.user_session.deleteMany({
    where: {
      user_organization_id: userOrganizationId,
      expires_at: {
        lt: new Date(),
      },
    },
  });
};

export const findActiveSessionById = async (sessionId: bigint) => {
  return await prisma.user_session.findFirst({
    where: {
      session_id: sessionId,
      ...activeSessionWhere(),
    },
    select: sessionContextSelect,
  });
};

export const findActiveSessionByRefreshHash = async (
  refreshTokenHash: string,
) => {
  return await prisma.user_session.findFirst({
    where: {
      refresh_token_hash: refreshTokenHash,
      ...activeSessionWhere(),
    },
    select: sessionContextSelect,
  });
};

export const findActiveSessionByPreviousHash = async (
  refreshTokenHash: string,
) => {
  return await prisma.user_session.findFirst({
    where: {
      previous_refresh_token_hash: refreshTokenHash,
      ...activeSessionWhere(),
    },
    select: sessionContextSelect,
  });
};

// Conditional on the current hash, so concurrent refreshes cannot both win.
export const rotateSessionRefreshHash = async (data: {
  sessionId: bigint;
  currentHash: string;
  newHash: string;
  expiresAt: Date;
}) => {
  const now = new Date();

  const result = await prisma.user_session.updateMany({
    where: {
      session_id: data.sessionId,
      refresh_token_hash: data.currentHash,
      revoked_at: null,
    },
    data: {
      refresh_token_hash: data.newHash,
      previous_refresh_token_hash: data.currentHash,
      rotated_at: now,
      last_used_at: now,
      expires_at: data.expiresAt,
    },
  });

  return result.count === 1;
};

export const findSessionIdByAnyRefreshHash = async (
  refreshTokenHash: string,
) => {
  return await prisma.user_session.findFirst({
    where: {
      revoked_at: null,
      OR: [
        { refresh_token_hash: refreshTokenHash },
        { previous_refresh_token_hash: refreshTokenHash },
      ],
    },
    select: {
      session_id: true,
    },
  });
};

export const findSessionsByUserOrganization = async (
  userOrganizationId: bigint,
) => {
  return await prisma.user_session.findMany({
    where: {
      user_organization_id: userOrganizationId,
      ...activeSessionWhere(),
    },
    orderBy: {
      last_used_at: "desc",
    },
    take: 100,
    select: {
      session_id: true,
      device_type: true,
      device_name: true,
      created_at: true,
      last_used_at: true,
      expires_at: true,
    },
  });
};

export const findOwnedActiveSessionId = async (
  sessionId: bigint,
  userOrganizationId: bigint,
) => {
  return await prisma.user_session.findFirst({
    where: {
      session_id: sessionId,
      user_organization_id: userOrganizationId,
      revoked_at: null,
    },
    select: {
      session_id: true,
    },
  });
};

export const findActiveSessionIdsByUser = async (userId: bigint) => {
  const sessions = await prisma.user_session.findMany({
    where: {
      revoked_at: null,
      user_organization: {
        user_id: userId,
      },
    },
    select: {
      session_id: true,
    },
  });

  return sessions.map((session) => session.session_id);
};

// Revokes sessions and removes their push tokens in one transaction, so a
// logged-out device stops receiving message notifications.
export const revokeSessionRecords = async (
  sessionIds: bigint[],
  reason: string,
) => {
  if (sessionIds.length === 0) {
    return;
  }

  await prisma.$transaction([
    prisma.user_device.deleteMany({
      where: {
        session_id: {
          in: sessionIds,
        },
      },
    }),
    prisma.user_session.updateMany({
      where: {
        session_id: {
          in: sessionIds,
        },
        revoked_at: null,
      },
      data: {
        revoked_at: new Date(),
        revoke_reason: reason,
      },
    }),
  ]);
};
