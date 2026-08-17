import prisma from "../../config/database.js";

export const findUserByMobile = async (mobileNo: string) => {
  return await prisma.user_master.findFirst({
    where: {
      mobile_no: mobileNo,
      deleted_at: null,
    },
  });
};

export const createUser = async (
  tx: any,
  data: {
    firstName: string;
    lastName?: string;
    mobileNo: string;
    about?: string;
  },
) => {
  return await tx.user_master.create({
    data: {
      first_name: data.firstName,
      last_name: data.lastName || null,
      mobile_no: data.mobileNo,
      about: data.about || null,
    },
  });
};

export const createUserOrganization = async (
  tx: any,
  data: {
    userId: bigint;
    orgId: bigint;
  },
) => {
  return await tx.user_organization.create({
    data: {
      user_id: data.userId,
      org_id: data.orgId,
      role: "USER",
    },
  });
};

export const createUserSetting = async (
  tx: any,
  userOrganizationId: bigint,
) => {
  return await tx.user_setting.create({
    data: {
      user_organization_id: userOrganizationId,
    },
  });
};

export const getUserById = async (userId: string) => {
  const user = await prisma.user_master.findUnique({
    where: {
      user_id: BigInt(userId),
    },
  });
  return user;
}