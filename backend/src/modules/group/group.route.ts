import { NextFunction, Response, Router } from "express";
import prisma from "../../config/database.js";
import { authenticate, AuthRequest } from "../../middleware/auth.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { deliverGroupMessage, emitToMembers } from "../../socket/delivery.js";
import { parseCursor, parseLimit } from "../chat/messages/message.service.js";
import { forwardText } from "../chat/forward.service.js";
import * as groups from "./group.service.js";
import { syncCommunityMembers } from "../community/community.service.js";

const router = Router();

type Handler = (req: AuthRequest) => Promise<{ status?: number; message: string; data?: unknown }>;
const handle = (handler: Handler) => async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { status = 200, message, data } = await handler(req);
        res.status(status).json({ success: true, message, ...(data !== undefined ? { data } : {}) });
    } catch (error) {
        next(error);
    }
};

const id = (value: unknown) => {
    const text = Array.isArray(value) ? value[0] : value;
    if (typeof text !== "string" || !/^\d{1,20}$/.test(text)) throw new ApiError(400, "INVALID_ID", "Invalid ID");
    return BigInt(text);
};
const me = (req: AuthRequest) => req.user!.userOrganizationId;
const actor = (req: AuthRequest) => ({ userOrganizationId: req.user!.userOrganizationId, organizationId: req.user!.organizationId });

/** Shares system messages ("X added Y") and tells members to refresh the group. */
const announce = async (groupId: bigint, rows: (groups.GroupMessageRow | null)[], extraMembers: bigint[] = []) => {
    const group = await prisma.wp_group.findUniqueOrThrow({ where: { group_id: groupId }, select: { group_name: true, org_id: true } });
    const members = await groups.participatingMemberIds(groupId, group.org_id);
    for (const row of rows) {
        if (row) await deliverGroupMessage(row, members.filter((m) => m !== row.sender_user_organization_id), group.group_name);
    }
    emitToMembers([...new Set([...members, ...extraMembers])], "group:updated", () => ({ groupId: groupId.toString() }));
};

router.get("/", authenticate, handle(async (req) => ({ message: "Groups", data: await groups.listGroups(me(req)) })));

router.post("/", authenticate, handle(async (req) => {
    const { group, memberIds } = await groups.createGroup(actor(req), req.body);
    emitToMembers(memberIds, "group:added", () => ({ groupId: group.groupId }));
    return { status: 201, message: "Group created", data: group };
}));

router.post("/join/:code", authenticate, handle(async (req) => {
    const code = String(Array.isArray(req.params.code) ? req.params.code[0] : req.params.code);
    const { groupId, systemRow } = await groups.joinByCode(actor(req), code);
    await syncCommunityMembers(groupId, [me(req)]);
    if (systemRow) await announce(groupId, [systemRow]);
    return { message: "Joined group", data: await groups.getGroupInfo(me(req), groupId) };
}));

router.get("/:id", authenticate, handle(async (req) => ({ message: "Group", data: await groups.getGroupInfo(me(req), id(req.params.id)) })));

router.patch("/:id", authenticate, handle(async (req) => {
    const groupId = id(req.params.id);
    const { systemRows } = await groups.updateGroup(me(req), groupId, req.body);
    await announce(groupId, systemRows);
    return { message: "Group updated", data: await groups.getGroupInfo(me(req), groupId) };
}));

router.delete("/:id", authenticate, handle(async (req) => {
    const groupId = id(req.params.id);
    const members = await groups.deleteGroup(me(req), groupId);
    emitToMembers(members, "group:removed", () => ({ groupId: groupId.toString(), reason: "deleted" }));
    return { message: "Group deleted" };
}));

router.post("/:id/members", authenticate, handle(async (req) => {
    const groupId = id(req.params.id);
    const { added, systemRows } = await groups.addMembers(actor(req), groupId, req.body);
    await syncCommunityMembers(groupId, added);
    await announce(groupId, systemRows);
    emitToMembers(added, "group:added", () => ({ groupId: groupId.toString() }));
    return { message: "Members added", data: await groups.getGroupInfo(me(req), groupId) };
}));

