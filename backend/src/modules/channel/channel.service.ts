import prisma from "../../config/database.js";
import { ApiError } from "../../utils/api-error.js";
import { getRegisteredSocketServer } from "../../socket/socket.registry.js";
import { userRoom } from "../../socket/presence.state.js";
import { sendPushNotification } from "../notification/notification.service.js";
import { mediaDtoSelect, toMediaDto } from "../media/media.dto.js";
import {
    getOrganizationSetting,
    hasPermission,
    organizationsCanCommunicate,
    reachableOrganizations,
} from "../policy/communication.policy.js";

const ID = /^\d{1,20}$/;

interface Actor {
    userOrganizationId: bigint;
    organizationId: bigint;
}

const postSelect = {
    post_id: true,
    channel_id: true,
    text: true,
    created_at: true,
    media_file: { select: mediaDtoSelect },
} as const;

const toPostDto = (p: { post_id: bigint; channel_id: bigint; text: string | null; created_at: Date; media_file: Parameters<typeof toMediaDto>[0] | null }) => ({
    postId: p.post_id.toString(),
    channelId: p.channel_id.toString(),
    text: p.text,
    media: p.media_file ? toMediaDto(p.media_file) : null,
    createdAt: p.created_at,
});

/** A channel the member follows or runs, while the organizations may communicate. */
const membershipOf = async (actor: Actor, channelId: bigint) => {
    const channel = await prisma.channel.findFirst({ where: { channel_id: channelId, deleted_at: null } });
    const member = channel
        ? await prisma.channel_member.findUnique({ where: { channel_id_user_organization_id: { channel_id: channelId, user_organization_id: actor.userOrganizationId } } })
        : null;
    if (!channel || !member || !(await organizationsCanCommunicate(actor.organizationId, channel.org_id))) {
        throw new ApiError(404, "CHANNEL_NOT_FOUND", "Channel not found");
    }
    return { channel, member };
};

export const createChannel = async (actor: Actor, body: unknown) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const setting = await getOrganizationSetting(actor.organizationId);
    if (!(await hasPermission(setting.broadcast_permission, actor.userOrganizationId))) {
        throw new ApiError(403, "CHANNEL_CREATION_NOT_ALLOWED", "You are not allowed to create channels");
    }
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 150) throw new ApiError(400, "VALIDATION_ERROR", "name must be 1 to 150 characters");
    const description = typeof input.description === "string" ? input.description.trim().slice(0, 500) || null : null;

    const channel = await prisma.channel.create({
        data: {
            org_id: actor.organizationId,
            name,
            description,
            members: { create: { user_organization_id: actor.userOrganizationId, role: "OWNER" } },
        },
    });
    return { channelId: channel.channel_id.toString(), name: channel.name, description: channel.description, role: "OWNER", followerCount: 0 };
};

/** Channels in organizations the member may reach, for following. */
export const discoverChannels = async (actor: Actor) => {
    const orgs = await reachableOrganizations(actor.organizationId);
    const channels = await prisma.channel.findMany({
        where: { deleted_at: null, org_id: { in: orgs } },
        orderBy: { name: "asc" },
        take: 200,
        include: {
            organization: { select: { organization_name: true } },
            members: { where: { user_organization_id: actor.userOrganizationId }, select: { role: true } },
            _count: { select: { members: { where: { role: "FOLLOWER" } } } },
        },
    });
    return channels.map((c) => ({
        channelId: c.channel_id.toString(),
        name: c.name,
        description: c.description,
        organizationName: c.organization.organization_name,
        followerCount: c._count.members,
        role: c.members[0]?.role ?? null,
    }));
};

