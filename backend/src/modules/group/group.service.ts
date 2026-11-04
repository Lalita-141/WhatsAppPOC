import crypto from "node:crypto";
import prisma from "../../config/database.js";
import { ApiError } from "../../utils/api-error.js";
import { Prisma } from "../../generated/prisma/client.js";
import { assertCanMessage, assertFileSharing, MAX_MESSAGE_LENGTH } from "../chat/messages/message.service.js";
import { attachableMedia } from "../media/media.service.js";
import { mediaDtoSelect, toMediaDto } from "../media/media.dto.js";
import {
    getOrganizationSetting,
    hasPermission,
    organizationsCanCommunicate,
} from "../policy/communication.policy.js";

export const MAX_GROUP_MEMBERS = 256;
const DELETE_WINDOW_MS = 48 * 60 * 60 * 1000;
const CLIENT_MESSAGE_ID = /^[A-Za-z0-9_-]{8,64}$/;
const ID = /^\d{1,20}$/;
const MUTED_FOREVER = new Date("9999-12-31T00:00:00Z");

export interface Actor {
    userOrganizationId: bigint;
    organizationId: bigint;
}

const fullName = (u: { first_name: string; last_name: string | null }) =>
    [u.first_name, u.last_name].filter(Boolean).join(" ");

const idList = (value: unknown, name: string) => {
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && ID.test(v))) {
        throw new ApiError(400, "VALIDATION_ERROR", `${name} must be a list of IDs`);
    }
    return [...new Set(value as string[])].map((v) => BigInt(v));
};

// ---------------------------------------------------------------- access

const activeGroup = async (groupId: bigint) => {
    const group = await prisma.wp_group.findFirst({ where: { group_id: groupId, deleted_at: null } });
    if (!group) throw new ApiError(404, "GROUP_NOT_FOUND", "Group not found");
    return group;
};

/**
 * A member takes part while their organization may communicate with the
 * group's organization. When a relationship is revoked, external members are
 * suspended rather than removed: they keep history but stop sending and
 * receiving until the relationship returns.
 */
const participates = async (groupOrg: bigint, memberUserOrgId: bigint) => {
    const membership = await prisma.user_organization.findUnique({
        where: { user_organization_id: memberUserOrgId },
        select: { org_id: true, deleted_at: true },
    });
    return Boolean(membership && !membership.deleted_at && (await organizationsCanCommunicate(groupOrg, membership.org_id)));
};

/** The caller's membership; "not a member" looks the same as "no such group". */
export const requireMember = async (groupId: bigint, userOrganizationId: bigint) => {
    const group = await activeGroup(groupId);
    const member = await prisma.group_member.findFirst({
        where: { group_id: groupId, user_organization_id: userOrganizationId, deleted_at: null },
    });
    if (!member) throw new ApiError(404, "GROUP_NOT_FOUND", "Group not found");
    return { group, member };
};

const requireAdmin = async (groupId: bigint, actor: bigint) => {
    const access = await requireMember(groupId, actor);
    if (access.member.role !== "ADMIN") throw new ApiError(403, "GROUP_ADMIN_REQUIRED", "Only group admins can do this");
    return access;
};

const activeMemberIds = async (groupId: bigint) =>
    (await prisma.group_member.findMany({
        where: { group_id: groupId, deleted_at: null },
        select: { user_organization_id: true },
    })).map((m) => m.user_organization_id);

/** Members who currently receive messages (suspended external members excluded). */
export const participatingMemberIds = async (groupId: bigint, groupOrg: bigint) => {
    const ids = await activeMemberIds(groupId);
    const result: bigint[] = [];
    for (const id of ids) if (await participates(groupOrg, id)) result.push(id);
    return result;
};

/**
 * Checks people being added: reachable by the actor, and, for people outside
 * the group's organization, allowed by that organization's external
 * participant setting.
 */
const checkNewMembers = async (actor: Actor, groupOrg: bigint, ids: bigint[]) => {
    const setting = await getOrganizationSetting(groupOrg);
    for (const id of ids) {
        await assertCanMessage(actor.userOrganizationId, id);
        const membership = await prisma.user_organization.findUniqueOrThrow({ where: { user_organization_id: id }, select: { org_id: true } });
        if (membership.org_id !== groupOrg) {
            const actorInGroupOrg = actor.organizationId === groupOrg;
            if (!actorInGroupOrg || !(await hasPermission(setting.external_participants, actor.userOrganizationId))) {
                throw new ApiError(403, "EXTERNAL_MEMBERS_NOT_ALLOWED", "You cannot add people from other organizations to this group");
            }
            if (!(await organizationsCanCommunicate(groupOrg, membership.org_id))) {
                throw new ApiError(403, "CANNOT_MESSAGE", "You cannot add this user");
            }
        }
    }
};

