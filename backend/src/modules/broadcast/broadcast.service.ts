import prisma from "../../config/database.js";
import { ApiError } from "../../utils/api-error.js";
import { getRegisteredSocketServer } from "../../socket/socket.registry.js";
import { userRoom } from "../../socket/presence.state.js";
import { deliverNewMessage } from "../../socket/delivery.js";
import { sendPushNotification } from "../notification/notification.service.js";
import { sendMessage } from "../chat/messages/message.service.js";
import {
    getOrganizationSetting,
    hasPermission,
    isOrganizationAdmin,
    organizationsCanCommunicate,
    writeAuditLog,
} from "../policy/communication.policy.js";

const MAX_TARGET_ORGS = 20;
const MAX_RECIPIENTS = 10000;
const ID = /^\d{1,20}$/;

interface Sender {
    userOrganizationId: bigint;
    organizationId: bigint;
}

const ids = (value: unknown, name: string) => {
    if (value === undefined) return [];
    if (!Array.isArray(value) || !value.every((v) => typeof v === "string" && ID.test(v))) {
        throw new ApiError(400, "VALIDATION_ERROR", `${name} must be a list of IDs`);
    }
    return [...new Set(value as string[])].map((v) => BigInt(v));
};

const fullName = (u: { first_name: string; last_name: string | null }) =>
    [u.first_name, u.last_name].filter(Boolean).join(" ");

/**
 * Sends one message to several organizations. Each recipient gets a private
 * copy showing only the sender and the sender's organization. Departments and
 * individual members can only be chosen inside the sender's own organization;
 * other organizations are always addressed as a whole, so their structure is
 * never exposed.
 */
