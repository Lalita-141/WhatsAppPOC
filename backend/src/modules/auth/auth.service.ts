import { ApiError } from "../../utils/api-error.js";
import {
  findCountryById,
  findOrganizationByCode,
  createOtp,
  findLatestOtp,
  countRecentOtpRequests,
  updateOtpAttempt,
  validateOtp,
  findUserByMobile,
  findUserOrganization,
  expirePreviousOtps,
} from "./auth.repository.js";

import {
  generateAccessToken,
  generateProfileSetupToken,
  generateOrganizationSetupToken,
} from "../../utils/jwt.js";

import { normalizeIndianPhoneNumber } from "../../utils/phone.js";

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
}

const generateOtp = (): string => {
  return Math.floor(1000 + Math.random() * 9000).toString();
};

export const sendOtp = async (input: SendOtpInput) => {
  // 1. Check organization
  const organization = await findOrganizationByCode(input.orgCode);
  const normalizedMobileNo =
    normalizeIndianPhoneNumber(input.mobileNo);
  if (!organization) {
    throw new ApiError(
      404,
      "ORGANIZATION_NOT_FOUND",
      "Organization not found",
    );
  }

  // 2. Check country
  const country = await findCountryById(BigInt(input.countryId));

  if (!country) {
    throw new ApiError(
      404,
      "COUNTRY_NOT_FOUND",
      "Country not found",
    );
  }

  const now = new Date();

  // --------------------------------------------------
  // 3. Check 60-second cooldown
  // --------------------------------------------------

  const latestOtp = await findLatestOtp({
    orgId: organization.org_id,
    countryCode: country.country_code,
    mobileNo: normalizedMobileNo,
  });

  if (latestOtp) {
    const cooldownSeconds = 60;

    const secondsSinceLastRequest =
      (now.getTime() - latestOtp.created_at.getTime()) / 1000;

    if (secondsSinceLastRequest < cooldownSeconds) {
      const remainingSeconds = Math.ceil(
        cooldownSeconds - secondsSinceLastRequest,
      );

      throw new ApiError(
        429,
        "OTP_COOLDOWN",
        `Please wait ${remainingSeconds} seconds before requesting another OTP.`,
      );
    }
  }

  // --------------------------------------------------
  // 4. Check maximum 5 OTP requests in 15 minutes
  // --------------------------------------------------

  const fifteenMinutesAgo = new Date(
    now.getTime() - 15 * 60 * 1000,
  );

  const recentOtpRequests = await countRecentOtpRequests({
    orgId: organization.org_id,
    countryCode: country.country_code,
    mobileNo: normalizedMobileNo,
    since: fifteenMinutesAgo,
  });

  const MAX_OTP_REQUESTS = 5;

  if (recentOtpRequests >= MAX_OTP_REQUESTS) {
    throw new ApiError(
      429,
      "OTP_REQUEST_LIMIT_EXCEEDED",
      "Too many OTP requests. Please try again later.",
    );
  }

  // --------------------------------------------------
  // 5. Expire previous OTPs
  // --------------------------------------------------

  await expirePreviousOtps({
    orgId: organization.org_id,
    countryCode: country.country_code,
    mobileNo: normalizedMobileNo,
  });

  // --------------------------------------------------
  // 6. Generate new OTP
  // --------------------------------------------------

  const otp = generateOtp();

  // OTP expires after 5 minutes
  const expiresAt = new Date(
    now.getTime() + 5 * 60 * 1000,
  );

  // --------------------------------------------------
  // 7. Save OTP
  // --------------------------------------------------

  await createOtp({
    orgId: organization.org_id,
    countryCode: country.country_code,
    mobileNo: normalizedMobileNo,
    otp,
    expiresAt,
  });

  // Development only
  console.log(
    `OTP for ${country.country_code}${normalizedMobileNo}: ${otp}`,
  );

  return {
    expiresIn: 300,
    otp: otp,
  };
};

export const verifyOtp = async (input: VerifyOtpInput) => {
  const organization = await findOrganizationByCode(input.orgCode);
  const normalizedMobileNo =
    normalizeIndianPhoneNumber(input.mobileNo);
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

  const otpRecord = await findLatestOtp({
    orgId: organization.org_id,
    countryCode: country.country_code,
    mobileNo: normalizedMobileNo,
  });

  if (!otpRecord) {
    throw new ApiError(
      400,
      "OTP_NOT_FOUND",
      "OTP not found or already used",
    );
  }

  // Check whether the OTP is currently blocked
  if (
    otpRecord.block_time &&
    otpRecord.block_time > new Date()
  ) {
    throw new ApiError(
      429,
      "OTP_BLOCKED",
      "Too many incorrect attempts. Please try again later.",
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

  // Wrong OTP
  if (otpRecord.otp !== input.otp) {
    const newTrailCount = otpRecord.trail_count + 1;

    const MAX_ATTEMPTS = 5;
    const BLOCK_MINUTES = 15;

    let blockTime: Date | null = null;

    if (newTrailCount >= MAX_ATTEMPTS) {
      blockTime = new Date(
        Date.now() + BLOCK_MINUTES * 60 * 1000,
      );
    }

    await updateOtpAttempt(
      otpRecord.register_otp_id,
      newTrailCount,
      blockTime,
    );

    if (blockTime) {
      throw new ApiError(
        429,
        "OTP_BLOCKED",
        "Too many incorrect attempts. Please try again after 15 minutes.",
      );
    }

    throw new ApiError(
      400,
      "INVALID_OTP",
      `Invalid OTP. ${MAX_ATTEMPTS - newTrailCount} attempts remaining.`,
    );
  }

  // Correct OTP
  await validateOtp(otpRecord.register_otp_id);

  // Check whether user already exists
  const user = await findUserByMobile(normalizedMobileNo);

  if (!user) {
    const profileSetupToken =
      generateProfileSetupToken({
        orgId: organization.org_id.toString(),
        countryId: input.countryId,
        mobileNo: normalizedMobileNo,
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

  const accessToken = generateAccessToken({
    userId: user.user_id.toString(),
    organizationId: organization.org_id.toString(),
    userOrganizationId:
      userOrganization.user_organization_id.toString(),
    type: "ACCESS",
  });

  return {
    verified: true,
    isNewUser: false,
    nextStep: "LOGIN",
    token: accessToken,
    userId: user.user_id.toString(),
    userOrganizationId:
      userOrganization.user_organization_id.toString(),
  };
};