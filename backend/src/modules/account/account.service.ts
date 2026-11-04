import prisma from "../../config/database.js";
import { ApiError } from "../../utils/api-error.js";
import { createSession, revokeSessions } from "../auth/session.service.js";
import { disconnectSessions } from "../../socket/socket.registry.js";
import {
  deleteAccountRecords,
  findActiveMembershipOfUser,
  findActiveMemberships,
  findPrivacySettings,
  findSessionDevice,
  findSessionIdsOfMemberships,
  upsertPrivacySettings,
} from "./account.repository.js";

export const PRIVACY_LEVELS = ["EVERYONE", "CONTACTS", "NOBODY"] as const;

const PRIVACY_FIELDS = {
  aboutPrivacy: "about_privacy",
  profilePrivacy: "profile_privacy",
  lastSeenPrivacy: "last_seen_privacy",
  statusPrivacy: "status_privacy",
} as const;

const TOGGLE_FIELDS = {
  readReceipts: "read_receipts",
  typingIndicator: "typing_indicator",
} as const;

export const listOrganizations = async (
  userId: bigint,
  currentUserOrganizationId: bigint,
) => {
  const memberships = await findActiveMemberships(userId);

  return memberships.map((membership) => ({
    userOrganizationId: membership.user_organization_id.toString(),
    organizationId: membership.org_id.toString(),
    orgCode: membership.organization_master.org_code,
    organizationName: membership.organization_master.organization_name,
    role: membership.role,
    isCurrent:
      membership.user_organization_id === currentUserOrganizationId,
  }));
};

// Moves this device to another organization the same person already belongs
// to. Joining a new organization still needs an OTP through organization setup.
export const switchOrganization = async (
  current: { userId: bigint; userOrganizationId: bigint; sessionId: bigint },
  targetUserOrganizationId: bigint,
) => {
  if (targetUserOrganizationId === current.userOrganizationId) {
    throw new ApiError(400, "ALREADY_CURRENT", "This organization is already selected");
  }

  const target = await findActiveMembershipOfUser(
    targetUserOrganizationId,
    current.userId,
  );

  // Same answer for "not yours" and "does not exist".
  if (!target) {
    throw new ApiError(404, "MEMBERSHIP_NOT_FOUND", "Organization not found");
  }

  const device = await findSessionDevice(current.sessionId);

  const session = await createSession(
    {
      userId: current.userId,
      organizationId: target.org_id,
      userOrganizationId: target.user_organization_id,
    },
    {
      deviceType: device?.device_type ?? undefined,
      deviceName: device?.device_name ?? undefined,
    },
  );

  await revokeSessions([current.sessionId], "ORGANIZATION_SWITCHED");

  return {
    ...session,
    userOrganizationId: target.user_organization_id.toString(),
    organizationId: target.org_id.toString(),
  };
};

const toPrivacyResponse = (
  settings: Awaited<ReturnType<typeof findPrivacySettings>>,
) => ({
  aboutPrivacy: settings?.about_privacy ?? "EVERYONE",
  profilePrivacy: settings?.profile_privacy ?? "CONTACTS",
  lastSeenPrivacy: settings?.last_seen_privacy ?? "EVERYONE",
  statusPrivacy: settings?.status_privacy ?? "CONTACTS",
  readReceipts: settings?.read_receipts ?? true,
  typingIndicator: settings?.typing_indicator ?? true,
});

export const getPrivacySettings = async (userOrganizationId: bigint) =>
  toPrivacyResponse(await findPrivacySettings(userOrganizationId));