export const createBroadcast = async (sender: Sender, body: unknown) => {
    const input = (body ?? {}) as Record<string, unknown>;
    const setting = await getOrganizationSetting(sender.organizationId);

    if (!(await hasPermission(setting.broadcast_permission, sender.userOrganizationId))) {
        throw new ApiError(403, "BROADCAST_NOT_ALLOWED", "You are not allowed to send broadcasts");
    }

    const message = typeof input.message === "string" ? input.message.trim() : "";
    if (!message || message.length > 5000) {
        throw new ApiError(400, "VALIDATION_ERROR", "message must be 1 to 5000 characters");
    }
    const title = input.title === undefined ? null : typeof input.title === "string" ? input.title.trim().slice(0, 150) || null : undefined;
    if (title === undefined) throw new ApiError(400, "VALIDATION_ERROR", "title must be text");
    if (input.isAnnouncement !== undefined && typeof input.isAnnouncement !== "boolean") {
        throw new ApiError(400, "VALIDATION_ERROR", "isAnnouncement must be true or false");
    }
    const isAnnouncement = input.isAnnouncement !== false;

    if (!Array.isArray(input.targets) || input.targets.length === 0 || input.targets.length > MAX_TARGET_ORGS) {
        throw new ApiError(400, "VALIDATION_ERROR", `Choose 1 to ${MAX_TARGET_ORGS} organizations`);
    }

    const targets: { orgId: bigint; departmentIds: bigint[]; memberIds: bigint[] }[] = [];
    for (const raw of input.targets as Record<string, unknown>[]) {
        if (typeof raw?.organizationId !== "string" || !ID.test(raw.organizationId)) {
            throw new ApiError(400, "VALIDATION_ERROR", "Each target needs an organizationId");
        }
        const orgId = BigInt(raw.organizationId);
        if (targets.some((t) => t.orgId === orgId)) {
            throw new ApiError(400, "VALIDATION_ERROR", "Each organization can appear once");
        }
        const departmentIds = ids(raw.departmentIds, "departmentIds");
        const memberIds = ids(raw.userOrganizationIds, "userOrganizationIds");
        if (orgId !== sender.organizationId && (departmentIds.length || memberIds.length)) {
            throw new ApiError(400, "VALIDATION_ERROR", "Other organizations can only be addressed as a whole");
        }
        // Same answer for "not allowed" and "does not exist".
        const org = await prisma.organization_master.findFirst({ where: { org_id: orgId, deleted_at: null } });
        if (!org || !(await organizationsCanCommunicate(sender.organizationId, orgId))) {
            throw new ApiError(403, "TARGET_NOT_ALLOWED", "You cannot send to one of the chosen organizations");
        }
        targets.push({ orgId, departmentIds, memberIds });
    }

    // People who blocked the sender do not receive the sender's broadcasts.
    const blockedBy = (
        await prisma.user_block.findMany({
            where: { blocked_user_organization_id: sender.userOrganizationId },
            select: { blocker_user_organization_id: true },
        })
    ).map((b) => b.blocker_user_organization_id);

    const recipients: { recipient_user_org_id: bigint; org_id: bigint }[] = [];
    for (const target of targets) {
        if (target.departmentIds.length) {
            const found = await prisma.department.count({ where: { org_id: target.orgId, department_id: { in: target.departmentIds } } });
            if (found !== target.departmentIds.length) throw new ApiError(404, "DEPARTMENT_NOT_FOUND", "Department not found");
        }
        const members = await prisma.user_organization.findMany({
            where: {
                org_id: target.orgId,
                deleted_at: null,
                user_organization_id: { notIn: [sender.userOrganizationId, ...blockedBy], ...(target.memberIds.length ? { in: target.memberIds } : {}) },
                ...(target.departmentIds.length ? { department_id: { in: target.departmentIds } } : {}),
            },
            select: { user_organization_id: true },
        });
        if (target.memberIds.length && members.length !== target.memberIds.filter((id) => id !== sender.userOrganizationId).length) {
            throw new ApiError(404, "MEMBER_NOT_FOUND", "A chosen member was not found in your organization");
        }
        members.forEach((m) => recipients.push({ recipient_user_org_id: m.user_organization_id, org_id: target.orgId }));
    }

    if (recipients.length === 0) throw new ApiError(400, "NO_RECIPIENTS", "Nobody would receive this broadcast");
    if (recipients.length > MAX_RECIPIENTS) throw new ApiError(400, "TOO_MANY_RECIPIENTS", `A broadcast can reach at most ${MAX_RECIPIENTS} people`);

    const broadcast = await prisma.$transaction(async (tx) => {
        const created = await tx.org_broadcast.create({
            data: { sender_user_org_id: sender.userOrganizationId, sender_org_id: sender.organizationId, title, message, is_announcement: isAnnouncement },
        });
        await tx.org_broadcast_target.createMany({
            data: targets.flatMap((t) =>
                t.departmentIds.length
                    ? t.departmentIds.map((d) => ({ broadcast_id: created.broadcast_id, org_id: t.orgId, department_id: d }))
                    : [{ broadcast_id: created.broadcast_id, org_id: t.orgId }],
            ),
        });
        await tx.org_broadcast_recipient.createMany({
            data: recipients.map((r) => ({ ...r, broadcast_id: created.broadcast_id })),
        });
        return created;
    });

    await writeAuditLog({
        orgId: sender.organizationId,
        actor: sender.userOrganizationId,
        action: "BROADCAST_SENT",
        targetType: "BROADCAST",
        targetId: broadcast.broadcast_id,
        details: { organizations: targets.length, recipients: recipients.length },
    });

    const view = await recipientView(broadcast.broadcast_id);
    const io = getRegisteredSocketServer();
    for (const r of recipients) {
        io?.to(userRoom(r.recipient_user_org_id)).emit("broadcast:new", view);
        sendPushNotification({
            receiverUserOrganizationId: r.recipient_user_org_id,
            category: "ANNOUNCEMENT",
            thread: "announcements",
            title: view.title || `Announcement from ${view.senderOrganizationName}`,
            body: view.message.slice(0, 200),
            data: { type: "BROADCAST", broadcastId: view.broadcastId },
            channelId: "announcements",
        });
    }

    return { broadcastId: broadcast.broadcast_id.toString(), recipients: recipients.length };
};

