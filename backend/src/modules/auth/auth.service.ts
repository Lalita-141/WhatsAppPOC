import crypto from "crypto";
import { ApiError } from "../../utils/api-error.js";
import { env } from "../../config/env.js";
import { logger } from "../../config/logger.js";
import {
  findCountryById,
  findOrganizationByCode,
  createOtp,
  findLatestUnusedOtp,
  findLatestOtpForPhone,
  findActiveOtpBlock,
  countRecentOtpRequests,
  reserveOtpAttempt,
  getOtpAttemptCount,
  blockOtp,
  consumeOtp,
  expireOtp,
  findUserByMobile,
  findUserOrganization,
  expirePreviousOtps,
} from "./auth.repository.js";

import {
  generateProfileSetupToken,
  generateOrganizationSetupToken,
} from "../../utils/jwt.js";

import { normalizePhoneForCountry } from "../../utils/phone.js";
import { sendOtpSms } from "../sms/sms.service.js";
import { createSession } from "./session.service.js";

interface SendOtpInput {
  orgCode: string;
  countryId: string;
  mobileNo: string;
}

interface VerifyOtpInput {
  orgCode: string;
  countryId: string;
  mobileNo: string;
  otp: string;
  deviceType?: string;
  deviceName?: string;
}

const OTP_EXPIRY_MINUTES = 5;
const OTP_COOLDOWN_SECONDS = 60;
const MAX_OTP_REQUESTS_PER_15_MINUTES = 5;
const MAX_OTP_REQUESTS_PER_DAY = 20;
const MAX_ATTEMPTS = 5;
const BLOCK_MINUTES = 15;

const generateOtp = (): string => {
  return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
};

// Bound to the phone and organization, so a stored hash is useless elsewhere.
const hashOtp = (
  orgId: bigint,
  countryCode: string,
  mobileNo: string,
  otp: string,
) => {
  return crypto
    .createHmac("sha256", env.otpHashSecret)
    .update(`${orgId}:${countryCode}:${mobileNo}:${otp}`)
    .digest("hex");
};

const otpMatches = (expectedHash: string, actualHash: string) => {
  const expected = Buffer.from(expectedHash);
  const actual = Buffer.from(actualHash);

  return (
    expected.length === actual.length &&
    crypto.timingSafeEqual(expected, actual)
  );
};

const otpBlockedError = (message: string) =>
  new ApiError(429, "OTP_BLOCKED", message);

const resolveLoginTarget = async (input: SendOtpInput) => {
  const organization = await findOrganizationByCode(input.orgCode);

  if (!organization) {
    throw new ApiError(
      404,
      "ORGANIZATION_NOT_FOUND",
      "Organization not found",
    );
  }

  const country = await findCountryById(BigInt(input.countryId));

  if (!country) {
    throw new ApiError(
      404,
      "COUNTRY_NOT_FOUND",
      "Country not found",
    );
  }

  const phone = normalizePhoneForCountry(input.mobileNo, country.iso_code);

  return {
    organization,
    country,
    phone,
    phoneScope: {
      countryCode: country.country_code,
      mobileNo: phone.nationalNumber,
    },
  };
};

export const sendOtp = async (input: SendOtpInput) => {
  const { organization, phone, phoneScope } =
    await resolveLoginTarget(input);

  const now = new Date();

  // --------------------------------------------------
  // 1. A blocked number stays blocked until the block ends
  // --------------------------------------------------

  if (await findActiveOtpBlock(phoneScope)) {
    throw otpBlockedError(
      "Too many incorrect attempts. Please try again later.",
    );
  }

  // --------------------------------------------------
  // 2. Check 60-second cooldown
  // --------------------------------------------------

  const latestOtp = await findLatestOtpForPhone(phoneScope);

  if (latestOtp) {
    const secondsSinceLastRequest =
      (now.getTime() - latestOtp.created_at.getTime()) / 1000;

    if (secondsSinceLastRequest < OTP_COOLDOWN_SECONDS) {
      // created_at can round up to the next second, so the elapsed time can be
      // slightly negative right after a request.
      const remainingSeconds = Math.min(
        OTP_COOLDOWN_SECONDS,
        Math.ceil(OTP_COOLDOWN_SECONDS - secondsSinceLastRequest),
      );

      throw new ApiError(
        429,
        "OTP_COOLDOWN",
        `Please wait ${remainingSeconds} seconds before requesting another OTP.`,
      );
    }
  }

  // --------------------------------------------------
  // 3. Check request limits
  // --------------------------------------------------

  const recentOtpRequests = await countRecentOtpRequests({
    ...phoneScope,
    since: new Date(now.getTime() - 15 * 60 * 1000),
  });

  const dailyOtpRequests = await countRecentOtpRequests({
    ...phoneScope,
    since: new Date(now.getTime() - 24 * 60 * 60 * 1000),
  });

  if (
    recentOtpRequests >= MAX_OTP_REQUESTS_PER_15_MINUTES ||
    dailyOtpRequests >= MAX_OTP_REQUESTS_PER_DAY
  ) {
    throw new ApiError(
      429,
      "OTP_REQUEST_LIMIT_EXCEEDED",
      "Too many OTP requests. Please try again later.",
    );
  }

  // --------------------------------------------------
  // 4. Expire previous OTPs
  // --------------------------------------------------

  await expirePreviousOtps(phoneScope);

  // --------------------------------------------------
  // 5. Generate and save the new OTP
  // --------------------------------------------------

  const otp = generateOtp();

  const savedOtp = await createOtp({
    orgId: organization.org_id,
    countryCode: phoneScope.countryCode,
    mobileNo: phoneScope.mobileNo,
    otp: hashOtp(
      organization.org_id,
      phoneScope.countryCode,
      phoneScope.mobileNo,
      otp,
    ),
    expiresAt: new Date(now.getTime() + OTP_EXPIRY_MINUTES * 60 * 1000),
  });

  // --------------------------------------------------
  // 6. Deliver it
  // --------------------------------------------------

  try {
    await sendOtpSms(phone.e164, otp, OTP_EXPIRY_MINUTES);
  } catch (error) {
    await expireOtp(savedOtp.register_otp_id);

    logger.error(
      { errorMessage: error instanceof Error ? error.message : "unknown" },
      "OTP SMS delivery failed",
    );

    throw new ApiError(
      502,
      "SMS_DELIVERY_FAILED",
      "Could not send the verification code. Please try again.",
    );
  }

  return {
    expiresIn: OTP_EXPIRY_MINUTES * 60,
    otpLength: 6,
    // loadEnv refuses OTP_DEV_ECHO when NODE_ENV=production.
    ...(env.otpDevEcho && !env.isProduction ? { otp } : {}),
  };
};

