export interface OrganizationSetupRequest {
  orgCode: string;
}

export const validateOrganizationSetupRequest = (
  body: OrganizationSetupRequest,
): string | null => {
  if (!body.orgCode?.trim()) {
    return "Organization code is required";
  }

  return null;
};