// ---------------------------------------------------------------- messages

const groupMessageSelect = {
    group_chat_id: true,
    group_id: true,
    sender_user_organization_id: true,
    message: true,
    message_type: true,
    client_message_id: true,
    forwarded: true,
    send_time: true,
    deleted_for_everyone_at: true,
    media_file: { select: mediaDtoSelect },
    user_organization: { select: { user_master: { select: { first_name: true, last_name: true } } } },
    reply_to: {
        select: {
            group_chat_id: true,
            sender_user_organization_id: true,
            message: true,
            deleted_for_everyone_at: true,
            user_organization: { select: { user_master: { select: { first_name: true, last_name: true } } } },
        },
    },
    group_chat_view: { select: { received_time: true, read_time: true } },
} satisfies Prisma.group_chatSelect;

export type GroupMessageRow = Prisma.group_chatGetPayload<{ select: typeof groupMessageSelect }>;

export const toGroupMessageDto = (row: GroupMessageRow, viewer: bigint) => {
    const isMine = row.sender_user_organization_id === viewer;
    const views = row.group_chat_view;
    // Only the sender sees delivery state, summarized across members.
    const status = !isMine || views.length === 0
        ? "SENT"
        : views.every((v) => v.read_time)
        ? "SEEN"
        : views.every((v) => v.received_time)
        ? "DELIVERED"
        : "SENT";

    return {
        messageId: row.group_chat_id.toString(),
        groupId: row.group_id.toString(),
        clientMessageId: isMine ? row.client_message_id : null,
        senderUserOrganizationId: row.sender_user_organization_id.toString(),
        senderName: fullName(row.user_organization.user_master),
        message: row.deleted_for_everyone_at ? null : row.message,
        messageType: row.message_type,
        media: row.deleted_for_everyone_at || !row.media_file ? null : toMediaDto(row.media_file),
        sendTime: row.send_time,
        isMine,
        forwarded: row.forwarded,
        isDeleted: Boolean(row.deleted_for_everyone_at),
        status,
        replyTo: row.reply_to
            ? {
                messageId: row.reply_to.group_chat_id.toString(),
                senderUserOrganizationId: row.reply_to.sender_user_organization_id.toString(),
                senderName: fullName(row.reply_to.user_organization.user_master),
                message: row.reply_to.deleted_for_everyone_at ? null : row.reply_to.message,
                isDeleted: Boolean(row.reply_to.deleted_for_everyone_at),
            }
            : null,
    };
};

/** Group events ("Asha added Ravi") are stored as SYSTEM messages so every member sees them in order. */
const systemMessage = async (groupId: bigint, actor: bigint, text: string, tx: Prisma.TransactionClient = prisma) =>
    tx.group_chat.create({
        data: { group_id: groupId, sender_user_organization_id: actor, message: text, message_type: "SYSTEM", created_by: actor },
        select: groupMessageSelect,
    });

const nameOf = async (userOrganizationId: bigint) => {
    const m = await prisma.user_organization.findUnique({
        where: { user_organization_id: userOrganizationId },
        select: { user_master: { select: { first_name: true, last_name: true } } },
    });
    return m ? fullName(m.user_master) : "Someone";
};

