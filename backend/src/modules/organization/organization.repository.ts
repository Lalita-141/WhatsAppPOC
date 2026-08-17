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

export const findUserOrganization = async (
  userId: bigint,
  orgId: bigint,
) => {
  return await prisma.user_organization.findFirst({
    where: {
      user_id: userId,
      org_id: orgId,
      deleted_at: null,
    },
  });
};

export const createUserOrganization = async (data: {
  userId: bigint;
  orgId: bigint;
  role: string;
}) => {
  return await prisma.user_organization.create({
    data: {
      user_id: data.userId,
      org_id: data.orgId,
      role: data.role,
    },
  });
};