/** What a recipient sees: sender and sender organization only. */
const recipientView = async (broadcastId: bigint, readAt: Date | null = null) => {
    const b = await prisma.org_broadcast.findUniqueOrThrow({
        where: { broadcast_id: broadcastId },
        include: {
            sender: { select: { user_master: { select: { first_name: true, last_name: true } } } },
            sender_organization: { select: { organization_name: true } },
        },
    });
    return {
        broadcastId: b.broadcast_id.toString(),
        title: b.title,
        message: b.message,
        isAnnouncement: b.is_announcement,
        senderUserOrganizationId: b.sender_user_org_id.toString(),
        senderName: fullName(b.sender.user_master),
        senderOrganizationName: b.sender_organization.organization_name,
        createdAt: b.created_at,
        readAt,
    };
};

export const inbox = async (viewer: bigint, cursor: unknown) => {
    const before = typeof cursor === "string" && ID.test(cursor) ? BigInt(cursor) : undefined;
    const rows = await prisma.org_broadcast_recipient.findMany({
        where: { recipient_user_org_id: viewer, ...(before ? { broadcast_id: { lt: before } } : {}) },
        orderBy: { broadcast_id: "desc" },
        take: 30,
        select: { broadcast_id: true, read_at: true, delivered_at: true },
    });

    // Fetching the inbox is what "delivered" means for a broadcast.
    const undelivered = rows.filter((r) => !r.delivered_at).map((r) => r.broadcast_id);
    if (undelivered.length) {
        await prisma.org_broadcast_recipient.updateMany({
            where: { recipient_user_org_id: viewer, broadcast_id: { in: undelivered } },
            data: { delivered_at: new Date() },
        });
    }

    const items = [];
    for (const r of rows) items.push(await recipientView(r.broadcast_id, r.read_at));

    return {
        broadcasts: items,
        unreadCount: await prisma.org_broadcast_recipient.count({ where: { recipient_user_org_id: viewer, read_at: null } }),
        nextCursor: rows.length === 30 ? rows[rows.length - 1].broadcast_id.toString() : null,
    };
};

const recipientRow = async (viewer: bigint, broadcastId: bigint) => {
    const row = await prisma.org_broadcast_recipient.findUnique({
        where: { broadcast_id_recipient_user_org_id: { broadcast_id: broadcastId, recipient_user_org_id: viewer } },
    });
    if (!row) throw new ApiError(404, "BROADCAST_NOT_FOUND", "Broadcast not found");
    return row;
};

export const markRead = async (viewer: bigint, broadcastId: bigint) => {
    const row = await recipientRow(viewer, broadcastId);
    if (!row.read_at) {
        const now = new Date();
        await prisma.org_broadcast_recipient.update({
            where: { broadcast_recipient_id: row.broadcast_recipient_id },
            data: { read_at: now, delivered_at: row.delivered_at ?? now },
        });
    }
};

/** A reply goes to the sender only, as a personal message, and only when replies are on. */
export const reply = async (viewer: bigint, broadcastId: bigint, text: unknown) => {
    await recipientRow(viewer, broadcastId);
    const broadcast = await prisma.org_broadcast.findUniqueOrThrow({ where: { broadcast_id: broadcastId } });
    if (broadcast.is_announcement) {
        throw new ApiError(403, "REPLIES_DISABLED", "Replies are turned off for this announcement");
    }
    const { message } = await sendMessage({ sender: viewer, receiver: broadcast.sender_user_org_id, message: text });
    deliverNewMessage(message);
    return message;
};

const ownedBroadcast = async (sender: Sender, broadcastId: bigint) => {
    const b = await prisma.org_broadcast.findUnique({ where: { broadcast_id: broadcastId } });
    const isOwner = b?.sender_user_org_id === sender.userOrganizationId;
    const isOrgAdmin = b?.sender_org_id === sender.organizationId && (await isOrganizationAdmin(sender.userOrganizationId));
    if (!b || (!isOwner && !isOrgAdmin)) throw new ApiError(404, "BROADCAST_NOT_FOUND", "Broadcast not found");
    return b;
};

