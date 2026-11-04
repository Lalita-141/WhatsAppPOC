export interface SendOtpRequest {
  orgCode: string;
  countryId: string;
  mobileNo: string;
}

const isBlank = (value: unknown) =>
  typeof value !== "string" || !value.trim();

export const validateSendOtpRequest = (
  body: SendOtpRequest,
): string | null => {
  if (isBlank(body?.orgCode)) {
    return "Organization code is required";
  }

  if (isBlank(body?.countryId)) {
    return "Country is required";
  }

  if (!/^\d{1,20}$/.test(body.countryId)) {
    return "Invalid country";
  }

  if (isBlank(body?.mobileNo)) {
    return "Mobile number is required";
  }

  if (!/^\d{6,15}$/.test(body.mobileNo)) {
    return "Invalid mobile number";
  }

  return null;
};


export interface VerifyOtpRequest {
  orgCode: string;
  countryId: string;
  mobileNo: string;
  otp: string;
  deviceType?: string;
  deviceName?: string;
}

export const validateDeviceInfo = (body: {
  deviceType?: unknown;
  deviceName?: unknown;
}): string | null => {
  if (
    body?.deviceType !== undefined &&
    (typeof body.deviceType !== "string" || body.deviceType.length > 20)
  ) {
    return "Invalid device type";
  }

  if (
    body?.deviceName !== undefined &&
    (typeof body.deviceName !== "string" || body.deviceName.length > 100)
  ) {
    return "Invalid device name";
  }

  return null;
};

export const validateVerifyOtpRequest = (
  body: VerifyOtpRequest,
): string | null => {
  const baseError = validateSendOtpRequest(body);

  if (baseError) {
    return baseError;
  }

  if (isBlank(body?.otp)) {
    return "OTP is required";
  }

  if (!/^\d{6}$/.test(body.otp)) {
    return "OTP must be 6 digits";
  }

  return validateDeviceInfo(body);
};

export const validateRefreshRequest = (
  body: { refreshToken?: unknown },
): string | null => {
  if (
    typeof body?.refreshToken !== "string" ||
    !body.refreshToken ||
    body.refreshToken.length > 200
  ) {
    return "Refresh token is required";
  }

  return null;
};
