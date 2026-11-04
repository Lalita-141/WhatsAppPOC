import { NextFunction, Response } from "express";
import { AuthRequest } from "../../middleware/auth.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import * as admin from "./admin.service.js";

type Handler = (req: AuthRequest, who: admin.Admin) => Promise<{ status?: number; message: string; data?: unknown }>;

const handle = (handler: Handler) => async (req: AuthRequest, res: Response, next: NextFunction) => {
  try {
    const who = { userOrganizationId: req.user!.userOrganizationId, organizationId: req.user!.organizationId };
    const { status = 200, message, data } = await handler(req, who);
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

export const getSettings = handle(async (_req, who) => ({ message: "Organization settings", data: await admin.getSettings(who.organizationId) }));
export const putSettings = handle(async (req, who) => ({ message: "Organization settings updated", data: await admin.updateSettings(who, req.body) }));

export const members = handle(async (req, who) => ({ message: "Members", data: await admin.listMembers(who, req.query) }));
export const patchMember = handle(async (req, who) => {
  await admin.updateMember(who, id(req.params.memberId), req.body);
  return { message: "Member updated" };
});
export const deleteMember = handle(async (req, who) => {
  await admin.removeMember(who, id(req.params.memberId));
  return { message: "Member removed" };
});

export const departments = handle(async (_req, who) => ({ message: "Departments", data: await admin.listDepartments(who.organizationId) }));
export const postDepartment = handle(async (req, who) => ({ status: 201, message: "Department created", data: await admin.createDepartment(who, req.body?.name) }));
export const deleteDepartment = handle(async (req, who) => {
  await admin.deleteDepartment(who, id(req.params.departmentId));
  return { message: "Department deleted" };
});

export const invites = handle(async (_req, who) => ({ message: "Invites", data: await admin.listInvites(who) }));
export const postInvite = handle(async (req, who) => ({ status: 201, message: "Invite created", data: await admin.createInvite(who, req.body) }));
export const deleteInvite = handle(async (req, who) => {
  await admin.revokeInvite(who, id(req.params.inviteId));
  return { message: "Invite revoked" };
});

export const joinRequests = handle(async (_req, who) => ({ message: "Join requests", data: await admin.listJoinRequests(who) }));
export const approveJoin = handle(async (req, who) => {
  await admin.approveJoinRequest(who, id(req.params.requestId));
  return { message: "Join request approved" };
});
export const rejectJoin = handle(async (req, who) => {
  await admin.rejectJoinRequest(who, id(req.params.requestId));
  return { message: "Join request rejected" };
});

export const directory = handle(async (_req, who) => ({ message: "Organizations", data: await admin.directory(who) }));
export const relationships = handle(async (_req, who) => ({ message: "Relationships", data: await admin.listRelationships(who) }));
export const postRelationship = handle(async (req, who) => ({ status: 201, message: "Request sent", data: await admin.requestRelationship(who, req.body?.organizationId) }));
export const relationshipAction = (action: "approve" | "reject" | "revoke") =>
  handle(async (req, who) => ({ message: `Relationship ${action}d`, data: await admin.respondToRelationship(who, id(req.params.relationshipId), action) }));

export const audit = handle(async (req, who) => ({ message: "Audit log", data: await admin.auditLog(who, req.query.cursor) }));
