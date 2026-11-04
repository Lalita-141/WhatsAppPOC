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

export const findLatestUnusedOtp = async (data: {
  orgId: bigint;
  countryCode: string;
  mobileNo: string;
}) => {
  return await prisma.register_otp.findFirst({
    where: {
      org_id: data.orgId,
      country_code: data.countryCode,
      mobile_no: data.mobileNo,
      is_validated: false,
      deleted_at: null,
    },
    orderBy: {
      register_otp_id: "desc",
    },
  });
};

// Limits below are per phone across all organizations, so trying another
// organization code does not give an attacker a fresh allowance.
export const findLatestOtpForPhone = async (data: {
  countryCode: string;
  mobileNo: string;
}) => {
  return await prisma.register_otp.findFirst({
    where: {
      country_code: data.countryCode,
      mobile_no: data.mobileNo,
      deleted_at: null,
    },
    orderBy: {
      register_otp_id: "desc",
    },
  });
};

export const findActiveOtpBlock = async (data: {
  countryCode: string;
  mobileNo: string;
}) => {
  return await prisma.register_otp.findFirst({
    where: {
      country_code: data.countryCode,
      mobile_no: data.mobileNo,
      block_time: {
        gt: new Date(),
      },
      deleted_at: null,
    },
    select: {
      register_otp_id: true,
    },
  });
};

export const countRecentOtpRequests = async (data: {
  countryCode: string;
  mobileNo: string;
  since: Date;
}) => {
  return await prisma.register_otp.count({
    where: {
      country_code: data.countryCode,
      mobile_no: data.mobileNo,
      created_at: {
        gte: data.since,
      },
      deleted_at: null,
    },
  });
};

// Reserves one attempt before the code is compared, so parallel guesses cannot
// exceed the limit. Returns false once no attempts remain.
export const reserveOtpAttempt = async (
  otpId: bigint,
  maxAttempts: number,
) => {
  const result = await prisma.register_otp.updateMany({
    where: {
      register_otp_id: otpId,
      trail_count: {
        lt: maxAttempts,
      },
    },
    data: {
      trail_count: {
        increment: 1,
      },
      updated_at: new Date(),
    },
  });

  return result.count === 1;
};

export const getOtpAttemptCount = async (otpId: bigint) => {
  const otp = await prisma.register_otp.findUnique({
    where: {
      register_otp_id: otpId,
    },
    select: {
      trail_count: true,
    },
  });

  return otp?.trail_count ?? 0;
};

export const blockOtp = async (otpId: bigint, blockTime: Date) => {
  return await prisma.register_otp.update({
    where: {
      register_otp_id: otpId,
    },
    data: {
      block_time: blockTime,
      updated_at: new Date(),
    },
  });
};

// Single use: only one caller can move the row from unused to used.
export const consumeOtp = async (otpId: bigint) => {
  const result = await prisma.register_otp.updateMany({
    where: {
      register_otp_id: otpId,
      is_validated: false,
    },
    data: {
      is_validated: true,
      updated_at: new Date(),
    },
  });

  return result.count === 1;
};

export const expireOtp = async (otpId: bigint) => {
  return await prisma.register_otp.update({
    where: {
      register_otp_id: otpId,
    },
    data: {
      expires_at: new Date(),
      updated_at: new Date(),
    },
  });
};

export const findUserByMobile = async (
  countryCode: string,
  mobileNo: string,
) => {
  return await prisma.user_master.findFirst({
    where: {
      country_code: countryCode,
      mobile_no: mobileNo,
      deleted_at: null,
    },
  });
};

// Includes removed memberships, so the caller can refuse them by name.
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


export const expirePreviousOtps = async (data: {
  countryCode: string;
  mobileNo: string;
}) => {
  return await prisma.register_otp.updateMany({
    where: {
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