export const verifyOtp = async (input: VerifyOtpInput) => {
  const { organization, phoneScope } = await resolveLoginTarget(input);

  // Check whether this number is currently blocked
  if (await findActiveOtpBlock(phoneScope)) {
    throw otpBlockedError(
      "Too many incorrect attempts. Please try again later.",
    );
  }

  const otpRecord = await findLatestUnusedOtp({
    orgId: organization.org_id,
    ...phoneScope,
  });

  if (!otpRecord) {
    throw new ApiError(
      400,
      "OTP_NOT_FOUND",
      "OTP not found or already used",
    );
  }

  // Check OTP expiry
  if (otpRecord.expires_at < new Date()) {
    throw new ApiError(
      400,
      "OTP_EXPIRED",
      "OTP has expired. Please request a new OTP.",
    );
  }

  if (!(await reserveOtpAttempt(otpRecord.register_otp_id, MAX_ATTEMPTS))) {
    throw otpBlockedError(
      "Too many incorrect attempts. Please try again later.",
    );
  }

  const submittedHash = hashOtp(
    organization.org_id,
    phoneScope.countryCode,
    phoneScope.mobileNo,
    input.otp,
  );

  // Wrong OTP
  if (!otpMatches(otpRecord.otp, submittedHash)) {
    const attempts = await getOtpAttemptCount(otpRecord.register_otp_id);

    if (attempts >= MAX_ATTEMPTS) {
      await blockOtp(
        otpRecord.register_otp_id,
        new Date(Date.now() + BLOCK_MINUTES * 60 * 1000),
      );

      throw otpBlockedError(
        `Too many incorrect attempts. Please try again after ${BLOCK_MINUTES} minutes.`,
      );
    }

    throw new ApiError(
      400,
      "INVALID_OTP",
      `Invalid OTP. ${MAX_ATTEMPTS - attempts} attempts remaining.`,
    );
  }

  // Correct OTP: only one request can use it
  if (!(await consumeOtp(otpRecord.register_otp_id))) {
    throw new ApiError(
      400,
      "OTP_NOT_FOUND",
      "OTP not found or already used",
    );
  }

  // Check whether user already exists
  const user = await findUserByMobile(
    phoneScope.countryCode,
    phoneScope.mobileNo,
  );

  if (!user) {
    const profileSetupToken =
      generateProfileSetupToken({
        orgId: organization.org_id.toString(),
        countryId: input.countryId,
        mobileNo: phoneScope.mobileNo,
        type: "PROFILE_SETUP",
      });

    return {
      verified: true,
      isNewUser: true,
      nextStep: "PROFILE_SETUP",
      token: profileSetupToken,
    };
  }

  const userOrganization = await findUserOrganization(
    user.user_id,
    organization.org_id,
  );

  // A removed member cannot sign back in through OTP.
  if (userOrganization?.deleted_at) {
    throw new ApiError(403, "MEMBERSHIP_REMOVED", "You were removed from this organization");
  }

  if (!userOrganization) {
    const organizationSetupToken =
      generateOrganizationSetupToken({
        userId: user.user_id.toString(),
        organizationId: organization.org_id.toString(),
        type: "ORGANIZATION_SETUP",
      });

    return {
      verified: true,
      isNewUser: false,
      nextStep: "ORGANIZATION_SETUP",
      token: organizationSetupToken,
      userId: user.user_id.toString(),
    };
  }

  const session = await createSession(
    {
      userId: user.user_id,
      organizationId: organization.org_id,
      userOrganizationId: userOrganization.user_organization_id,
    },
    {
      deviceType: input.deviceType?.toUpperCase(),
      deviceName: input.deviceName,
    },
  );

  return {
    verified: true,
    isNewUser: false,
    nextStep: "LOGIN",
    ...session,
    userId: user.user_id.toString(),
    userOrganizationId:
      userOrganization.user_organization_id.toString(),
  };
};
