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
    expiresIn: number;
    otp?: string; // only when the backend has OTP_DEV_ECHO enabled in development
  };
}

export interface VerifyOtpResponse {
  verified: boolean;
  isNewUser: boolean;
  nextStep: 'PROFILE_SETUP' | 'ORGANIZATION_SETUP' | 'LOGIN';
  token: string; // profileSetupToken / organizationSetupToken / accessToken
  refreshToken?: string; // only when nextStep is LOGIN
  sessionId?: string;
  userId?: string;
  userOrganizationId?: string;
}

export interface ProfileSetupData {
  firstName: string;
  lastName?: string;
  about?: string;
}

export interface ProfileSetupResponse {
  success: boolean;
  message: string;
  data: {
    // PENDING_APPROVAL: an organization admin must approve; no tokens yet.
    status?: 'JOINED' | 'PENDING_APPROVAL';
    organizationName?: string;
    token: string;
    refreshToken: string;
    sessionId: string;
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
    status?: 'JOINED' | 'PENDING_APPROVAL';
    organizationName?: string;
    token: string;
    refreshToken: string;
    sessionId: string;
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

import { Platform } from 'react-native';
import { apiPath } from '../../../environments/environment_urls';
import { fetchApi } from '../../../services/api/httpService';

export const OTP_LENGTH = 6;

const deviceInfo = () => ({
  deviceType: Platform.OS.toUpperCase(),
  deviceName: `${Platform.OS} device`,
});
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

// Validate the SMS code
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
    ...deviceInfo(),
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
    firstName: data.firstName.trim(),
    lastName: data.lastName?.trim() || undefined,
    about: data.about?.trim() || undefined,
    ...deviceInfo(),
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
    ...deviceInfo(),
  });
  return result;
};

// End this device's session on the server, including its push token
export const logoutSession = async (refreshToken: string): Promise<void> => {
  await fetchApi('POST', apiPath.revoke, undefined, false, { refreshToken });
};
// Retrieve authenticated /me user details (authenticated via accessToken)
export const getMe = async (_baseUrl: string, token: string): Promise<MeResponse> => {
  const result = await fetchApi('GET', apiPath.me, token);
  return result.data;
};
