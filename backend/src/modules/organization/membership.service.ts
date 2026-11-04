import prisma from "../../config/database.js";
import { ApiError } from "../../utils/api-error.js";
import { getOrganizationSetting, writeAuditLog } from "../policy/communication.policy.js";
import { createUserOrganization } from "./organization.repository.js";

export type JoinResult =
  | { status: "JOINED"; userOrganization: { user_organization_id: bigint; role: string | null } }
  | { status: "PENDING_APPROVAL" };

const activeInviteFor = async (orgId: bigint, countryCode: string, mobileNo: string) =>
  prisma.organization_invite.findFirst({
    where: {
      org_id: orgId,
      country_code: countryCode,
      mobile_no: mobileNo,
      accepted_at: null,
      revoked_at: null,
      expires_at: { gt: new Date() },
    },
  });

/**
 * Knowing the organization code is not enough to join. A verified person joins
 * at once when invited or when the organization is open; otherwise a join
 * request waits for an admin.
 */
export const joinOrganization = async (userId: bigint, orgId: bigint): Promise<JoinResult> => {
  const person = await prisma.user_master.findUniqueOrThrow({
    where: { user_id: userId },
    select: { country_code: true, mobile_no: true },
  });
  const [setting, invite] = await Promise.all([
    getOrganizationSetting(orgId),
    activeInviteFor(orgId, person.country_code, person.mobile_no),
  ]);

  if (!invite && setting.join_mode !== "OPEN") {
    const existing = await prisma.organization_join_request.findUnique({
      where: { org_id_user_id: { org_id: orgId, user_id: userId } },
    });

    if (existing?.status === "REJECTED") {
      throw new ApiError(403, "JOIN_REJECTED", "Your request to join this organization was declined");
    }

    if (!existing) {
      await prisma.organization_join_request.create({ data: { org_id: orgId, user_id: userId } });
    }

    return { status: "PENDING_APPROVAL" };
  }

  const userOrganization = await createUserOrganization({ userId, orgId, role: "USER" });

  if (invite) {
    await prisma.organization_invite.update({
      where: { invite_id: invite.invite_id },
      data: { accepted_at: new Date() },
    });
  }

  await writeAuditLog({
    orgId,
    actor: userOrganization.user_organization_id,
    action: invite ? "MEMBER_JOINED_BY_INVITE" : "MEMBER_JOINED_OPEN",
    targetType: "MEMBER",
    targetId: userOrganization.user_organization_id,
  });

  return { status: "JOINED", userOrganization };
};