export const myChannels = async (actor: Actor) => {
    const memberships = await prisma.channel_member.findMany({
        where: { user_organization_id: actor.userOrganizationId, channel: { deleted_at: null } },
        include: {
            channel: {
                include: {
                    organization: { select: { organization_name: true } },
                    posts: { where: { deleted_at: null }, orderBy: { post_id: "desc" }, take: 1, select: postSelect },
                    _count: { select: { members: { where: { role: "FOLLOWER" } } } },
                },
            },
        },
    });
    const result = [];
    for (const m of memberships) {
        if (!(await organizationsCanCommunicate(actor.organizationId, m.channel.org_id))) continue;
        const unread = await prisma.channel_post.count({
            where: { channel_id: m.channel_id, deleted_at: null, ...(m.last_read_post_id ? { post_id: { gt: m.last_read_post_id } } : {}) },
        });
        result.push({
            channelId: m.channel_id.toString(),
            name: m.channel.name,
            description: m.channel.description,
            organizationName: m.channel.organization.organization_name,
            role: m.role,
            muted: m.muted,
            followerCount: m.channel._count.members,
            lastPost: m.channel.posts[0] ? toPostDto(m.channel.posts[0]) : null,
            unreadCount: m.role === "FOLLOWER" ? unread : 0,
        });
    }
    return result;
};

export const follow = async (actor: Actor, channelId: bigint) => {
    const channel = await prisma.channel.findFirst({ where: { channel_id: channelId, deleted_at: null } });
    if (!channel || !(await organizationsCanCommunicate(actor.organizationId, channel.org_id))) {
        throw new ApiError(404, "CHANNEL_NOT_FOUND", "Channel not found");
    }
    await prisma.channel_member.upsert({
        where: { channel_id_user_organization_id: { channel_id: channelId, user_organization_id: actor.userOrganizationId } },
        create: { channel_id: channelId, user_organization_id: actor.userOrganizationId },
        update: {},
    });
};

export const unfollow = async (actor: Actor, channelId: bigint) => {
    const { member } = await membershipOf(actor, channelId);
    if (member.role === "OWNER") throw new ApiError(400, "OWNER_CANNOT_LEAVE", "Delete the channel instead");
    await prisma.channel_member.delete({ where: { channel_id_user_organization_id: { channel_id: channelId, user_organization_id: actor.userOrganizationId } } });
};

export const setMuted = async (actor: Actor, channelId: bigint, muted: unknown) => {
    await membershipOf(actor, channelId);
    if (typeof muted !== "boolean") throw new ApiError(400, "VALIDATION_ERROR", "muted must be true or false");
    await prisma.channel_member.update({
        where: { channel_id_user_organization_id: { channel_id: channelId, user_organization_id: actor.userOrganizationId } },
        data: { muted },
    });
};

export const posts = async (actor: Actor, channelId: bigint, cursor: unknown) => {
    await membershipOf(actor, channelId);
    const before = typeof cursor === "string" && ID.test(cursor) ? BigInt(cursor) : undefined;
    const rows = await prisma.channel_post.findMany({
        where: { channel_id: channelId, deleted_at: null, ...(before ? { post_id: { lt: before } } : {}) },
        orderBy: { post_id: "desc" },
        take: 30,
        select: postSelect,
    });
    if (!before && rows[0]) {
        await prisma.channel_member.update({
            where: { channel_id_user_organization_id: { channel_id: channelId, user_organization_id: actor.userOrganizationId } },
            data: { last_read_post_id: rows[0].post_id },
        });
    }
    return { posts: rows.map(toPostDto).reverse(), nextCursor: rows.length === 30 ? rows[rows.length - 1].post_id.toString() : null };
};