export const sendGroupMessage = async (input: {
    sender: bigint;
    groupId: bigint;
    message: unknown;
    clientMessageId?: unknown;
    replyToMessageId?: bigint | null;
    forwarded?: boolean;
    mediaId?: bigint | null;
}) => {
    const text = typeof input.message === "string" ? input.message.trim() : "";
    if (!text && !input.mediaId) throw new ApiError(400, "MESSAGE_REQUIRED", "Message is required");
    if (text.length > MAX_MESSAGE_LENGTH) throw new ApiError(400, "INVALID_MESSAGE", `Message must be at most ${MAX_MESSAGE_LENGTH} characters`);

    let clientMessageId: string | undefined;
    if (input.clientMessageId !== undefined && input.clientMessageId !== null) {
        if (typeof input.clientMessageId !== "string" || !CLIENT_MESSAGE_ID.test(input.clientMessageId)) {
            throw new ApiError(400, "INVALID_CLIENT_MESSAGE_ID", "clientMessageId must be 8-64 letters, digits, _ or -");
        }
        clientMessageId = input.clientMessageId;
        const existing = await prisma.group_chat.findUnique({
            where: { sender_user_organization_id_client_message_id: { sender_user_organization_id: input.sender, client_message_id: clientMessageId } },
            select: groupMessageSelect,
        });
        if (existing) {
            if (existing.group_id !== input.groupId) throw new ApiError(409, "CLIENT_MESSAGE_ID_REUSED", "clientMessageId was already used");
            return { row: existing, recipients: [] as bigint[], created: false };
        }
    }

    const { group, member } = await requireMember(input.groupId, input.sender);
    if (!(await participates(group.org_id, input.sender))) {
        throw new ApiError(403, "GROUP_SUSPENDED", "Your organization can no longer take part in this group");
    }
    if (group.only_admins_can_send && member.role !== "ADMIN") {
        throw new ApiError(403, "ONLY_ADMINS_CAN_SEND", "Only admins can send messages in this group");
    }

    let messageType = "TEXT";
    if (input.mediaId) {
        const media = await attachableMedia(input.sender, input.mediaId, Boolean(input.forwarded));
        await assertFileSharing(input.sender);
        if (!(await getOrganizationSetting(group.org_id)).file_sharing_enabled) {
            throw new ApiError(403, "FILE_SHARING_DISABLED", "File sharing is turned off for this group");
        }
        messageType = media.kind;
    }

    let replyTo: bigint | undefined;
    if (input.replyToMessageId) {
        const target = await prisma.group_chat.findFirst({
            where: { group_chat_id: input.replyToMessageId, group_id: input.groupId, deleted_at: null, deleted_for_everyone_at: null, message_type: { not: "SYSTEM" } },
        });
        if (!target) throw new ApiError(400, "INVALID_REPLY", "You can only reply to a message in this group");
        replyTo = target.group_chat_id;
    }

    const recipients = (await participatingMemberIds(input.groupId, group.org_id)).filter((id) => id !== input.sender);

    try {
        const row = await prisma.$transaction(async (tx) => {
            const created = await tx.group_chat.create({
                data: {
                    group_id: input.groupId,
                    sender_user_organization_id: input.sender,
                    message: text,
                    client_message_id: clientMessageId,
                    reply_to_group_chat_id: replyTo,
                    forwarded: Boolean(input.forwarded),
                    media_id: input.mediaId ?? undefined,
                    message_type: messageType,
                    created_by: input.sender,
                },
                select: { group_chat_id: true },
            });
            if (recipients.length) {
                await tx.group_chat_view.createMany({
                    data: recipients.map((id) => ({ group_chat_id: created.group_chat_id, received_to_user_organization_id: id })),
                });
            }
            await tx.group_member.update({ where: { group_member_id: member.group_member_id }, data: { last_read_group_chat_id: created.group_chat_id } });
            return tx.group_chat.findUniqueOrThrow({ where: { group_chat_id: created.group_chat_id }, select: groupMessageSelect });
        });
        return { row, recipients, created: true };
    } catch (error) {
        if (clientMessageId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
            const existing = await prisma.group_chat.findUniqueOrThrow({
                where: { sender_user_organization_id_client_message_id: { sender_user_organization_id: input.sender, client_message_id: clientMessageId } },
                select: groupMessageSelect,
            });
            return { row: existing, recipients: [] as bigint[], created: false };
        }
        throw error;
    }
};

export const markGroupDelivered = async (viewer: bigint, ids: bigint[]) => {
    const pending = await prisma.group_chat_view.findMany({
        where: { group_chat_id: { in: ids.slice(0, 500) }, received_to_user_organization_id: viewer, received_time: null },
        select: { group_chat_id: true, group_chat: { select: { group_id: true, sender_user_organization_id: true } } },
    });
    if (pending.length === 0) return [];
    await prisma.group_chat_view.updateMany({
        where: { group_chat_id: { in: pending.map((p) => p.group_chat_id) }, received_to_user_organization_id: viewer },
        data: { received_time: new Date() },
    });
    return pending.map((p) => ({ messageId: p.group_chat_id, groupId: p.group_chat.group_id, sender: p.group_chat.sender_user_organization_id }));
};

