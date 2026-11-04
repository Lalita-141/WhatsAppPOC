import prisma from "../../config/database.js";

export const findActiveMemberships = async (userId: bigint) => {
  return await prisma.user_organization.findMany({
    where: {
      user_id: userId,
      deleted_at: null,
      organization_master: {
        deleted_at: null,
      },
    },
    orderBy: {
      user_organization_id: "asc",
    },
    select: {
      user_organization_id: true,
      org_id: true,
      role: true,
      organization_master: {
        select: {
          org_code: true,
          organization_name: true,
        },
      },
    },
  });
};

export const findActiveMembershipOfUser = async (
  userOrganizationId: bigint,
  userId: bigint,
) => {
  return await prisma.user_organization.findFirst({
    where: {
      user_organization_id: userOrganizationId,
      user_id: userId,
      deleted_at: null,
      organization_master: {
        deleted_at: null,
      },
    },
    select: {
      user_organization_id: true,
      org_id: true,
    },
  });
};

export const findSessionDevice = async (sessionId: bigint) => {
  return await prisma.user_session.findUnique({
    where: {
      session_id: sessionId,
    },
    select: {
      device_type: true,
      device_name: true,
    },
  });
};

export const findPrivacySettings = async (userOrganizationId: bigint) => {
  return await prisma.user_setting.findUnique({
    where: {
      user_organization_id: userOrganizationId,
    },
  });
};

export const upsertPrivacySettings = async (
  userOrganizationId: bigint,
  data: Record<string, string | boolean>,
) => {
  return await prisma.user_setting.upsert({
    where: {
      user_organization_id: userOrganizationId,
    },
    create: {
      user_organization_id: userOrganizationId,
      ...data,
    },
    update: {
      ...data,
      updated_at: new Date(),
      updated_by: userOrganizationId,
    },
  });
};

// The phone number is replaced with a value no real number can take, so the
// number can register again as a new account. Messages stay with the people who
// received them, and the account can no longer sign in.
export const deleteAccountRecords = async (userId: bigint) => {
  const now = new Date();

  return await prisma.$transaction(async (tx) => {
    const memberships = await tx.user_organization.findMany({
      where: { user_id: userId },
      select: { user_organization_id: true },
    });
    const membershipIds = memberships.map((m) => m.user_organization_id);

    await tx.user_device.deleteMany({
      where: { user_organization_id: { in: membershipIds } },
    });

    await tx.user_session.updateMany({
      where: {
        user_organization_id: { in: membershipIds },
        revoked_at: null,
      },
      data: {
        revoked_at: now,
        revoke_reason: "ACCOUNT_DELETED",
      },
    });

    await tx.user_organization.updateMany({
      where: { user_id: userId, deleted_at: null },
      data: { deleted_at: now, deleted_by: userId },
    });

    await tx.user_master.update({
      where: { user_id: userId },
      data: {
        first_name: "Deleted",
        last_name: null,
        about: null,
        profile_photo: null,
        mobile_no: `deleted-${userId}`,
        deleted_at: now,
        deleted_by: userId,
      },
    });

    return membershipIds;
  });
};

export const findSessionIdsOfMemberships = async (membershipIds: bigint[]) => {
  const sessions = await prisma.user_session.findMany({
    where: {
      user_organization_id: { in: membershipIds },
      revoke_reason: "ACCOUNT_DELETED",
    },
    select: { session_id: true },
  });

  return sessions.map((session) => session.session_id);
};
