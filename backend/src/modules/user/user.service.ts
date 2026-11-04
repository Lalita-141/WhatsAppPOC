import { ApiError } from "../../utils/api-error.js";
import { joinOrganization } from "../organization/membership.service.js";
import prisma from "../../config/database.js";
import { ProfileSetupTokenPayload } from "../../utils/jwt.js";
import { createSession } from "../auth/session.service.js";
import {
  findUserByMobile,
  createUser,
  getUserById,
} from "./user.repository.js";

import {
  ProfileSetupRequest,
} from "./user.validation.js";


interface profileUpdateInputs {
  first_name?: string;
  last_name?: string;
  about?: string;
}

export const profileSetup = async (
  claims: ProfileSetupTokenPayload,
  input: ProfileSetupRequest,
) => {
  /*
   * 1. Organization and phone number come from the verified setup token
   */

  const organization = await prisma.organization_master.findFirst({
    where: {
      org_id: BigInt(claims.orgId),
      deleted_at: null,
    },
  });

  if (!organization) {
    throw new ApiError(
      404,
      "ORGANIZATION_NOT_FOUND",
      "Organization not found",
    );
  }

  const country = await prisma.country_master.findFirst({
    where: {
      country_id: BigInt(claims.countryId),
      deleted_at: null,
    },
  });

  if (!country) {
    throw new ApiError(
      404,
      "COUNTRY_NOT_FOUND",
      "Country not found",
    );
  }

  /*
   * 2. Check whether user already exists
   */

  const normalizedMobileNo = claims.mobileNo;

  const existingUser = await findUserByMobile(
    country.country_code,
    normalizedMobileNo,
  );

  if (existingUser) {
    throw new ApiError(
      409,
      "USER_ALREADY_EXISTS",
      "User already exists",
    );
  }

  /*
   * 3. Create the person, then join the organization. Without an invite (or an
   *    open organization) the join waits for an admin, and no session starts.
   */

  const user = await prisma.$transaction((tx) =>
    createUser(tx, {
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim(),
      countryCode: country.country_code,
      mobileNo: normalizedMobileNo,
      about: input.about?.trim(),
    }),
  );

  const joined = await joinOrganization(user.user_id, organization.org_id);

  if (joined.status === "PENDING_APPROVAL") {
    return {
      status: "PENDING_APPROVAL" as const,
      userId: user.user_id.toString(),
      organizationName: organization.organization_name,
    };
  }

  const result = { user, userOrganization: joined.userOrganization };

  /*
   * 4. Start the session, so the OTP never has to be submitted twice
   */

  const session = await createSession(
    {
      userId: result.user.user_id,
      organizationId: organization.org_id,
      userOrganizationId: result.userOrganization.user_organization_id,
    },
    {
      deviceType: input.deviceType?.toUpperCase(),
      deviceName: input.deviceName,
    },
  );

  /*
   * 5. Return safe response
   */

  return {
    status: "JOINED" as const,

    ...session,

    userId: result.user.user_id.toString(),

    userOrganizationId:
      result.userOrganization.user_organization_id.toString(),

    firstName: result.user.first_name,

    lastName: result.user.last_name,

    mobileNo: result.user.mobile_no,

    about: result.user.about,

    organizationId:
      organization.org_id.toString(),
  };
};

export const getMyProfile = async (userId: string) => {
  const user = await getUserById(userId);
  return {
    userId: user?.user_id.toString(),
    firstName: user?.first_name,
    lastName: user?.last_name,
    mobileNo: user?.mobile_no,
    about: user?.about,
    profilePhotoMediaId: user?.profile_photo_media_id?.toString() ?? null,
  };
}

export const updateProfile = async (userId: string, updateData: profileUpdateInputs) => {
  // Implementation for updating user profile
  const existingUser = await getUserById(userId);
  if (!existingUser) {
    throw new ApiError(
      404,
      "USER_NOT_FOUND",
      "User not found",
    );
  }

  const updatedUser = await prisma.user_master.update({
    where: {
      user_id: BigInt(userId),
    },
    data: {
      ...updateData,
      updated_at: new Date(),
      updated_by: BigInt(userId),
    },
  });

  return {
    userId: updatedUser.user_id.toString(),
    firstName: updatedUser.first_name,
    lastName: updatedUser.last_name,
    mobileNo: updatedUser.mobile_no,
    about: updatedUser.about,

    updatedAt: updatedUser.updated_at,
    updatedBy: updatedUser.updated_by?.toString() || null,


  };

  return updatedUser;
};