export const sentBroadcasts = async (sender: Sender, cursor: unknown) => {
    const before = typeof cursor === "string" && ID.test(cursor) ? BigInt(cursor) : undefined;
    const rows = await prisma.org_broadcast.findMany({
        where: { sender_user_org_id: sender.userOrganizationId, ...(before ? { broadcast_id: { lt: before } } : {}) },
        orderBy: { broadcast_id: "desc" },
        take: 30,
        include: { _count: { select: { recipients: true } } },
    });
    return {
        broadcasts: rows.map((b) => ({
            broadcastId: b.broadcast_id.toString(),
            title: b.title,
            message: b.message,
            isAnnouncement: b.is_announcement,
            createdAt: b.created_at,
            recipients: b._count.recipients,
        })),
        nextCursor: rows.length === 30 ? rows[rows.length - 1].broadcast_id.toString() : null,
    };
};

/**
 * Totals for every organization, and names only for the sender's own members,
 * so one organization never learns who received it elsewhere.
 */
export const stats = async (sender: Sender, broadcastId: bigint) => {
    const b = await ownedBroadcast(sender, broadcastId);
    const recipients = await prisma.org_broadcast_recipient.findMany({
        where: { broadcast_id: broadcastId },
        select: {
            org_id: true,
            delivered_at: true,
            read_at: true,
            recipient: { select: { user_organization_id: true, user_master: { select: { first_name: true, last_name: true } } } },
        },
    });
    const orgNames = new Map(
        (await prisma.organization_master.findMany({
            where: { org_id: { in: [...new Set(recipients.map((r) => r.org_id))] } },
            select: { org_id: true, organization_name: true },
        })).map((o) => [o.org_id.toString(), o.organization_name]),
    );

    const byOrg = new Map<string, { recipients: number; delivered: number; read: number }>();
    for (const r of recipients) {
        const key = r.org_id.toString();
        const t = byOrg.get(key) ?? { recipients: 0, delivered: 0, read: 0 };
        t.recipients += 1;
        if (r.delivered_at) t.delivered += 1;
        if (r.read_at) t.read += 1;
        byOrg.set(key, t);
    }

    return {
        broadcastId: b.broadcast_id.toString(),
        totals: {
            recipients: recipients.length,
            delivered: recipients.filter((r) => r.delivered_at).length,
            read: recipients.filter((r) => r.read_at).length,
        },
        organizations: [...byOrg.entries()].map(([orgId, t]) => ({
            organizationId: orgId,
            organizationName: orgNames.get(orgId) ?? "",
            ...t,
        })),
        ownMembers: recipients
            .filter((r) => r.org_id === b.sender_org_id)
            .map((r) => ({
                userOrganizationId: r.recipient.user_organization_id.toString(),
                name: fullName(r.recipient.user_master),
                deliveredAt: r.delivered_at,
                readAt: r.read_at,
            })),
    };
};

/** Organizations this member may address, for the broadcast form. */
export const broadcastTargets = async (sender: Sender) => {
    const setting = await getOrganizationSetting(sender.organizationId);
    const canSend = await hasPermission(setting.broadcast_permission, sender.userOrganizationId);
    const orgs = await prisma.organization_master.findMany({
        where: { deleted_at: null },
        orderBy: { organization_name: "asc" },
        select: { org_id: true, organization_name: true },
    });
    const allowed = [];
    for (const org of orgs) {
        if (await organizationsCanCommunicate(sender.organizationId, org.org_id)) {
            allowed.push({
                organizationId: org.org_id.toString(),
                organizationName: org.organization_name,
                isOwn: org.org_id === sender.organizationId,
            });
        }
    }
    return { canSend, organizations: allowed };
};
