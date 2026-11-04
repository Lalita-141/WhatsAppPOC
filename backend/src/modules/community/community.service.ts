import prisma from "../../config/database.js";
import { ApiError } from "../../utils/api-error.js";
import { getOrganizationSetting, hasPermission } from "../policy/communication.policy.js";
import { MAX_GROUP_MEMBERS } from "../group/group.service.js";

const ID = /^\d{1,20}$/;

interface Actor {
    userOrganizationId: bigint;
    organizationId: bigint;
}

const groupAdmin = (groupId: bigint, member: bigint) =>
    prisma.group_member.findFirst({ where: { group_id: groupId, user_organization_id: member, role: "ADMIN", deleted_at: null, wp_group: { deleted_at: null } } });

const activeMembers = async (groupId: bigint) =>
    (await prisma.group_member.findMany({ where: { group_id: groupId, deleted_at: null }, select: { user_organization_id: true } })).map((m) => m.user_organization_id);

/** Puts people into the community's announcement group, reviving earlier rows. */
const addToAnnouncements = async (announcementGroupId: bigint, members: bigint[], adminId?: bigint) => {
    for (const id of members) {
        await prisma.group_member.upsert({
            where: { group_id_user_organization_id: { group_id: announcementGroupId, user_organization_id: id } },
            create: { group_id: announcementGroupId, user_organization_id: id, role: id === adminId ? "ADMIN" : "USER" },
            update: { deleted_at: null, deleted_by: null },
        });
    }
};

/**
 * Keeps a community's announcement group in step when people join one of its
 * groups, so everyone in the community receives announcements.
 */
export const syncCommunityMembers = async (groupId: bigint, members: bigint[]) => {
    const link = await prisma.community_group.findUnique({ where: { group_id: groupId }, include: { community: true } });
    if (link && !link.community.deleted_at) await addToAnnouncements(link.community.announcement_group_id, members);
};

export const createCommunity = async (actor: Actor, body: unknown) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const setting = await getOrganizationSetting(actor.organizationId);
    if (!(await hasPermission(setting.group_creation, actor.userOrganizationId))) {
        throw new ApiError(403, "GROUP_CREATION_NOT_ALLOWED", "You are not allowed to create communities");
    }
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 150) throw new ApiError(400, "VALIDATION_ERROR", "name must be 1 to 150 characters");
    const description = typeof input.description === "string" ? input.description.trim().slice(0, 500) || null : null;
    const groupIds = Array.isArray(input.groupIds) && input.groupIds.every((v) => typeof v === "string" && ID.test(v))
        ? [...new Set(input.groupIds as string[])].map((v) => BigInt(v))
        : null;
    if (!groupIds || groupIds.length > 50) throw new ApiError(400, "VALIDATION_ERROR", "groupIds must be a list of up to 50 group IDs");

    // Only groups the creator runs, in their own organization, not already in a community.
    for (const id of groupIds) {
        const admin = await groupAdmin(id, actor.userOrganizationId);
        const group = admin && (await prisma.wp_group.findUnique({ where: { group_id: id }, include: { community_link: true, announces_for: true } }));
        if (!group || group.org_id !== actor.organizationId || group.community_link || group.announces_for) {
            throw new ApiError(400, "INVALID_GROUP", "You can only add groups you admin that are not in a community");
        }
    }

    const members = new Set<bigint>([actor.userOrganizationId]);
    for (const id of groupIds) (await activeMembers(id)).forEach((m) => members.add(m));
    if (members.size > MAX_GROUP_MEMBERS * 4) throw new ApiError(400, "COMMUNITY_TOO_LARGE", "This community would be too large");

    const community = await prisma.$transaction(async (tx) => {
        const announcements = await tx.wp_group.create({
            data: { org_id: actor.organizationId, group_name: `${name} · Announcements`, only_admins_can_send: true, only_admins_can_edit_info: true, created_by: actor.userOrganizationId },
        });
        const created = await tx.community.create({
            data: { org_id: actor.organizationId, name, description, announcement_group_id: announcements.group_id, created_by: actor.userOrganizationId },
        });
        if (groupIds.length) await tx.community_group.createMany({ data: groupIds.map((group_id) => ({ community_id: created.community_id, group_id })) });
        return created;
    });
    await addToAnnouncements(community.announcement_group_id, [...members], actor.userOrganizationId);
    return getCommunity(actor, community.community_id);
};

const requireCommunityMember = async (actor: Actor, communityId: bigint) => {
    const community = await prisma.community.findFirst({ where: { community_id: communityId, deleted_at: null } });
    const member = community
        ? await prisma.group_member.findFirst({ where: { group_id: community.announcement_group_id, user_organization_id: actor.userOrganizationId, deleted_at: null } })
        : null;
    if (!community || !member) throw new ApiError(404, "COMMUNITY_NOT_FOUND", "Community not found");
    return { community, isAdmin: member.role === "ADMIN" };
};