/** Moves the read position to the newest message and, if the reader allows receipts, records reads. */
export const markGroupRead = async (viewer: bigint, groupId: bigint) => {
    const { member } = await requireMember(groupId, viewer);
    const newest = await prisma.group_chat.findFirst({ where: { group_id: groupId, deleted_at: null }, orderBy: { group_chat_id: "desc" }, select: { group_chat_id: true } });
    if (!newest || (member.last_read_group_chat_id && member.last_read_group_chat_id >= newest.group_chat_id)) return [];

    await prisma.group_member.update({ where: { group_member_id: member.group_member_id }, data: { last_read_group_chat_id: newest.group_chat_id } });

    const setting = await prisma.user_setting.findUnique({ where: { user_organization_id: viewer }, select: { read_receipts: true } });
    if (setting?.read_receipts === false) return [];

    const unread = await prisma.group_chat_view.findMany({
        where: { received_to_user_organization_id: viewer, read_time: null, group_chat: { group_id: groupId } },
        select: { group_chat_id: true, group_chat: { select: { sender_user_organization_id: true } } },
    });
    if (unread.length === 0) return [];
    const now = new Date();
    await prisma.group_chat_view.updateMany({
        where: { received_to_user_organization_id: viewer, group_chat_id: { in: unread.map((u) => u.group_chat_id) } },
        data: { read_time: now, received_time: now, read_by_user_organization_id: viewer },
    });
    return unread.map((u) => ({ messageId: u.group_chat_id, sender: u.group_chat.sender_user_organization_id }));
};

export const groupHistory = async (viewer: bigint, groupId: bigint, limit: number, before?: bigint) => {
    const { member } = await requireMember(groupId, viewer);
    // Members see messages from when they joined, not earlier history.
    const rows = await prisma.group_chat.findMany({
        where: {
            group_id: groupId,
            deleted_at: null,
            send_time: { gte: member.joined_at },
            ...(before ? { group_chat_id: { lt: before } } : {}),
        },
        orderBy: { group_chat_id: "desc" },
        take: limit,
        select: groupMessageSelect,
    });
    return {
        messages: rows.map((r) => toGroupMessageDto(r, viewer)).reverse(),
        pagination: { limit, hasMore: rows.length === limit, nextCursor: rows.length ? rows[rows.length - 1].group_chat_id.toString() : null },
    };
};

const escapeLike = (text: string) => text.replace(/[\\%_]/g, (c) => `\\${c}`);

export const searchGroup = async (viewer: bigint, groupId: bigint, query: unknown) => {
    const { member } = await requireMember(groupId, viewer);
    if (typeof query !== "string" || query.trim().length < 2 || query.length > 100) {
        throw new ApiError(400, "INVALID_QUERY", "Search for 2 to 100 characters");
    }
    const rows = await prisma.group_chat.findMany({
        where: {
            group_id: groupId,
            deleted_at: null,
            deleted_for_everyone_at: null,
            message_type: { not: "SYSTEM" },
            send_time: { gte: member.joined_at },
            message: { contains: escapeLike(query.trim()) },
        },
        orderBy: { group_chat_id: "desc" },
        take: 30,
        select: groupMessageSelect,
    });
    return rows.map((r) => toGroupMessageDto(r, viewer));
};

/** Per-member delivery and read times, for the sender only. */
export const messageReceipts = async (viewer: bigint, groupId: bigint, messageId: bigint) => {
    await requireMember(groupId, viewer);
    const message = await prisma.group_chat.findFirst({ where: { group_chat_id: messageId, group_id: groupId, sender_user_organization_id: viewer } });
    if (!message) throw new ApiError(404, "MESSAGE_NOT_FOUND", "Message not found");
    const views = await prisma.group_chat_view.findMany({
        where: { group_chat_id: messageId },
        select: {
            received_time: true,
            read_time: true,
            user_organization_group_chat_view_received_to_user_organization_idTouser_organization: {
                select: { user_organization_id: true, user_master: { select: { first_name: true, last_name: true } } },
            },
        },
    });
    return views.map((v) => {
        const person = v.user_organization_group_chat_view_received_to_user_organization_idTouser_organization;
        return {
            userOrganizationId: person.user_organization_id.toString(),
            name: fullName(person.user_master),
            deliveredAt: v.received_time,
            readAt: v.read_time,
        };
    });
};

