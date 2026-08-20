import { ApiError } from "../../utils/api-error.js";
import prisma from "../../config/database.js";
import { normalizeIndianPhoneNumber } from "../../utils/phone.js";
import {
  findUserByMobile,
  createUser,
  createUserOrganization,
  createUserSetting,
  getUserById,
} from "./user.repository.js";

import {
  ProfileSetupRequest,
} from "./user.validation.js";
import { AuthRequest } from "../../middleware/auth.middleware.js";


interface profileUpdateInputs {
  first_name?: string;
  last_name?: string;
  about?: string;
}

export const profileSetup = async (
  input: ProfileSetupRequest,
) => {
  /*
   * 1. Check whether organization exists
   */

  const organization = await prisma.organization_master.findFirst({
    where: {
      org_code: input.orgCode,
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

  /*
   * 2. Check whether user already exists
   */

  const normalizedMobileNo =
    normalizeIndianPhoneNumber(input.mobileNo);

  const existingUser = await findUserByMobile(
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
   * 3. Create everything inside one transaction
   */

  const result = await prisma.$transaction(async (tx) => {
    /*
     * Create user
     */

    const user = await createUser(tx, {
      firstName: input.firstName.trim(),
      lastName: input.lastName?.trim(),
      mobileNo: normalizedMobileNo,
      about: input.about?.trim(),
    });

    /*
     * Create user ↔ organization relationship
     */

    const userOrganization =
      await createUserOrganization(tx, {
        userId: user.user_id,
        orgId: organization.org_id,
      });

    /*
     * Create default settings
     */

    const userSetting = await createUserSetting(
      tx,
      userOrganization.user_organization_id,
    );

    return {
      user,
      userOrganization,
      userSetting,
    };
  });

  /*
   * 4. Return safe response
   */

  return {
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
  console.log(" getMyProfile user", user);
  return {
    userId: user?.user_id.toString(),
    firstName: user?.first_name,
    lastName: user?.last_name,
    mobileNo: user?.mobile_no,
    about: user?.about,
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