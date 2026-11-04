import prisma from "../../config/database.js";
import { ApiError } from "../../utils/api-error.js";
import { Prisma } from "../../generated/prisma/client.js";
import { normalizePhoneForCountry } from "../../utils/phone.js";
import { revokeSessions } from "../auth/session.service.js";
import { getOrganizationSetting, isOrganizationAdmin, pairKey, writeAuditLog } from "../policy/communication.policy.js";
import { createUserOrganization } from "./organization.repository.js";

const INVITE_TTL_DAYS = 14;
const POLICIES = ["INTERNAL_ONLY", "SELECTED_ORGANIZATIONS", "ALL_ORGANIZATIONS", "DISABLED"] as const;
const SCOPES = ["EVERYONE", "ADMINS", "NOBODY"] as const;
const JOIN_MODES = ["OPEN", "APPROVAL"] as const;

export interface Admin {
  userOrganizationId: bigint;
  organizationId: bigint;
}

export const requireAdmin = async (userOrganizationId: bigint) => {
  if (!(await isOrganizationAdmin(userOrganizationId))) {
    throw new ApiError(403, "ADMIN_REQUIRED", "Only organization admins can do this");
  }
};

// ---------------------------------------------------------------- settings

export const toSettingResponse = (setting: Awaited<ReturnType<typeof getOrganizationSetting>>) => ({
  internalChatEnabled: setting.internal_chat_enabled,
  externalPolicy: setting.external_policy,
  groupCreation: setting.group_creation,
  externalParticipants: setting.external_participants,
  broadcastPermission: setting.broadcast_permission,
  fileSharingEnabled: setting.file_sharing_enabled,
  callsEnabled: setting.calls_enabled,
  maxUploadMb: setting.max_upload_mb,
  joinMode: setting.join_mode,
});

const SETTING_FIELDS: Record<string, { column: string; check: (v: unknown) => boolean; hint: string }> = {
  internalChatEnabled: { column: "internal_chat_enabled", check: (v) => typeof v === "boolean", hint: "true or false" },
  externalPolicy: { column: "external_policy", check: (v) => POLICIES.includes(v as never), hint: POLICIES.join(", ") },
  groupCreation: { column: "group_creation", check: (v) => SCOPES.includes(v as never), hint: SCOPES.join(", ") },
  externalParticipants: { column: "external_participants", check: (v) => SCOPES.includes(v as never), hint: SCOPES.join(", ") },
  broadcastPermission: { column: "broadcast_permission", check: (v) => SCOPES.includes(v as never), hint: SCOPES.join(", ") },
  fileSharingEnabled: { column: "file_sharing_enabled", check: (v) => typeof v === "boolean", hint: "true or false" },
  callsEnabled: { column: "calls_enabled", check: (v) => typeof v === "boolean", hint: "true or false" },
  maxUploadMb: { column: "max_upload_mb", check: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 100, hint: "a whole number from 1 to 100" },
  joinMode: { column: "join_mode", check: (v) => JOIN_MODES.includes(v as never), hint: JOIN_MODES.join(", ") },
};

export const getSettings = async (orgId: bigint) => toSettingResponse(await getOrganizationSetting(orgId));

export const updateSettings = async (admin: Admin, body: unknown) => {
  await requireAdmin(admin.userOrganizationId);

  if (!body || typeof body !== "object" || Array.isArray(body) || Object.keys(body).length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "At least one setting is required");
  }

  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(body as Record<string, unknown>)) {
    const field = SETTING_FIELDS[key];
    if (!field) throw new ApiError(400, "VALIDATION_ERROR", `Unknown setting: ${key}`);
    if (!field.check(value)) throw new ApiError(400, "VALIDATION_ERROR", `${key} must be ${field.hint}`);
    data[field.column] = value;
  }

  const before = toSettingResponse(await getOrganizationSetting(admin.organizationId));
  const saved = await prisma.organization_setting.upsert({
    where: { org_id: admin.organizationId },
    create: { org_id: admin.organizationId, ...data, updated_by: admin.userOrganizationId, updated_at: new Date() },
    update: { ...data, updated_by: admin.userOrganizationId, updated_at: new Date() },
  });
  const after = toSettingResponse(saved);

  await writeAuditLog({
    orgId: admin.organizationId,
    actor: admin.userOrganizationId,
    action: "SETTINGS_UPDATED",
    details: Object.fromEntries(
      Object.keys(body as object).map((key) => [key, { from: before[key as keyof typeof before], to: after[key as keyof typeof after] }]),
    ),
  });

  return after;
};