export const deleteGroupMessage = async (actor: bigint, groupId: bigint, messageId: bigint) => {
    const { member } = await requireMember(groupId, actor);
    const message = await prisma.group_chat.findFirst({ where: { group_chat_id: messageId, group_id: groupId, deleted_at: null, message_type: { not: "SYSTEM" } } });
    if (!message) throw new ApiError(404, "MESSAGE_NOT_FOUND", "Message not found");
    const isSender = message.sender_user_organization_id === actor;
    if (!isSender && member.role !== "ADMIN") throw new ApiError(403, "NOT_SENDER", "You can only delete your own messages");
    if (isSender && member.role !== "ADMIN" && Date.now() - message.send_time.getTime() > DELETE_WINDOW_MS) {
        throw new ApiError(400, "DELETE_WINDOW_PASSED", "Messages can only be deleted for everyone within 48 hours");
    }
    return prisma.group_chat.update({
        where: { group_chat_id: messageId },
        data: { message: null, media: Prisma.DbNull, media_id: null, deleted_for_everyone_at: new Date(), updated_by: actor, updated_at: new Date() },
        select: groupMessageSelect,
    });
};

// ---------------------------------------------------------------- groups

const toGroupSummary = async (viewer: bigint, groupId: bigint) => {
    const group = await prisma.wp_group.findUniqueOrThrow({ where: { group_id: groupId } });
    const member = await prisma.group_member.findFirst({ where: { group_id: groupId, user_organization_id: viewer, deleted_at: null } });
    const last = await prisma.group_chat.findFirst({
        where: { group_id: groupId, deleted_at: null, ...(member ? { send_time: { gte: member.joined_at } } : {}) },
        orderBy: { group_chat_id: "desc" },
        select: groupMessageSelect,
    });
    const unreadCount = member
        ? await prisma.group_chat.count({
            where: {
                group_id: groupId,
                deleted_at: null,
                sender_user_organization_id: { not: viewer },
                send_time: { gte: member.joined_at },
                ...(member.last_read_group_chat_id ? { group_chat_id: { gt: member.last_read_group_chat_id } } : {}),
            },
        })
        : 0;
    return {
        groupId: group.group_id.toString(),
        name: group.group_name,
        description: group.group_description,
        icon: group.group_icon,
        lastMessage: last ? toGroupMessageDto(last, viewer) : null,
        unreadCount,
        isAdmin: member?.role === "ADMIN",
        isPinned: Boolean(member?.pinned_at),
        isArchived: Boolean(member?.archived_at),
        mutedUntil: member?.muted_until && member.muted_until.getTime() > Date.now() ? member.muted_until : null,
        onlyAdminsCanSend: group.only_admins_can_send,
    };
};

export const listGroups = async (viewer: bigint) => {
    const memberships = await prisma.group_member.findMany({
        where: { user_organization_id: viewer, deleted_at: null, wp_group: { deleted_at: null } },
        select: { group_id: true },
    });
    const groups = [];
    for (const m of memberships) groups.push(await toGroupSummary(viewer, m.group_id));
    return groups.sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return Number(BigInt(b.lastMessage?.messageId ?? "0") - BigInt(a.lastMessage?.messageId ?? "0"));
    });
};

export const getGroupInfo = async (viewer: bigint, groupId: bigint) => {
    const { group, member } = await requireMember(groupId, viewer);
    const members = await prisma.group_member.findMany({
        where: { group_id: groupId, deleted_at: null },
        orderBy: [{ role: "asc" }, { joined_at: "asc" }],
        select: {
            role: true,
            user_organization: {
                select: {
                    user_organization_id: true,
                    org_id: true,
                    user_master: { select: { first_name: true, last_name: true } },
                    organization_master: { select: { organization_name: true } },
                },
            },
        },
    });
    const result = [];
    for (const m of members) {
        const external = m.user_organization.org_id !== group.org_id;
        result.push({
            userOrganizationId: m.user_organization.user_organization_id.toString(),
            name: fullName(m.user_organization.user_master),
            role: m.role,
            organizationName: external ? m.user_organization.organization_master.organization_name : null,
            isSuspended: external && !(await participates(group.org_id, m.user_organization.user_organization_id)),
            isYou: m.user_organization.user_organization_id === viewer,
        });
    }
    return {
        ...(await toGroupSummary(viewer, groupId)),
        onlyAdminsCanEditInfo: group.only_admins_can_edit_info,
        inviteCode: member.role === "ADMIN" ? group.invite_code : null,
        createdAt: group.created_at,
        members: result,
    };
};

