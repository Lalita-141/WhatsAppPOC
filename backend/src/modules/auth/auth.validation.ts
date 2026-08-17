export interface SendOtpRequest {
  orgCode: string;
  countryId: string;
  mobileNo: string;
}

export const validateSendOtpRequest = (
  body: SendOtpRequest,
): string | null => {
  if (!body.orgCode?.trim()) {
    return "Organization code is required";
  }

  if (!body.countryId?.trim()) {
    return "Country is required";
  }

  if (!body.mobileNo?.trim()) {
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
}

export const validateVerifyOtpRequest = (
  body: VerifyOtpRequest,
): string | null => {
  if (!body.orgCode?.trim()) {
    return "Organization code is required";
  }

  if (!body.countryId?.trim()) {
    return "Country is required";
  }

  if (!body.mobileNo?.trim()) {
    return "Mobile number is required";
  }

  if (!/^\d{6,15}$/.test(body.mobileNo)) {
    return "Invalid mobile number";
  }

  if (!body.otp?.trim()) {
    return "OTP is required";
  }

  if (!/^\d{4}$/.test(body.otp)) {
    return "OTP must be 4 digits";
  }

  return null;
};