// ---------------------------------------------------------------- members

export const listMembers = async (admin: Admin, query: { cursor?: unknown; q?: unknown }) => {
  await requireAdmin(admin.userOrganizationId);
  const cursor = typeof query.cursor === "string" && /^\d{1,20}$/.test(query.cursor) ? BigInt(query.cursor) : undefined;
  const search = typeof query.q === "string" ? query.q.trim().slice(0, 50) : "";

  const rows = await prisma.user_organization.findMany({
    where: {
      org_id: admin.organizationId,
      deleted_at: null,
      ...(cursor ? { user_organization_id: { gt: cursor } } : {}),
      ...(search
        ? { user_master: { OR: [{ first_name: { contains: search } }, { last_name: { contains: search } }, { mobile_no: { contains: search } }] } }
        : {}),
    },
    orderBy: { user_organization_id: "asc" },
    take: 50,
    select: {
      user_organization_id: true,
      role: true,
      department: { select: { department_id: true, name: true } },
      user_master: { select: { first_name: true, last_name: true, country_code: true, mobile_no: true } },
    },
  });

  return {
    members: rows.map((row) => ({
      userOrganizationId: row.user_organization_id.toString(),
      name: [row.user_master.first_name, row.user_master.last_name].filter(Boolean).join(" "),
      phone: `${row.user_master.country_code} ${row.user_master.mobile_no}`,
      role: row.role === "ADMIN" ? "ADMIN" : "USER",
      department: row.department ? { departmentId: row.department.department_id.toString(), name: row.department.name } : null,
      isYou: row.user_organization_id === admin.userOrganizationId,
    })),
    nextCursor: rows.length === 50 ? rows[rows.length - 1].user_organization_id.toString() : null,
  };
};

const memberOfOrg = async (orgId: bigint, userOrganizationId: bigint) => {
  const member = await prisma.user_organization.findFirst({
    where: { user_organization_id: userOrganizationId, org_id: orgId, deleted_at: null },
    select: { user_organization_id: true, role: true },
  });
  if (!member) throw new ApiError(404, "MEMBER_NOT_FOUND", "Member not found");
  return member;
};

const adminCount = (orgId: bigint) =>
  prisma.user_organization.count({ where: { org_id: orgId, deleted_at: null, role: "ADMIN" } });

export const updateMember = async (admin: Admin, target: bigint, body: unknown) => {
  await requireAdmin(admin.userOrganizationId);
  const member = await memberOfOrg(admin.organizationId, target);
  const input = (body ?? {}) as Record<string, unknown>;
  const data: { role?: string; department_id?: bigint | null } = {};

  if ("role" in input) {
    if (input.role !== "ADMIN" && input.role !== "USER") {
      throw new ApiError(400, "VALIDATION_ERROR", "role must be ADMIN or USER");
    }
    if (member.role === "ADMIN" && input.role === "USER" && (await adminCount(admin.organizationId)) <= 1) {
      throw new ApiError(400, "LAST_ADMIN", "An organization needs at least one admin");
    }
    data.role = input.role;
  }

  if ("departmentId" in input) {
    if (input.departmentId === null) {
      data.department_id = null;
    } else if (typeof input.departmentId === "string" && /^\d{1,20}$/.test(input.departmentId)) {
      const department = await prisma.department.findFirst({
        where: { department_id: BigInt(input.departmentId), org_id: admin.organizationId },
      });
      if (!department) throw new ApiError(404, "DEPARTMENT_NOT_FOUND", "Department not found");
      data.department_id = department.department_id;
    } else {
      throw new ApiError(400, "VALIDATION_ERROR", "departmentId must be an ID or null");
    }
  }

  if (Object.keys(data).length === 0) {
    throw new ApiError(400, "VALIDATION_ERROR", "Send role or departmentId");
  }

  await prisma.user_organization.update({ where: { user_organization_id: target }, data: { ...data, updated_at: new Date(), updated_by: admin.userOrganizationId } });
  await writeAuditLog({
    orgId: admin.organizationId,
    actor: admin.userOrganizationId,
    action: "MEMBER_UPDATED",
    targetType: "MEMBER",
    targetId: target,
    details: { role: data.role, departmentId: data.department_id?.toString() ?? data.department_id },
  });
};