export const createGroup = async (actor: Actor, body: unknown) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const setting = await getOrganizationSetting(actor.organizationId);
    if (!(await hasPermission(setting.group_creation, actor.userOrganizationId))) {
        throw new ApiError(403, "GROUP_CREATION_NOT_ALLOWED", "You are not allowed to create groups");
    }
    const name = typeof input.name === "string" ? input.name.trim() : "";
    if (!name || name.length > 150) throw new ApiError(400, "VALIDATION_ERROR", "name must be 1 to 150 characters");
    const description = input.description === undefined ? null : typeof input.description === "string" ? input.description.trim().slice(0, 500) || null : undefined;
    if (description === undefined) throw new ApiError(400, "VALIDATION_ERROR", "description must be text");

    const memberIds = idList(input.memberIds ?? [], "memberIds").filter((id) => id !== actor.userOrganizationId);
    if (memberIds.length + 1 > MAX_GROUP_MEMBERS) throw new ApiError(400, "GROUP_TOO_LARGE", `A group can have up to ${MAX_GROUP_MEMBERS} members`);
    await checkNewMembers(actor, actor.organizationId, memberIds);

    const creatorName = await nameOf(actor.userOrganizationId);
    const group = await prisma.$transaction(async (tx) => {
        const created = await tx.wp_group.create({
            data: { org_id: actor.organizationId, group_name: name, group_description: description, created_by: actor.userOrganizationId },
        });
        await tx.group_member.createMany({
            data: [
                { group_id: created.group_id, user_organization_id: actor.userOrganizationId, role: "ADMIN", created_by: actor.userOrganizationId },
                ...memberIds.map((id) => ({ group_id: created.group_id, user_organization_id: id, invited_by: actor.userOrganizationId, created_by: actor.userOrganizationId })),
            ],
        });
        await systemMessage(created.group_id, actor.userOrganizationId, `${creatorName} created the group "${name}"`, tx);
        return created;
    });

    return { group: await getGroupInfo(actor.userOrganizationId, group.group_id), memberIds: [actor.userOrganizationId, ...memberIds] };
};

export const updateGroup = async (actor: bigint, groupId: bigint, body: unknown) => {
    const { group, member } = await requireMember(groupId, actor);
    const input = (body ?? {}) as Record<string, unknown>;
    const isAdmin = member.role === "ADMIN";
    const data: Prisma.wp_groupUpdateInput = {};
    const events: string[] = [];
    const who = await nameOf(actor);

    if ("name" in input || "description" in input) {
        if (group.only_admins_can_edit_info && !isAdmin) throw new ApiError(403, "GROUP_ADMIN_REQUIRED", "Only admins can edit group info");
        if ("name" in input) {
            if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 150) {
                throw new ApiError(400, "VALIDATION_ERROR", "name must be 1 to 150 characters");
            }
            data.group_name = input.name.trim();
            events.push(`${who} changed the group name to "${data.group_name}"`);
        }
        if ("description" in input) {
            if (input.description !== null && typeof input.description !== "string") throw new ApiError(400, "VALIDATION_ERROR", "description must be text");
            data.group_description = (input.description as string | null)?.trim().slice(0, 500) || null;
            events.push(`${who} changed the group description`);
        }
    }
    for (const [key, column] of [["onlyAdminsCanSend", "only_admins_can_send"], ["onlyAdminsCanEditInfo", "only_admins_can_edit_info"]] as const) {
        if (key in input) {
            if (!isAdmin) throw new ApiError(403, "GROUP_ADMIN_REQUIRED", "Only admins can change group settings");
            if (typeof input[key] !== "boolean") throw new ApiError(400, "VALIDATION_ERROR", `${key} must be true or false`);
            data[column] = input[key] as boolean;
            if (key === "onlyAdminsCanSend") events.push(input[key] ? `${who} allowed only admins to send messages` : `${who} allowed all members to send messages`);
        }
    }
    if (Object.keys(data).length === 0) throw new ApiError(400, "VALIDATION_ERROR", "Nothing to change");

    await prisma.wp_group.update({ where: { group_id: groupId }, data: { ...data, updated_by: actor, updated_at: new Date() } });
    const systemRows = [];
    for (const event of events) systemRows.push(await systemMessage(groupId, actor, event));
    return { systemRows };
};

export const deleteGroup = async (actor: bigint, groupId: bigint) => {
    await requireAdmin(groupId, actor);
    const members = await activeMemberIds(groupId);
    await prisma.wp_group.update({ where: { group_id: groupId }, data: { deleted_at: new Date(), deleted_by: actor, invite_code: null } });
    return members;
};