/** Only the owner and admins post. Followers are told, but never see each other. */
export const publish = async (actor: Actor, channelId: bigint, body: unknown) => {
    const { channel, member } = await membershipOf(actor, channelId);
    if (member.role === "FOLLOWER") throw new ApiError(403, "CHANNEL_ADMIN_REQUIRED", "Only channel admins can post");
    const input = (body ?? {}) as Record<string, unknown>;
    const text = typeof input.text === "string" ? input.text.trim() : "";
    if (text.length > 5000) throw new ApiError(400, "VALIDATION_ERROR", "text must be at most 5000 characters");

    let mediaId: bigint | null = null;
    if (input.mediaId !== undefined) {
        if (typeof input.mediaId !== "string" || !ID.test(input.mediaId)) throw new ApiError(400, "VALIDATION_ERROR", "mediaId is not valid");
        const media = await prisma.media_file.findFirst({
            where: { media_id: BigInt(input.mediaId), owner_user_org_id: actor.userOrganizationId, status: "READY", deleted_at: null, kind: { not: "AVATAR" } },
        });
        if (!media) throw new ApiError(400, "INVALID_MEDIA", "Upload the file first");
        mediaId = media.media_id;
    }
    if (!text && !mediaId) throw new ApiError(400, "VALIDATION_ERROR", "A post needs text or a file");

    const post = await prisma.channel_post.create({
        data: { channel_id: channelId, author_user_org_id: actor.userOrganizationId, text: text || null, media_id: mediaId },
        select: postSelect,
    });
    const dto = toPostDto(post);

    const followers = await prisma.channel_member.findMany({
        where: { channel_id: channelId, role: "FOLLOWER" },
        select: { user_organization_id: true, muted: true, member: { select: { org_id: true, deleted_at: true } } },
    });
    const io = getRegisteredSocketServer();
    for (const f of followers) {
        if (f.member.deleted_at || !(await organizationsCanCommunicate(f.member.org_id, channel.org_id))) continue;
        io?.to(userRoom(f.user_organization_id)).emit("channel:post:new", { channelId: channelId.toString(), post: dto });
        if (!f.muted) {
            sendPushNotification({
                receiverUserOrganizationId: f.user_organization_id,
                category: "ANNOUNCEMENT",
                channelId: "announcements",
                thread: `channel:${channelId}`,
                title: channel.name,
                body: text || "New post",
                data: { type: "CHANNEL_POST", channelId: channelId.toString() },
            });
        }
    }
    return dto;
};

export const deletePost = async (actor: Actor, channelId: bigint, postId: bigint) => {
    const { member } = await membershipOf(actor, channelId);
    if (member.role === "FOLLOWER") throw new ApiError(403, "CHANNEL_ADMIN_REQUIRED", "Only channel admins can delete posts");
    const { count } = await prisma.channel_post.updateMany({
        where: { post_id: postId, channel_id: channelId, deleted_at: null },
        data: { deleted_at: new Date(), media_id: null },
    });
    if (count === 0) throw new ApiError(404, "POST_NOT_FOUND", "Post not found");
};

export const deleteChannel = async (actor: Actor, channelId: bigint) => {
    const { member } = await membershipOf(actor, channelId);
    if (member.role !== "OWNER") throw new ApiError(403, "CHANNEL_OWNER_REQUIRED", "Only the owner can delete the channel");
    await prisma.channel.update({ where: { channel_id: channelId }, data: { deleted_at: new Date() } });
};

/** The owner makes a follower from the same organization an admin. */
export const addAdmin = async (actor: Actor, channelId: bigint, target: unknown) => {
    const { channel, member } = await membershipOf(actor, channelId);
    if (member.role !== "OWNER") throw new ApiError(403, "CHANNEL_OWNER_REQUIRED", "Only the owner can add admins");
    if (typeof target !== "string" || !ID.test(target)) throw new ApiError(400, "VALIDATION_ERROR", "userOrganizationId is required");
    const person = await prisma.user_organization.findFirst({ where: { user_organization_id: BigInt(target), org_id: channel.org_id, deleted_at: null } });
    if (!person) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
    await prisma.channel_member.upsert({
        where: { channel_id_user_organization_id: { channel_id: channelId, user_organization_id: person.user_organization_id } },
        create: { channel_id: channelId, user_organization_id: person.user_organization_id, role: "ADMIN" },
        update: { role: "ADMIN" },
    });
};
