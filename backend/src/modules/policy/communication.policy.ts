import prisma from "../../config/database.js";

/**
 * The one place that decides whether two organizations may communicate. REST,
 * sockets, contact discovery, groups and broadcasts all ask this function.
 *
 * - Same organization: allowed while internal chat is enabled.
 * - Different organizations: both sides must allow the other. ALL_ORGANIZATIONS
 *   allows everyone; SELECTED_ORGANIZATIONS needs an approved relationship;
 *   INTERNAL_ONLY and DISABLED allow nobody. One organization can never
 *   override another's restriction.
 */

export const pairKey = (a: bigint, b: bigint) => (a < b ? `${a}:${b}` : `${b}:${a}`);

export const DEFAULT_SETTING = {
    internal_chat_enabled: true,
    external_policy: "INTERNAL_ONLY",
    group_creation: "EVERYONE",
    external_participants: "ADMINS",
    broadcast_permission: "ADMINS",
    file_sharing_enabled: true,
    calls_enabled: true,
    max_upload_mb: 25,
    join_mode: "APPROVAL",
} as const;

export const getOrganizationSetting = async (orgId: bigint) => {
    const setting = await prisma.organization_setting.findUnique({ where: { org_id: orgId } });
    return setting ?? { org_id: orgId, ...DEFAULT_SETTING, updated_at: null, updated_by: null };
};

const allowsExternal = async (fromOrg: bigint, toOrg: bigint, approved: boolean) => {
    const { external_policy: policy } = await getOrganizationSetting(fromOrg);
    if (policy === "ALL_ORGANIZATIONS") return true;
    if (policy === "SELECTED_ORGANIZATIONS") return approved;
    return false;
};

export const organizationsCanCommunicate = async (a: bigint, b: bigint) => {
    if (a === b) {
        return (await getOrganizationSetting(a)).internal_chat_enabled;
    }

    const relationship = await prisma.organization_relationship.findUnique({
        where: { pair_key: pairKey(a, b) },
        select: { status: true },
    });
    const approved = relationship?.status === "APPROVED";

    return (await allowsExternal(a, b, approved)) && (await allowsExternal(b, a, approved));
};

/** Organizations the given one may currently reach, itself included if internal chat is on. */
export const reachableOrganizations = async (orgId: bigint) => {
    const orgs = await prisma.organization_master.findMany({
        where: { deleted_at: null },
        select: { org_id: true },
    });
    const reachable: bigint[] = [];
    for (const { org_id } of orgs) {
        if (await organizationsCanCommunicate(orgId, org_id)) reachable.push(org_id);
    }
    return reachable;
};

export const isOrganizationAdmin = async (userOrganizationId: bigint) => {
    const membership = await prisma.user_organization.findUnique({
        where: { user_organization_id: userOrganizationId },
        select: { role: true, deleted_at: true },
    });
    return membership?.deleted_at === null && membership.role === "ADMIN";
};

/** EVERYONE, ADMINS or NOBODY, applied to one member. */
export const hasPermission = async (scope: string, userOrganizationId: bigint) =>
    scope === "EVERYONE" || (scope === "ADMINS" && (await isOrganizationAdmin(userOrganizationId)));

export const writeAuditLog = async (entry: {
    orgId: bigint;
    actor: bigint | null;
    action: string;
    targetType?: string;
    targetId?: bigint | string;
    details?: Record<string, unknown>;
}) =>
    prisma.organization_audit_log.create({
        data: {
            org_id: entry.orgId,
            actor_user_org_id: entry.actor,
            action: entry.action,
            target_type: entry.targetType,
            target_id: entry.targetId?.toString(),
            details: entry.details as object | undefined,
        },
    });