export const addMembers = async (actor: Actor, groupId: bigint, body: unknown) => {
    const { group } = await requireAdmin(groupId, actor.userOrganizationId);
    const ids = idList((body as Record<string, unknown> | undefined)?.userOrganizationIds, "userOrganizationIds");
    if (ids.length === 0) throw new ApiError(400, "VALIDATION_ERROR", "Choose at least one person");

    const current = await activeMemberIds(groupId);
    const newIds = ids.filter((id) => !current.includes(id));
    if (current.length + newIds.length > MAX_GROUP_MEMBERS) throw new ApiError(400, "GROUP_TOO_LARGE", `A group can have up to ${MAX_GROUP_MEMBERS} members`);
    await checkNewMembers(actor, group.org_id, newIds);

    const who = await nameOf(actor.userOrganizationId);
    const systemRows = [];
    for (const id of newIds) {
        // A previous member's row is revived, because the pair is unique.
        await prisma.group_member.upsert({
            where: { group_id_user_organization_id: { group_id: groupId, user_organization_id: id } },
            create: { group_id: groupId, user_organization_id: id, invited_by: actor.userOrganizationId, created_by: actor.userOrganizationId },
            update: { deleted_at: null, deleted_by: null, role: "USER", joined_at: new Date(), last_read_group_chat_id: null, invited_by: actor.userOrganizationId, muted_until: null, pinned_at: null, archived_at: null },
        });
        systemRows.push(await systemMessage(groupId, actor.userOrganizationId, `${who} added ${await nameOf(id)}`));
    }
    return { added: newIds, systemRows };
};

const ensureAnotherAdmin = async (groupId: bigint, leaving: bigint) => {
    const admins = await prisma.group_member.count({ where: { group_id: groupId, deleted_at: null, role: "ADMIN", user_organization_id: { not: leaving } } });
    if (admins > 0) return;
    // Hand admin to the longest-standing remaining member, as WhatsApp does.
    const next = await prisma.group_member.findFirst({
        where: { group_id: groupId, deleted_at: null, user_organization_id: { not: leaving } },
        orderBy: { joined_at: "asc" },
    });
    if (next) await prisma.group_member.update({ where: { group_member_id: next.group_member_id }, data: { role: "ADMIN" } });
};

export const removeMember = async (actor: bigint, groupId: bigint, target: bigint) => {
    await requireAdmin(groupId, actor);
    if (target === actor) throw new ApiError(400, "USE_LEAVE", "Use leave to exit the group yourself");
    const member = await prisma.group_member.findFirst({ where: { group_id: groupId, user_organization_id: target, deleted_at: null } });
    if (!member) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
    await prisma.group_member.update({ where: { group_member_id: member.group_member_id }, data: { deleted_at: new Date(), deleted_by: actor } });
    return systemMessage(groupId, actor, `${await nameOf(actor)} removed ${await nameOf(target)}`);
};

export const leaveGroup = async (actor: bigint, groupId: bigint) => {
    const { member } = await requireMember(groupId, actor);
    await ensureAnotherAdmin(groupId, actor);
    await prisma.group_member.update({ where: { group_member_id: member.group_member_id }, data: { deleted_at: new Date(), deleted_by: actor } });
    const remaining = await activeMemberIds(groupId);
    if (remaining.length === 0) {
        await prisma.wp_group.update({ where: { group_id: groupId }, data: { deleted_at: new Date(), deleted_by: actor, invite_code: null } });
        return null;
    }
    return systemMessage(groupId, actor, `${await nameOf(actor)} left`);
};

export const setMemberRole = async (actor: bigint, groupId: bigint, target: bigint, role: unknown) => {
    await requireAdmin(groupId, actor);
    if (role !== "ADMIN" && role !== "USER") throw new ApiError(400, "VALIDATION_ERROR", "role must be ADMIN or USER");
    const member = await prisma.group_member.findFirst({ where: { group_id: groupId, user_organization_id: target, deleted_at: null } });
    if (!member) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
    if (role === "USER" && member.role === "ADMIN") {
        const admins = await prisma.group_member.count({ where: { group_id: groupId, deleted_at: null, role: "ADMIN" } });
        if (admins <= 1) throw new ApiError(400, "LAST_ADMIN", "A group needs at least one admin");
    }
    await prisma.group_member.update({ where: { group_member_id: member.group_member_id }, data: { role } });
    return systemMessage(groupId, actor, role === "ADMIN" ? `${await nameOf(actor)} made ${await nameOf(target)} an admin` : `${await nameOf(actor)} removed ${await nameOf(target)} as admin`);
};

