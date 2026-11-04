import prisma from "../../config/database.js";

// Includes soft-deleted users, because their row still owns the unique number.
export const findUserByMobile = async (
  countryCode: string,
  mobileNo: string,
) => {
  return await prisma.user_master.findFirst({
    where: {
      country_code: countryCode,
      mobile_no: mobileNo,
    },
  });
};

export const createUser = async (
  tx: any,
  data: {
    firstName: string;
    lastName?: string;
    countryCode: string;
    mobileNo: string;
    about?: string;
  },
) => {
  return await tx.user_master.create({
    data: {
      first_name: data.firstName,
      last_name: data.lastName || null,
      country_code: data.countryCode,
      mobile_no: data.mobileNo,
      about: data.about || null,
    },
  });
};

export const createUserOrganization = async (
  tx: any,
  data: {
    userId: bigint;
    orgId: bigint;
  },
) => {
  return await tx.user_organization.create({
    data: {
      user_id: data.userId,
      org_id: data.orgId,
      role: "USER",
    },
  });
};

export const createUserSetting = async (
  tx: any,
  userOrganizationId: bigint,
) => {
  return await tx.user_setting.create({
    data: {
      user_organization_id: userOrganizationId,
    },
  });
};

export const createSelfConversation = async (
  tx: any,
  userOrganizationId: bigint,
) => {
  return await tx.conversation_state.create({
    data: {
      owner_user_organization_id: userOrganizationId,
      peer_user_organization_id: userOrganizationId,
    },
  });
};

export const getUserById = async (userId: string) => {
  const user = await prisma.user_master.findUnique({
    where: {
      user_id: BigInt(userId),
    },
  });
  return user;
};

export const updateUserLastSeen = async (userId: bigint, lastSeen: Date) => {
  return await prisma.user_master.update({
    where: {
      user_id: userId,
    },
    data: {
      last_seen: lastSeen,
    },
    select: {
      user_id: true,
      last_seen: true,
    },
  });
};

export const getUserLastSeenByUserOrgId = async (userOrganizationId: bigint) => {
  const userOrg = await prisma.user_organization.findFirst({
    where: {
      user_organization_id: userOrganizationId,
      deleted_at: null,
    },
    select: {
      user_master: {
        select: {
          last_seen: true,
        },
      },
    },
  });

  return userOrg?.user_master?.last_seen ?? null;
};

export const getUserNameByUserOrgId = async (userOrganizationId: bigint) => {
  const userOrg = await prisma.user_organization.findFirst({
    where: {
      user_organization_id: userOrganizationId,
      deleted_at: null,
    },
    select: {
      user_master: {
        select: {
          first_name: true,
          last_name: true,
        },
      },
    },
  });

  if (!userOrg?.user_master) return "Someone";
  return [userOrg.user_master.first_name, userOrg.user_master.last_name]
    .filter(Boolean)
    .join(" ") || "Someone";
};

export const getLastSeenPrivacy = async (userOrganizationId: bigint) => {
  const setting = await prisma.user_setting.findUnique({
    where: {
      user_organization_id: userOrganizationId,
    },
    select: {
      last_seen_privacy: true,
    },
  });

  return setting?.last_seen_privacy ?? "EVERYONE";
};

// "Contacts" means people you have exchanged a message with until Phase 4 adds
// a stored contact list.
export const hasExchangedMessages = async (
  userOrganizationIdA: bigint,
  userOrganizationIdB: bigint,
) => {
  const message = await prisma.personal_chat_history.findFirst({
    where: {
      deleted_at: null,
      OR: [
        {
          sender_user_organization_id: userOrganizationIdA,
          receiver_user_organization_id: userOrganizationIdB,
        },
        {
          sender_user_organization_id: userOrganizationIdB,
          receiver_user_organization_id: userOrganizationIdA,
        },
      ],
    },
    select: {
      chat_id: true,
    },
  });

  return Boolean(message);
};