export const removeMember = async (admin: Admin, target: bigint) => {
  await requireAdmin(admin.userOrganizationId);
  const member = await memberOfOrg(admin.organizationId, target);

  if (member.role === "ADMIN" && (await adminCount(admin.organizationId)) <= 1) {
    throw new ApiError(400, "LAST_ADMIN", "An organization needs at least one admin");
  }

  await prisma.user_organization.update({
    where: { user_organization_id: target },
    data: { deleted_at: new Date(), deleted_by: admin.userOrganizationId },
  });

  const sessions = await prisma.user_session.findMany({
    where: { user_organization_id: target, revoked_at: null },
    select: { session_id: true },
  });
  await revokeSessions(sessions.map((s) => s.session_id), "MEMBERSHIP_REMOVED");

  await writeAuditLog({ orgId: admin.organizationId, actor: admin.userOrganizationId, action: "MEMBER_REMOVED", targetType: "MEMBER", targetId: target });
};

// ---------------------------------------------------------------- departments

export const listDepartments = async (orgId: bigint) =>
  (await prisma.department.findMany({
    where: { org_id: orgId },
    orderBy: { name: "asc" },
    select: { department_id: true, name: true, _count: { select: { members: { where: { deleted_at: null } } } } },
  })).map((d) => ({ departmentId: d.department_id.toString(), name: d.name, memberCount: d._count.members }));

export const createDepartment = async (admin: Admin, name: unknown) => {
  await requireAdmin(admin.userOrganizationId);
  if (typeof name !== "string" || !name.trim() || name.trim().length > 100) {
    throw new ApiError(400, "VALIDATION_ERROR", "name must be 1 to 100 characters");
  }
  try {
    const department = await prisma.department.create({ data: { org_id: admin.organizationId, name: name.trim() } });
    await writeAuditLog({ orgId: admin.organizationId, actor: admin.userOrganizationId, action: "DEPARTMENT_CREATED", targetType: "DEPARTMENT", targetId: department.department_id, details: { name: department.name } });
    return { departmentId: department.department_id.toString(), name: department.name, memberCount: 0 };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "DEPARTMENT_EXISTS", "A department with this name already exists");
    }
    throw error;
  }
};

export const deleteDepartment = async (admin: Admin, departmentId: bigint) => {
  await requireAdmin(admin.userOrganizationId);
  const { count } = await prisma.department.deleteMany({ where: { department_id: departmentId, org_id: admin.organizationId } });
  if (count === 0) throw new ApiError(404, "DEPARTMENT_NOT_FOUND", "Department not found");
  await writeAuditLog({ orgId: admin.organizationId, actor: admin.userOrganizationId, action: "DEPARTMENT_DELETED", targetType: "DEPARTMENT", targetId: departmentId });
};

// ---------------------------------------------------------------- invites

export const listInvites = async (admin: Admin) => {
  await requireAdmin(admin.userOrganizationId);
  const invites = await prisma.organization_invite.findMany({
    where: { org_id: admin.organizationId, accepted_at: null, revoked_at: null, expires_at: { gt: new Date() } },
    orderBy: { invite_id: "desc" },
  });
  return invites.map((i) => ({ inviteId: i.invite_id.toString(), phone: `${i.country_code} ${i.mobile_no}`, expiresAt: i.expires_at }));
};