export const createInviteLink = async (actor: bigint, groupId: bigint) => {
    await requireAdmin(groupId, actor);
    const code = crypto.randomBytes(12).toString("base64url");
    await prisma.wp_group.update({ where: { group_id: groupId }, data: { invite_code: code } });
    return { inviteCode: code };
};

export const revokeInviteLink = async (actor: bigint, groupId: bigint) => {
    await requireAdmin(groupId, actor);
    await prisma.wp_group.update({ where: { group_id: groupId }, data: { invite_code: null } });
};

/** Joining by link still obeys the organization policy for people from other organizations. */
export const joinByCode = async (actor: Actor, code: string) => {
    if (!/^[A-Za-z0-9_-]{16}$/.test(code)) throw new ApiError(404, "INVITE_NOT_FOUND", "Invite link not found");
    const group = await prisma.wp_group.findFirst({ where: { invite_code: code, deleted_at: null } });
    if (!group) throw new ApiError(404, "INVITE_NOT_FOUND", "Invite link not found");
    if (!(await organizationsCanCommunicate(group.org_id, actor.organizationId))) {
        throw new ApiError(404, "INVITE_NOT_FOUND", "Invite link not found");
    }
    const existing = await prisma.group_member.findUnique({ where: { group_id_user_organization_id: { group_id: group.group_id, user_organization_id: actor.userOrganizationId } } });
    if (existing && !existing.deleted_at) return { groupId: group.group_id, systemRow: null };
    if ((await activeMemberIds(group.group_id)).length >= MAX_GROUP_MEMBERS) throw new ApiError(400, "GROUP_TOO_LARGE", "This group is full");

    await prisma.group_member.upsert({
        where: { group_id_user_organization_id: { group_id: group.group_id, user_organization_id: actor.userOrganizationId } },
        create: { group_id: group.group_id, user_organization_id: actor.userOrganizationId, created_by: actor.userOrganizationId },
        update: { deleted_at: null, deleted_by: null, role: "USER", joined_at: new Date(), last_read_group_chat_id: null, muted_until: null, pinned_at: null, archived_at: null },
    });
    return { groupId: group.group_id, systemRow: await systemMessage(group.group_id, actor.userOrganizationId, `${await nameOf(actor.userOrganizationId)} joined using the invite link`) };
};

export const updatePreferences = async (viewer: bigint, groupId: bigint, body: unknown) => {
    const { member } = await requireMember(groupId, viewer);
    const input = (body ?? {}) as Record<string, unknown>;
    const data: { muted_until?: Date | null; pinned_at?: Date | null; archived_at?: Date | null } = {};
    if ("muted" in input) {
        const durations: Record<string, number> = { "8h": 8 * 3600 * 1000, "1w": 7 * 24 * 3600 * 1000 };
        if (input.muted === false) data.muted_until = null;
        else if (input.muted === "forever") data.muted_until = MUTED_FOREVER;
        else if (typeof input.muted === "string" && durations[input.muted]) data.muted_until = new Date(Date.now() + durations[input.muted]);
        else throw new ApiError(400, "VALIDATION_ERROR", "muted must be 8h, 1w, forever or false");
    }
    if ("pinned" in input) {
        if (typeof input.pinned !== "boolean") throw new ApiError(400, "VALIDATION_ERROR", "pinned must be true or false");
        data.pinned_at = input.pinned ? member.pinned_at ?? new Date() : null;
    }
    if ("archived" in input) {
        if (typeof input.archived !== "boolean") throw new ApiError(400, "VALIDATION_ERROR", "archived must be true or false");
        data.archived_at = input.archived ? new Date() : null;
        if (input.archived) data.pinned_at = null;
    }
    if (Object.keys(data).length === 0) throw new ApiError(400, "VALIDATION_ERROR", "Send muted, pinned or archived");
    await prisma.group_member.update({ where: { group_member_id: member.group_member_id }, data });
    return toGroupSummary(viewer, groupId);
};

export const isGroupMuted = async (groupId: bigint, member: bigint) => {
    const row = await prisma.group_member.findFirst({ where: { group_id: groupId, user_organization_id: member, deleted_at: null }, select: { muted_until: true } });
    return Boolean(row?.muted_until && row.muted_until.getTime() > Date.now());
};

export const groupMessageById = (messageId: bigint) =>
    prisma.group_chat.findUniqueOrThrow({ where: { group_chat_id: messageId }, select: groupMessageSelect });