export const updatePrivacySettings = async (
  userOrganizationId: bigint,
  body: unknown,
) => {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new ApiError(400, "VALIDATION_ERROR", "Settings are required");
  }

  const input = body as Record<string, unknown>;
  const data: Record<string, string | boolean> = {};

  for (const key of Object.keys(input)) {
    const value = input[key];

    if (key in PRIVACY_FIELDS) {
      if (!PRIVACY_LEVELS.includes(value as (typeof PRIVACY_LEVELS)[number])) {
        throw new ApiError(400, "VALIDATION_ERROR", `${key} must be EVERYONE, CONTACTS or NOBODY`);
      }
      data[PRIVACY_FIELDS[key as keyof typeof PRIVACY_FIELDS]] = value as string;
    } else if (key in TOGGLE_FIELDS) {
      if (typeof value !== "boolean") {
        throw new ApiError(400, "VALIDATION_ERROR", `${key} must be true or false`);
      }
      data[TOGGLE_FIELDS[key as keyof typeof TOGGLE_FIELDS]] = value;
    } else {
      throw new ApiError(400, "VALIDATION_ERROR", `Unknown setting: ${key}`);
    }
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "At least one setting is required");
  }

  return toPrivacyResponse(await upsertPrivacySettings(userOrganizationId, data));
};

export const DELETE_CONFIRMATION = "DELETE";

export const deleteAccount = async (userId: bigint, confirmation: unknown) => {
  if (confirmation !== DELETE_CONFIRMATION) {
    throw new ApiError(
      400,
      "CONFIRMATION_REQUIRED",
      `Send confirmation "${DELETE_CONFIRMATION}" to delete the account`,
    );
  }

  const membershipIds = await deleteAccountRecords(userId);

  disconnectSessions(await findSessionIdsOfMemberships(membershipIds));
};

/** Sets the profile photo to a finished AVATAR upload of this member. */
export const setProfilePhoto = async (
  actor: { userId: bigint; userOrganizationId: bigint },
  mediaId: unknown,
) => {
  if (mediaId === null) {
    await prisma.user_master.update({ where: { user_id: actor.userId }, data: { profile_photo_media_id: null, updated_at: new Date() } });
    return { profilePhotoMediaId: null };
  }
  if (typeof mediaId !== "string" || !/^\d{1,20}$/.test(mediaId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "mediaId is required");
  }
  const media = await prisma.media_file.findFirst({
    where: { media_id: BigInt(mediaId), owner_user_org_id: actor.userOrganizationId, kind: "AVATAR", status: "READY", deleted_at: null },
  });
  if (!media) throw new ApiError(400, "INVALID_MEDIA", "Upload the photo first");
  await prisma.user_master.update({ where: { user_id: actor.userId }, data: { profile_photo_media_id: media.media_id, updated_at: new Date() } });
  return { profilePhotoMediaId: media.media_id.toString() };
};

const NOTIFICATION_FIELDS = {
  messages: "notify_messages",
  groups: "notify_groups",
  announcements: "notify_announcements",
  calls: "notify_calls",
  showPreview: "show_preview",
} as const;

const toNotificationResponse = (s: Record<string, unknown> | null) => ({
  messages: s?.notify_messages !== false,
  groups: s?.notify_groups !== false,
  announcements: s?.notify_announcements !== false,
  calls: s?.notify_calls !== false,
  showPreview: s?.show_preview !== false,
});

export const getNotificationSettings = async (userOrganizationId: bigint) =>
  toNotificationResponse(await prisma.user_setting.findUnique({ where: { user_organization_id: userOrganizationId } }));

export const updateNotificationSettings = async (userOrganizationId: bigint, body: unknown) => {
  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "At least one setting is required");
  }
  const data: Record<string, boolean> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const column = NOTIFICATION_FIELDS[key as keyof typeof NOTIFICATION_FIELDS];
    if (!column) throw new ApiError(400, "VALIDATION_ERROR", `Unknown setting: ${key}`);
    if (typeof value !== "boolean") throw new ApiError(400, "VALIDATION_ERROR", `${key} must be true or false`);
    data[column] = value;
  }
  const saved = await prisma.user_setting.upsert({
    where: { user_organization_id: userOrganizationId },
    create: { user_organization_id: userOrganizationId, ...data },
    update: { ...data, updated_at: new Date() },
  });
  return toNotificationResponse(saved);
};
