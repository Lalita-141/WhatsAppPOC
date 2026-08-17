import { ApiError } from "../../utils/api-error.js";
import {
  findOrganizationByCode,
  findUserOrganization,
  createUserOrganization,
} from "./organization.repository.js";

interface OrganizationSetupInput {
  userId: bigint;
  organizationId: bigint;
  orgCode: string;
}

export const setupOrganization = async (
  input: OrganizationSetupInput,
) => {
  // 1. Check organization
  const organization = await findOrganizationByCode(
    input.orgCode,
  );

  if (!organization) {
    throw new ApiError(
      404,
      "ORGANIZATION_NOT_FOUND",
      "Organization not found",
    );
  }

  // 2. Make sure JWT organization matches requested organization
  if (organization.org_id !== input.organizationId) {
    throw new ApiError(
      403,
      "INVALID_ORGANIZATION",
      "You are not authorized for this organization",
    );
  }

  // 3. Check whether user is already connected
  const existingUserOrganization =
    await findUserOrganization(
      input.userId,
      organization.org_id,
    );

  if (existingUserOrganization) {
    throw new ApiError(
      409,
      "USER_ORGANIZATION_EXISTS",
      "User is already associated with this organization",
    );
  }

  // 4. Create relationship
  const userOrganization =
    await createUserOrganization({
      userId: input.userId,
      orgId: organization.org_id,
      role: "USER",
    });

  return {
    userOrganizationId:
      userOrganization.user_organization_id.toString(),

    userId: input.userId.toString(),

    organizationId:
      organization.org_id.toString(),

    role: userOrganization.role,
  };
};