export const getCommunity = async (actor: Actor, communityId: bigint) => {
    const { community, isAdmin } = await requireCommunityMember(actor, communityId);
    const links = await prisma.community_group.findMany({
        where: { community_id: communityId, group: { deleted_at: null } },
        include: {
            group: {
                select: {
                    group_id: true,
                    group_name: true,
                    group_description: true,
                    group_member: { where: { user_organization_id: actor.userOrganizationId, deleted_at: null }, select: { role: true } },
                    _count: { select: { group_member: { where: { deleted_at: null } } } },
                },
            },
        },
    });
    return {
        communityId: community.community_id.toString(),
        name: community.name,
        description: community.description,
        announcementGroupId: community.announcement_group_id.toString(),
        isAdmin,
        groups: links.map((l) => ({
            groupId: l.group.group_id.toString(),
            name: l.group.group_name,
            description: l.group.group_description,
            memberCount: l.group._count.group_member,
            isMember: l.group.group_member.length > 0,
        })),
    };
};

export const myCommunities = async (actor: Actor) => {
    const communities = await prisma.community.findMany({
        where: {
            deleted_at: null,
            announcement_group: { group_member: { some: { user_organization_id: actor.userOrganizationId, deleted_at: null } } },
        },
        orderBy: { name: "asc" },
        select: { community_id: true },
    });
    const result = [];
    for (const c of communities) result.push(await getCommunity(actor, c.community_id));
    return result;
};

export const addGroupToCommunity = async (actor: Actor, communityId: bigint, groupId: unknown) => {
    const { community, isAdmin } = await requireCommunityMember(actor, communityId);
    if (!isAdmin) throw new ApiError(403, "COMMUNITY_ADMIN_REQUIRED", "Only community admins can add groups");
    if (typeof groupId !== "string" || !ID.test(groupId)) throw new ApiError(400, "VALIDATION_ERROR", "groupId is required");
    const id = BigInt(groupId);
    const admin = await groupAdmin(id, actor.userOrganizationId);
    const group = admin && (await prisma.wp_group.findUnique({ where: { group_id: id }, include: { community_link: true, announces_for: true } }));
    if (!group || group.org_id !== community.org_id || group.community_link || group.announces_for) {
        throw new ApiError(400, "INVALID_GROUP", "You can only add groups you admin that are not in a community");
    }
    await prisma.community_group.create({ data: { community_id: communityId, group_id: id } });
    await addToAnnouncements(community.announcement_group_id, await activeMembers(id));
    return getCommunity(actor, communityId);
};

export const removeGroupFromCommunity = async (actor: Actor, communityId: bigint, groupId: bigint) => {
    const { isAdmin } = await requireCommunityMember(actor, communityId);
    if (!isAdmin) throw new ApiError(403, "COMMUNITY_ADMIN_REQUIRED", "Only community admins can remove groups");
    const { count } = await prisma.community_group.deleteMany({ where: { community_id: communityId, group_id: groupId } });
    if (count === 0) throw new ApiError(404, "GROUP_NOT_FOUND", "Group not found in this community");
};

/** Community members can join any of its groups without an invite. */
export const joinCommunityGroup = async (actor: Actor, communityId: bigint, groupId: bigint) => {
    await requireCommunityMember(actor, communityId);
    const link = await prisma.community_group.findFirst({ where: { community_id: communityId, group_id: groupId, group: { deleted_at: null } } });
    if (!link) throw new ApiError(404, "GROUP_NOT_FOUND", "Group not found in this community");
    if ((await activeMembers(groupId)).length >= MAX_GROUP_MEMBERS) throw new ApiError(400, "GROUP_TOO_LARGE", "This group is full");
    await prisma.group_member.upsert({
        where: { group_id_user_organization_id: { group_id: groupId, user_organization_id: actor.userOrganizationId } },
        create: { group_id: groupId, user_organization_id: actor.userOrganizationId },
        update: { deleted_at: null, deleted_by: null, role: "USER", joined_at: new Date(), last_read_group_chat_id: null },
    });
};

export const deleteCommunity = async (actor: Actor, communityId: bigint) => {
    const { community, isAdmin } = await requireCommunityMember(actor, communityId);
    if (!isAdmin) throw new ApiError(403, "COMMUNITY_ADMIN_REQUIRED", "Only community admins can delete the community");
    // Linked groups stay as ordinary groups; the announcement group closes.
    await prisma.$transaction([
        prisma.community_group.deleteMany({ where: { community_id: communityId } }),
        prisma.community.update({ where: { community_id: communityId }, data: { deleted_at: new Date() } }),
        prisma.wp_group.update({ where: { group_id: community.announcement_group_id }, data: { deleted_at: new Date() } }),
    ]);
};
