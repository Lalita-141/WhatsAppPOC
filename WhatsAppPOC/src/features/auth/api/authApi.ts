export interface Country {
  countryId: string;
  countryName: string;
  countryCode: string;
  isoCode: string;
  iso3Code: string;
  flag: string;
}

export interface SendOtpResponse {
  success: boolean;
  message: string;
  data: {
    otp: string; // for development testing purposes
  };
}

export interface VerifyOtpResponse {
  verified: boolean;
  isNewUser: boolean;
  nextStep: 'PROFILE_SETUP' | 'ORGANIZATION_SETUP' | 'LOGIN';
  token: string; // profileSetupToken / organizationSetupToken / accessToken
  userId?: string;
  userOrganizationId?: string;
}

export interface ProfileSetupData {
  orgCode: string;
  countryId: string;
  mobileNo: string;
  firstName: string;
  lastName?: string;
  about?: string;
}

export interface ProfileSetupResponse {
  success: boolean;
  message: string;
  data: {
    userId: string;
    userOrganizationId: string;
    firstName: string;
    lastName?: string;
    mobileNo: string;
    about?: string;
    organizationId: string;
  };
}

export interface OrganizationSetupData {
  orgCode: string;
}

export interface OrganizationSetupResponse {
  success: boolean;
  message: string;
  data: {
    userOrganizationId: string;
    userId: string;
    organizationId: string;
    role: string;
  };
}

export interface MeResponse {
  userId: string;
  organizationId: string;
  userOrganizationId: string;
  firstName: string;
  lastName?: string;
  mobileNo: string;
  about?: string;
}

import { apiPath } from '../../../environments/environment_urls';
import { fetchApi } from '../../../services/api/httpService';

// Fetch all supported country prefixes
export const getCountries = async (_baseUrl?: string): Promise<Country[]> => {
  const result = await fetchApi('GET', apiPath.countries);
  return result.data || [];
};

// Request an OTP SMS for a mobile number
export const sendOtp = async (
  _baseUrl: string,
  orgCode: string,
  countryId: string,
  mobileNo: string
): Promise<SendOtpResponse> => {
  const result = await fetchApi('POST', apiPath.sendOtp, undefined, false, {
    orgCode: orgCode.trim(),
    countryId: countryId.trim(),
    mobileNo: mobileNo.trim(),
  });
  return result;
};

// Validate 4-digit code
export const verifyOtp = async (
  _baseUrl: string,
  orgCode: string,
  countryId: string,
  mobileNo: string,
  otp: string
): Promise<VerifyOtpResponse> => {
  const result = await fetchApi('POST', apiPath.verifyOtp, undefined, false, {
    orgCode: orgCode.trim(),
    countryId: countryId.trim(),
    mobileNo: mobileNo.trim(),
    otp: otp.trim(),
  });
  return result.data;
};

// Setup profile for new users (authenticated via profileSetupToken)
export const setupProfile = async (
  _baseUrl: string,
  token: string,
  data: ProfileSetupData
): Promise<ProfileSetupResponse> => {
  const result = await fetchApi('POST', apiPath.userProfile, token, false, {
    orgCode: data.orgCode.trim(),
    countryId: data.countryId.trim(),
    mobileNo: data.mobileNo.trim(),
    firstName: data.firstName.trim(),
    lastName: data.lastName?.trim() || undefined,
    about: data.about?.trim() || undefined,
  });
  return result;
};

// Setup user-organization mapping for existing users (authenticated via organizationSetupToken)
export const setupOrganization = async (
  _baseUrl: string,
  token: string,
  data: OrganizationSetupData
): Promise<OrganizationSetupResponse> => {
  const result = await fetchApi('POST', apiPath.orgSetup, token, false, {
    orgCode: data.orgCode.trim(),
  });
  return result;
};

// Retrieve authenticated /me user details (authenticated via accessToken)
export const getMe = async (_baseUrl: string, token: string): Promise<MeResponse> => {
  const result = await fetchApi('GET', apiPath.me, token);
  return result.data;
};