router.delete("/:id/members/:memberId", authenticate, handle(async (req) => {
    const groupId = id(req.params.id);
    const target = id(req.params.memberId);
    const row = await groups.removeMember(me(req), groupId, target);
    await announce(groupId, [row]);
    emitToMembers([target], "group:removed", () => ({ groupId: groupId.toString(), reason: "removed" }));
    return { message: "Member removed" };
}));

router.patch("/:id/members/:memberId", authenticate, handle(async (req) => {
    const groupId = id(req.params.id);
    const row = await groups.setMemberRole(me(req), groupId, id(req.params.memberId), req.body?.role);
    await announce(groupId, [row]);
    return { message: "Role updated" };
}));

router.post("/:id/leave", authenticate, handle(async (req) => {
    const groupId = id(req.params.id);
    const row = await groups.leaveGroup(me(req), groupId);
    if (row) await announce(groupId, [row]);
    emitToMembers([me(req)], "group:removed", () => ({ groupId: groupId.toString(), reason: "left" }));
    return { message: "You left the group" };
}));

router.post("/:id/invite-link", authenticate, handle(async (req) => ({ message: "Invite link created", data: await groups.createInviteLink(me(req), id(req.params.id)) })));
router.delete("/:id/invite-link", authenticate, handle(async (req) => {
    await groups.revokeInviteLink(me(req), id(req.params.id));
    return { message: "Invite link revoked" };
}));

router.patch("/:id/preferences", authenticate, handle(async (req) => ({ message: "Preferences saved", data: await groups.updatePreferences(me(req), id(req.params.id), req.body) })));

router.get("/:id/messages", authenticate, handle(async (req) => ({
    message: "Group messages",
    data: await groups.groupHistory(me(req), id(req.params.id), parseLimit(req.query.limit), parseCursor(req.query.beforeChatId)),
})));

router.post("/:id/messages", authenticate, handle(async (req) => {
    const groupId = id(req.params.id);
    const { row, recipients, created } = await groups.sendGroupMessage({
        sender: me(req),
        groupId,
        message: req.body?.message,
        clientMessageId: req.body?.clientMessageId,
        replyToMessageId: req.body?.replyToMessageId ? id(req.body.replyToMessageId) : null,
        mediaId: req.body?.mediaId ? id(req.body.mediaId) : null,
    });
    if (created) {
        const group = await prisma.wp_group.findUniqueOrThrow({ where: { group_id: groupId }, select: { group_name: true } });
        await deliverGroupMessage(row, recipients, group.group_name);
    }
    return { status: created ? 201 : 200, message: "Message sent", data: groups.toGroupMessageDto(row, me(req)) };
}));

router.get("/:id/messages/:messageId/receipts", authenticate, handle(async (req) => ({
    message: "Receipts",
    data: await groups.messageReceipts(me(req), id(req.params.id), id(req.params.messageId)),
})));

router.delete("/:id/messages/:messageId", authenticate, handle(async (req) => {
    const groupId = id(req.params.id);
    const row = await groups.deleteGroupMessage(me(req), groupId, id(req.params.messageId));
    const group = await prisma.wp_group.findUniqueOrThrow({ where: { group_id: groupId }, select: { org_id: true } });
    const members = await groups.participatingMemberIds(groupId, group.org_id);
    emitToMembers(members, "group:message:updated", (member) => ({ reason: "deleted", message: groups.toGroupMessageDto(row, member) }));
    return { message: "Message deleted" };
}));

router.post("/:id/messages/:messageId/forward", authenticate, handle(async (req) => {
    const groupId = id(req.params.id);
    await groups.requireMember(groupId, me(req));
    const source = await prisma.group_chat.findFirst({
        where: { group_chat_id: id(req.params.messageId), group_id: groupId, deleted_at: null, deleted_for_everyone_at: null, message_type: { not: "SYSTEM" } },
    });
    if (!source || (!source.message && !source.media_id)) throw new ApiError(404, "MESSAGE_NOT_FOUND", "Message not found");
    return { status: 201, message: "Message forwarded", data: await forwardText(me(req), { text: source.message ?? "", mediaId: source.media_id }, req.body) };
}));

router.get("/:id/search", authenticate, handle(async (req) => ({ message: "Search results", data: await groups.searchGroup(me(req), id(req.params.id), req.query.q) })));

export default router;
