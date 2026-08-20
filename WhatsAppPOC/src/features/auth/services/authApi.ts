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

// Fetch all supported country prefixes
export const getCountries = async (baseUrl: string): Promise<Country[]> => {
  const response = await fetch(`${baseUrl}/countries`, {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Failed to fetch countries');
  }
  return result.data;
};

// Request an OTP SMS for a mobile number
export const sendOtp = async (
  baseUrl: string,
  orgCode: string,
  countryId: string,
  mobileNo: string
): Promise<SendOtpResponse> => {
  const response = await fetch(`${baseUrl}/auth/send-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      orgCode: orgCode.trim(),
      countryId: countryId.trim(),
      mobileNo: mobileNo.trim(),
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Failed to request OTP');
  }
  return result;
};

// Validate 4-digit code
export const verifyOtp = async (
  baseUrl: string,
  orgCode: string,
  countryId: string,
  mobileNo: string,
  otp: string
): Promise<VerifyOtpResponse> => {
  const response = await fetch(`${baseUrl}/auth/verify-otp`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      orgCode: orgCode.trim(),
      countryId: countryId.trim(),
      mobileNo: mobileNo.trim(),
      otp: otp.trim(),
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Failed to verify OTP');
  }
  return result.data;
};

// Setup profile for new users (authenticated via profileSetupToken)
export const setupProfile = async (
  baseUrl: string,
  token: string,
  data: ProfileSetupData
): Promise<ProfileSetupResponse> => {
  const response = await fetch(`${baseUrl}/user/profile`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      orgCode: data.orgCode.trim(),
      countryId: data.countryId.trim(),
      mobileNo: data.mobileNo.trim(),
      firstName: data.firstName.trim(),
      lastName: data.lastName?.trim() || undefined,
      about: data.about?.trim() || undefined,
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Failed to set up profile');
  }
  return result;
};

// Setup user-organization mapping for existing users (authenticated via organizationSetupToken)
export const setupOrganization = async (
  baseUrl: string,
  token: string,
  data: OrganizationSetupData
): Promise<OrganizationSetupResponse> => {
  const response = await fetch(`${baseUrl}/organization/setup`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      orgCode: data.orgCode.trim(),
    }),
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Failed to set up organization');
  }
  return result;
};

// Retrieve authenticated /me user details (authenticated via accessToken)
export const getMe = async (baseUrl: string, token: string): Promise<MeResponse> => {
  const response = await fetch(`${baseUrl}/auth/me`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/json',
    },
  });
  const result = await response.json();
  if (!response.ok) {
    throw new Error(result.message || 'Failed to fetch user details');
  }
  return result.data;
};
