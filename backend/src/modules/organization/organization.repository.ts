import prisma from "../../config/database.js";

export const findOrganizationByCode = async (
  orgCode: string,
) => {
  return await prisma.organization_master.findFirst({
    where: {
      org_code: orgCode,
      deleted_at: null,
    },
  });
};

// Includes removed memberships, so a removed member cannot rejoin by OTP.
export const findUserOrganization = async (
  userId: bigint,
  orgId: bigint,
) => {
  return await prisma.user_organization.findFirst({
    where: {
      user_id: userId,
      org_id: orgId,
    },
  });
};

export const createUserOrganization = async (data: {
  userId: bigint;
  orgId: bigint;
  role: string;
}) => {
  return await prisma.$transaction(async (tx) => {
    const userOrganization = await tx.user_organization.create({
      data: {
        user_id: data.userId,
        org_id: data.orgId,
        role: data.role,
      },
    });

    await tx.user_setting.create({
      data: {
        user_organization_id: userOrganization.user_organization_id,
      },
    });

    await tx.conversation_state.create({
      data: {
        owner_user_organization_id: userOrganization.user_organization_id,
        peer_user_organization_id: userOrganization.user_organization_id,
      },
    });

    return userOrganization;
  });
};