export const createInvite = async (admin: Admin, body: unknown) => {
  await requireAdmin(admin.userOrganizationId);
  const input = (body ?? {}) as Record<string, unknown>;
  const country = typeof input.countryId === "string" && /^\d{1,20}$/.test(input.countryId)
    ? await prisma.country_master.findFirst({ where: { country_id: BigInt(input.countryId), deleted_at: null } })
    : null;
  if (!country || typeof input.mobileNo !== "string") {
    throw new ApiError(400, "VALIDATION_ERROR", "countryId and mobileNo are required");
  }
  const phone = normalizePhoneForCountry(input.mobileNo, country.iso_code);
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invite = await prisma.organization_invite.upsert({
    where: { org_id_country_code_mobile_no: { org_id: admin.organizationId, country_code: country.country_code, mobile_no: phone.nationalNumber } },
    create: { org_id: admin.organizationId, country_code: country.country_code, mobile_no: phone.nationalNumber, invited_by: admin.userOrganizationId, expires_at: expiresAt },
    update: { invited_by: admin.userOrganizationId, expires_at: expiresAt, accepted_at: null, revoked_at: null, created_at: new Date() },
  });

  // An invite also approves a waiting request from the same person.
  const person = await prisma.user_master.findFirst({ where: { country_code: country.country_code, mobile_no: phone.nationalNumber, deleted_at: null } });
  if (person) {
    const pending = await prisma.organization_join_request.findFirst({ where: { org_id: admin.organizationId, user_id: person.user_id, status: "PENDING" } });
    if (pending) await approveJoinRequest(admin, pending.join_request_id);
  }

  await writeAuditLog({ orgId: admin.organizationId, actor: admin.userOrganizationId, action: "INVITE_CREATED", targetType: "INVITE", targetId: invite.invite_id });
  return { inviteId: invite.invite_id.toString(), phone: `${invite.country_code} ${invite.mobile_no}`, expiresAt: invite.expires_at };
};

export const revokeInvite = async (admin: Admin, inviteId: bigint) => {
  await requireAdmin(admin.userOrganizationId);
  const { count } = await prisma.organization_invite.updateMany({
    where: { invite_id: inviteId, org_id: admin.organizationId, accepted_at: null, revoked_at: null },
    data: { revoked_at: new Date() },
  });
  if (count === 0) throw new ApiError(404, "INVITE_NOT_FOUND", "Invite not found");
  await writeAuditLog({ orgId: admin.organizationId, actor: admin.userOrganizationId, action: "INVITE_REVOKED", targetType: "INVITE", targetId: inviteId });
};

// ---------------------------------------------------------------- join requests

export const listJoinRequests = async (admin: Admin) => {
  await requireAdmin(admin.userOrganizationId);
  const requests = await prisma.organization_join_request.findMany({
    where: { org_id: admin.organizationId, status: "PENDING" },
    orderBy: { join_request_id: "asc" },
    select: {
      join_request_id: true,
      created_at: true,
      user: { select: { first_name: true, last_name: true, country_code: true, mobile_no: true } },
    },
  });
  return requests.map((r) => ({
    joinRequestId: r.join_request_id.toString(),
    name: [r.user.first_name, r.user.last_name].filter(Boolean).join(" "),
    phone: `${r.user.country_code} ${r.user.mobile_no}`,
    requestedAt: r.created_at,
  }));
};

const pendingRequest = async (orgId: bigint, joinRequestId: bigint) => {
  const request = await prisma.organization_join_request.findFirst({ where: { join_request_id: joinRequestId, org_id: orgId, status: "PENDING" } });
  if (!request) throw new ApiError(404, "JOIN_REQUEST_NOT_FOUND", "Join request not found");
  return request;
};

export const approveJoinRequest = async (admin: Admin, joinRequestId: bigint) => {
  await requireAdmin(admin.userOrganizationId);
  const request = await pendingRequest(admin.organizationId, joinRequestId);
  const existing = await prisma.user_organization.findFirst({ where: { user_id: request.user_id, org_id: admin.organizationId } });
  if (existing?.deleted_at) {
    throw new ApiError(409, "MEMBERSHIP_REMOVED", "This person was removed from the organization");
  }
  const member = existing ?? (await createUserOrganization({ userId: request.user_id, orgId: admin.organizationId, role: "USER" }));
  await prisma.organization_join_request.update({
    where: { join_request_id: joinRequestId },
    data: { status: "APPROVED", decided_by: admin.userOrganizationId, decided_at: new Date() },
  });
  await writeAuditLog({ orgId: admin.organizationId, actor: admin.userOrganizationId, action: "JOIN_REQUEST_APPROVED", targetType: "MEMBER", targetId: member.user_organization_id });
};

