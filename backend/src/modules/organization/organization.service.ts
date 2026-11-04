import { ApiError } from "../../utils/api-error.js";
import { createSession } from "../auth/session.service.js";
import {
  findOrganizationByCode,
  findUserOrganization,
} from "./organization.repository.js";
import { joinOrganization } from "./membership.service.js";

interface OrganizationSetupInput {
  userId: bigint;
  organizationId: bigint;
  orgCode: string;
  deviceType?: string;
  deviceName?: string;
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

  if (existingUserOrganization?.deleted_at) {
    throw new ApiError(
      403,
      "MEMBERSHIP_REMOVED",
      "You were removed from this organization",
    );
  }

  if (existingUserOrganization) {
    throw new ApiError(
      409,
      "USER_ORGANIZATION_EXISTS",
      "User is already associated with this organization",
    );
  }

  // 4. Join: at once with an invite or an open organization, otherwise
  //    wait for an admin to approve.
  const joined = await joinOrganization(input.userId, organization.org_id);

  if (joined.status === "PENDING_APPROVAL") {
    return {
      status: "PENDING_APPROVAL" as const,
      organizationName: organization.organization_name,
    };
  }

  const userOrganization = joined.userOrganization;

  // 5. Start the session, so the OTP never has to be submitted twice
  const session = await createSession(
    {
      userId: input.userId,
      organizationId: organization.org_id,
      userOrganizationId: userOrganization.user_organization_id,
    },
    {
      deviceType: input.deviceType,
      deviceName: input.deviceName,
    },
  );

  return {
    status: "JOINED" as const,

    ...session,

    userOrganizationId:
      userOrganization.user_organization_id.toString(),

    userId: input.userId.toString(),

    organizationId:
      organization.org_id.toString(),

    role: userOrganization.role,
  };
};