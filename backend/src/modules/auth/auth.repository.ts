import prisma from "../../config/database.js";


export const findOrganizationByCode = async (orgCode: string) => {
  return await prisma.organization_master.findFirst({
    where: {
      org_code: orgCode,
      deleted_at: null,
    },
  });
};

export const findCountryById = async (countryId: bigint) => {
  return await prisma.country_master.findFirst({
    where: {
      country_id: countryId,
      is_active: true,
      deleted_at: null,
    },
  });
};

export const createOtp = async (data: {
  orgId: bigint;
  countryCode: string;
  mobileNo: string;
  otp: string;
  expiresAt: Date;
}) => {
  return await prisma.register_otp.create({
    data: {
      org_id: data.orgId,
      country_code: data.countryCode,
      mobile_no: data.mobileNo,
      otp: data.otp,
      expires_at: data.expiresAt,
    },
  });
};

export const findLatestOtp = async (data: {
  orgId: bigint;
  countryCode: string;
  mobileNo: string;
}) => {
  return await prisma.register_otp.findFirst({
    where: {
      org_id: data.orgId,
      country_code: data.countryCode,
      mobile_no: data.mobileNo,
      deleted_at: null,
    },
    orderBy: {
      created_at: "desc",
    },
  });
};

export const countRecentOtpRequests = async (data: {
  orgId: bigint;
  countryCode: string;
  mobileNo: string;
  since: Date;
}) => {
  return await prisma.register_otp.count({
    where: {
      org_id: data.orgId,
      country_code: data.countryCode,
      mobile_no: data.mobileNo,
      created_at: {
        gte: data.since,
      },
      deleted_at: null,
    },
  });
};

export const updateOtpAttempt = async (
  otpId: bigint,
  trailCount: number,
  blockTime: Date | null,
) => {
  return await prisma.register_otp.update({
    where: {
      register_otp_id: otpId,
    },
    data: {
      trail_count: trailCount,
      block_time: blockTime,
      updated_at: new Date(),
    },
  });
};

export const validateOtp = async (otpId: bigint) => {
  return await prisma.register_otp.update({
    where: {
      register_otp_id: otpId,
    },
    data: {
      is_validated: true,
      updated_at: new Date(),
    },
  });
};

export const findUserByMobile = async (mobileNo: string) => {
  return await prisma.user_master.findFirst({
    where: {
      mobile_no: mobileNo,
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


export const expirePreviousOtps = async (data: {
  orgId: bigint;
  countryCode: string;
  mobileNo: string;
}) => {
  return await prisma.register_otp.updateMany({
    where: {
      org_id: data.orgId,
      country_code: data.countryCode,
      mobile_no: data.mobileNo,
      is_validated: false,
      deleted_at: null,
    },
    data: {
      expires_at: new Date(),
      updated_at: new Date(),
    },
  });
};