export const rejectJoinRequest = async (admin: Admin, joinRequestId: bigint) => {
  await requireAdmin(admin.userOrganizationId);
  await pendingRequest(admin.organizationId, joinRequestId);
  await prisma.organization_join_request.update({
    where: { join_request_id: joinRequestId },
    data: { status: "REJECTED", decided_by: admin.userOrganizationId, decided_at: new Date() },
  });
  await writeAuditLog({ orgId: admin.organizationId, actor: admin.userOrganizationId, action: "JOIN_REQUEST_REJECTED", targetType: "JOIN_REQUEST", targetId: joinRequestId });
};

// ---------------------------------------------------------------- relationships

/** Organizations an admin may ask to connect with. Codes are not shown: they are join codes. */
export const directory = async (admin: Admin) => {
  await requireAdmin(admin.userOrganizationId);
  const orgs = await prisma.organization_master.findMany({
    where: { deleted_at: null, org_id: { not: admin.organizationId }, OR: [{ setting: null }, { setting: { external_policy: { not: "DISABLED" } } }] },
    orderBy: { organization_name: "asc" },
    select: { org_id: true, organization_name: true },
  });
  return orgs.map((o) => ({ organizationId: o.org_id.toString(), organizationName: o.organization_name }));
};

export const listRelationships = async (admin: Admin) => {
  await requireAdmin(admin.userOrganizationId);
  const rows = await prisma.organization_relationship.findMany({
    where: { OR: [{ requester_org_id: admin.organizationId }, { target_org_id: admin.organizationId }] },
    orderBy: { relationship_id: "desc" },
    include: { requester: { select: { organization_name: true } }, target: { select: { organization_name: true } } },
  });
  return rows.map((r) => {
    const outgoing = r.requester_org_id === admin.organizationId;
    return {
      relationshipId: r.relationship_id.toString(),
      organizationId: (outgoing ? r.target_org_id : r.requester_org_id).toString(),
      organizationName: outgoing ? r.target.organization_name : r.requester.organization_name,
      direction: outgoing ? "OUTGOING" : "INCOMING",
      status: r.status,
      createdAt: r.created_at,
      respondedAt: r.responded_at,
    };
  });
};

export const requestRelationship = async (admin: Admin, targetOrgId: unknown) => {
  await requireAdmin(admin.userOrganizationId);
  if (typeof targetOrgId !== "string" || !/^\d{1,20}$/.test(targetOrgId)) {
    throw new ApiError(400, "VALIDATION_ERROR", "organizationId is required");
  }
  const target = BigInt(targetOrgId);
  if (target === admin.organizationId) throw new ApiError(400, "VALIDATION_ERROR", "Choose another organization");

  const [mine, theirs, targetOrg] = await Promise.all([
    getOrganizationSetting(admin.organizationId),
    getOrganizationSetting(target),
    prisma.organization_master.findFirst({ where: { org_id: target, deleted_at: null } }),
  ]);
  // DISABLED organizations neither send nor receive requests, and look the same as missing ones.
  if (!targetOrg || theirs.external_policy === "DISABLED") throw new ApiError(404, "ORGANIZATION_NOT_FOUND", "Organization not found");
  if (mine.external_policy === "DISABLED") throw new ApiError(403, "EXTERNAL_DISABLED", "External communication is disabled for your organization");

  const key = pairKey(admin.organizationId, target);
  const existing = await prisma.organization_relationship.findUnique({ where: { pair_key: key } });
  if (existing && (existing.status === "PENDING" || existing.status === "APPROVED")) {
    throw new ApiError(409, "RELATIONSHIP_EXISTS", `A relationship is already ${existing.status.toLowerCase()}`);
  }

  const relationship = await prisma.organization_relationship.upsert({
    where: { pair_key: key },
    create: { pair_key: key, requester_org_id: admin.organizationId, target_org_id: target, requested_by: admin.userOrganizationId },
    update: { requester_org_id: admin.organizationId, target_org_id: target, status: "PENDING", requested_by: admin.userOrganizationId, responded_by: null, responded_at: null, created_at: new Date(), updated_at: new Date() },
  });

  await Promise.all([
    writeAuditLog({ orgId: admin.organizationId, actor: admin.userOrganizationId, action: "RELATIONSHIP_REQUESTED", targetType: "ORGANIZATION", targetId: target }),
    writeAuditLog({ orgId: target, actor: null, action: "RELATIONSHIP_REQUEST_RECEIVED", targetType: "ORGANIZATION", targetId: admin.organizationId }),
  ]);
  return { relationshipId: relationship.relationship_id.toString(), status: relationship.status };
};

