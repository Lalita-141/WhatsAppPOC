import { validateDeviceInfo } from "../auth/auth.validation.js";

export interface OrganizationSetupRequest {
  orgCode: string;
  deviceType?: string;
  deviceName?: string;
}

export const validateOrganizationSetupRequest = (
  body: OrganizationSetupRequest,
): string | null => {
  if (typeof body?.orgCode !== "string" || !body.orgCode.trim()) {
    return "Organization code is required";
  }

  return validateDeviceInfo(body);
};