const relationshipFor = async (admin: Admin, relationshipId: bigint) => {
  const r = await prisma.organization_relationship.findUnique({ where: { relationship_id: relationshipId } });
  if (!r || (r.requester_org_id !== admin.organizationId && r.target_org_id !== admin.organizationId)) {
    throw new ApiError(404, "RELATIONSHIP_NOT_FOUND", "Relationship not found");
  }
  return r;
};

export const respondToRelationship = async (admin: Admin, relationshipId: bigint, action: "approve" | "reject" | "revoke") => {
  await requireAdmin(admin.userOrganizationId);
  const r = await relationshipFor(admin, relationshipId);
  const other = r.requester_org_id === admin.organizationId ? r.target_org_id : r.requester_org_id;

  let status: "APPROVED" | "REJECTED" | "REVOKED";
  if (action === "revoke") {
    // Either side can end an approved relationship, or the requester can withdraw a pending one.
    const allowed = r.status === "APPROVED" || (r.status === "PENDING" && r.requester_org_id === admin.organizationId);
    if (!allowed) throw new ApiError(400, "INVALID_STATE", "This relationship cannot be revoked");
    status = "REVOKED";
  } else {
    if (r.status !== "PENDING" || r.target_org_id !== admin.organizationId) {
      throw new ApiError(400, "INVALID_STATE", "Only the receiving organization can answer a pending request");
    }
    status = action === "approve" ? "APPROVED" : "REJECTED";
  }

  await prisma.organization_relationship.update({
    where: { relationship_id: relationshipId },
    data: { status, responded_by: admin.userOrganizationId, responded_at: new Date(), updated_at: new Date() },
  });

  const verb = { APPROVED: "APPROVED", REJECTED: "REJECTED", REVOKED: "REVOKED" }[status];
  await Promise.all([
    writeAuditLog({ orgId: admin.organizationId, actor: admin.userOrganizationId, action: `RELATIONSHIP_${verb}`, targetType: "ORGANIZATION", targetId: other }),
    writeAuditLog({ orgId: other, actor: null, action: `RELATIONSHIP_${verb}_BY_OTHER`, targetType: "ORGANIZATION", targetId: admin.organizationId }),
  ]);
  return { relationshipId: relationshipId.toString(), status };
};

// ---------------------------------------------------------------- audit log

export const auditLog = async (admin: Admin, cursor: unknown) => {
  await requireAdmin(admin.userOrganizationId);
  const before = typeof cursor === "string" && /^\d{1,20}$/.test(cursor) ? BigInt(cursor) : undefined;
  const rows = await prisma.organization_audit_log.findMany({
    where: { org_id: admin.organizationId, ...(before ? { audit_log_id: { lt: before } } : {}) },
    orderBy: { audit_log_id: "desc" },
    take: 50,
    include: { actor: { select: { user_master: { select: { first_name: true, last_name: true } } } } },
  });
  return {
    entries: rows.map((r) => ({
      auditLogId: r.audit_log_id.toString(),
      action: r.action,
      actorName: r.actor ? [r.actor.user_master.first_name, r.actor.user_master.last_name].filter(Boolean).join(" ") : null,
      targetType: r.target_type,
      targetId: r.target_id,
      details: r.details,
      createdAt: r.created_at,
    })),
    nextCursor: rows.length === 50 ? rows[rows.length - 1].audit_log_id.toString() : null,
  };
};
