import "./helpers/test-env.js";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { io as connect, Socket } from "socket.io-client";
import {
  api,
  baseUrl,
  country,
  loginAgain,
  nextPhone,
  org,
  prisma,
  registerUser,
  requestOtp,
  setupHarness,
  skipCooldown,
  verify,
} from "./helpers/harness.js";

setupHarness();

const openSockets: Socket[] = [];
afterEach(() => {
  openSockets.splice(0).forEach((socket) => socket.disconnect());
});

const connected = (token: string) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = connect(baseUrl, { transports: ["websocket"], auth: { token }, reconnection: false, forceNew: true });
    openSockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });

const nextEvent = <T = any>(socket: Socket, event: string, ms = 2000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${event}`)), ms);
    socket.once(event, (payload: T) => {
      clearTimeout(timer);
      resolve(payload);
    });
  });

type User = Awaited<ReturnType<typeof registerUser>>;

const makeAdmin = (user: User) =>
  prisma.user_organization.update({ where: { user_organization_id: BigInt(user.userOrganizationId) }, data: { role: "ADMIN" } });

const setPolicy = (orgId: bigint, data: Record<string, unknown>) =>
  prisma.organization_setting.update({ where: { org_id: orgId }, data });

const message = (from: User, to: User, text = "hello") =>
  api("POST", "/chat/personal-chat/send", {
    token: from.token,
    body: { receiverUserOrganizationId: to.userOrganizationId, message: text },
  });

/** Verifies a new number and submits the profile; returns the profile response. */
const signUp = async (orgCode = "ORGA", mobileNo = nextPhone()) => {
  const { code } = await requestOtp(mobileNo, orgCode);
  const verified = await verify(mobileNo, code, orgCode);
  const profile = await api("POST", "/user/profile", {
    token: verified.json.data.token,
    body: { firstName: "New" },
  });
  return { mobileNo, profile };
};

describe("joining an organization", () => {
  it("needs admin approval when the organization is not open", async () => {
    const admin = await registerUserAsAdminInOpenThenLock();

    const { mobileNo, profile } = await signUp();
    assert.equal(profile.status, 202);
    assert.equal(profile.json.data.status, "PENDING_APPROVAL");
    assert.equal(profile.json.data.token, undefined);

    // Logging in again still waits; asking twice creates one request.
    await skipCooldown();
    const again = await loginAgain(mobileNo);
    assert.equal(again.json.data.nextStep, "ORGANIZATION_SETUP");
    const retry = await api("POST", "/organization/setup", { token: again.json.data.token, body: { orgCode: "ORGA" } });
    assert.equal(retry.status, 202);
    assert.equal(await prisma.organization_join_request.count(), 1);

    const pending = await api("GET", "/organization/join-requests", { token: admin.token });
    assert.equal(pending.json.data.length, 1);
    const approved = await api("POST", `/organization/join-requests/${pending.json.data[0].joinRequestId}/approve`, { token: admin.token });
    assert.equal(approved.status, 200);

    await skipCooldown();
    const loggedIn = await loginAgain(mobileNo);
    assert.equal(loggedIn.json.data.nextStep, "LOGIN");
    assert.ok(loggedIn.json.data.refreshToken);
  });

  it("lets an invited number join at once", async () => {
    await setPolicy(org.a, { join_mode: "APPROVAL" });
    const admin = await registerUserAsAdminInOpenThenLock();
    const mobileNo = nextPhone();

    const invite = await api("POST", "/organization/invites", {
      token: admin.token,
      body: { countryId: country.in, mobileNo },
    });
    assert.equal(invite.status, 201);

    const { profile } = await signUp("ORGA", mobileNo);
    assert.equal(profile.status, 201);
    assert.ok(profile.json.data.token);
    const row = await prisma.organization_invite.findFirstOrThrow();
    assert.ok(row.accepted_at);
  });

  it("refuses a declined request", async () => {
    await setPolicy(org.a, { join_mode: "APPROVAL" });
    const admin = await registerUserAsAdminInOpenThenLock();
    const { mobileNo } = await signUp();
    const [request] = (await api("GET", "/organization/join-requests", { token: admin.token })).json.data;
    await api("POST", `/organization/join-requests/${request.joinRequestId}/reject`, { token: admin.token });

    await skipCooldown();
    const again = await loginAgain(mobileNo);
    const setup = await api("POST", "/organization/setup", { token: again.json.data.token, body: { orgCode: "ORGA" } });
    assert.equal(setup.json.errorCode, "JOIN_REJECTED");
  });
});

// Registers while the org is open, makes that member admin, then requires approval.
async function registerUserAsAdminInOpenThenLock() {
  await setPolicy(org.a, { join_mode: "OPEN" });
  const admin = await registerUser();
  await makeAdmin(admin);
  await setPolicy(org.a, { join_mode: "APPROVAL" });
  return admin;
}

describe("admin permissions", () => {
  it("lets members read settings but only admins change them, with an audit entry", async () => {
    const member = await registerUser();
    const admin = await registerUser();
    await makeAdmin(admin);

    assert.equal((await api("GET", "/organization/settings", { token: member.token })).status, 200);
    const denied = await api("PUT", "/organization/settings", { token: member.token, body: { internalChatEnabled: false } });
    assert.equal(denied.status, 403);

    for (const route of ["/organization/members", "/organization/invites", "/organization/join-requests", "/organization/relationships", "/organization/audit-log", "/organization/directory"]) {
      assert.equal((await api("GET", route, { token: member.token })).status, 403, route);
    }

    const changed = await api("PUT", "/organization/settings", { token: admin.token, body: { externalPolicy: "ALL_ORGANIZATIONS" } });
    assert.equal(changed.json.data.externalPolicy, "ALL_ORGANIZATIONS");
    const bad = await api("PUT", "/organization/settings", { token: admin.token, body: { externalPolicy: "EVERYTHING" } });
    assert.equal(bad.status, 400);

    const log = await api("GET", "/organization/audit-log", { token: admin.token });
    assert.equal(log.json.data.entries[0].action, "SETTINGS_UPDATED");
    assert.deepEqual(log.json.data.entries[0].details.externalPolicy, { from: "INTERNAL_ONLY", to: "ALL_ORGANIZATIONS" });
  });

  it("keeps at least one admin", async () => {
    const admin = await registerUser();
    await makeAdmin(admin);

    const demote = await api("PATCH", `/organization/members/${admin.userOrganizationId}`, { token: admin.token, body: { role: "USER" } });
    assert.equal(demote.json.errorCode, "LAST_ADMIN");
  });

  it("removes a member: devices signed out and no way back in by OTP", async () => {
    const admin = await registerUser();
    await makeAdmin(admin);
    const member = await registerUser();

    const removed = await api("DELETE", `/organization/members/${member.userOrganizationId}`, { token: admin.token });
    assert.equal(removed.status, 200);
    assert.equal((await api("GET", "/auth/me", { token: member.token })).status, 401);

    await skipCooldown();
    const again = await loginAgain(member.mobileNo);
    assert.equal(again.json.errorCode, "MEMBERSHIP_REMOVED");
  });

  it("cannot manage another organization's members", async () => {
    const admin = await registerUser();
    await makeAdmin(admin);
    const outsider = await registerUser({ orgCode: "ORGB" });

    const attempt = await api("DELETE", `/organization/members/${outsider.userOrganizationId}`, { token: admin.token });
    assert.equal(attempt.status, 404);
    assert.equal((await api("GET", "/auth/me", { token: outsider.token })).status, 200);
  });
});

describe("communication policy", () => {
  it("allows external chat only when both organizations allow it", async () => {
    const a = await registerUser();
    const b = await registerUser({ orgCode: "ORGB" });

    assert.equal((await message(a, b)).json.errorCode, "CANNOT_MESSAGE");

    await setPolicy(org.a, { external_policy: "ALL_ORGANIZATIONS" });
    assert.equal((await message(a, b)).json.errorCode, "CANNOT_MESSAGE", "one side alone is not enough");

    await setPolicy(org.b, { external_policy: "ALL_ORGANIZATIONS" });
    assert.equal((await message(a, b)).status, 201);
    assert.equal((await message(b, a)).status, 201);
  });

  it("uses approved relationships for SELECTED_ORGANIZATIONS and stops at once on revoke", async () => {
    const adminA = await registerUser();
    const adminB = await registerUser({ orgCode: "ORGB" });
    await makeAdmin(adminA);
    await makeAdmin(adminB);
    await setPolicy(org.a, { external_policy: "SELECTED_ORGANIZATIONS" });
    await setPolicy(org.b, { external_policy: "SELECTED_ORGANIZATIONS" });

    const requested = await api("POST", "/organization/relationships", { token: adminA.token, body: { organizationId: org.b.toString() } });
    assert.equal(requested.status, 201);
    assert.equal((await message(adminA, adminB)).status, 403, "pending is not approved");

    const id = requested.json.data.relationshipId;
    const selfApprove = await api("POST", `/organization/relationships/${id}/approve`, { token: adminA.token });
    assert.equal(selfApprove.status, 400, "the requester cannot approve its own request");

    await api("POST", `/organization/relationships/${id}/approve`, { token: adminB.token });
    assert.equal((await message(adminA, adminB)).status, 201);

    await api("POST", `/organization/relationships/${id}/revoke`, { token: adminB.token });
    assert.equal((await message(adminA, adminB)).json.errorCode, "CANNOT_MESSAGE");

    const bLog = await api("GET", "/organization/audit-log", { token: adminB.token });
    assert.deepEqual(
      bLog.json.data.entries.map((e: any) => e.action).slice(0, 3),
      ["RELATIONSHIP_REVOKED", "RELATIONSHIP_APPROVED", "RELATIONSHIP_REQUEST_RECEIVED"],
    );
  });

  it("DISABLED hides the organization, refuses requests and suspends approved links", async () => {
    const adminA = await registerUser();
    const adminB = await registerUser({ orgCode: "ORGB" });
    await makeAdmin(adminA);
    await makeAdmin(adminB);
    await setPolicy(org.a, { external_policy: "SELECTED_ORGANIZATIONS" });
    await setPolicy(org.b, { external_policy: "SELECTED_ORGANIZATIONS" });
    const { json } = await api("POST", "/organization/relationships", { token: adminA.token, body: { organizationId: org.b.toString() } });
    await api("POST", `/organization/relationships/${json.data.relationshipId}/approve`, { token: adminB.token });

    await setPolicy(org.b, { external_policy: "DISABLED" });
    assert.equal((await message(adminA, adminB)).status, 403);
    const dir = await api("GET", "/organization/directory", { token: adminA.token });
    assert.equal(dir.json.data.length, 0);

    await setPolicy(org.b, { external_policy: "SELECTED_ORGANIZATIONS" });
    assert.equal((await message(adminA, adminB)).status, 201, "the approved link resumes");
  });

  it("turning internal chat off stops colleagues but not the self-chat", async () => {
    const a = await registerUser();
    const b = await registerUser();
    await setPolicy(org.a, { internal_chat_enabled: false });

    assert.equal((await message(a, b)).status, 403);
    assert.equal((await message(a, a, "note")).status, 201);
  });

  it("shows contacts from another organization only when the policy allows", async () => {
    const me = await registerUser();
    const other = await registerUser({ orgCode: "ORGB" });
    const check = () =>
      api("POST", "/chat/contacts/check", { token: me.token, body: { contacts: [{ name: "O", phone: other.mobileNo }] } });

    assert.equal((await check()).json.data.registered.length, 0);

    await setPolicy(org.a, { external_policy: "ALL_ORGANIZATIONS" });
    await setPolicy(org.b, { external_policy: "ALL_ORGANIZATIONS" });
    const found = (await check()).json.data.registered[0];
    assert.equal(found.userOrganizationId, other.userOrganizationId);
    assert.equal(found.organizationName, "Org B");
  });
});

describe("broadcasts", () => {
  const setup = async () => {
    const admin = await registerUser({ firstName: "Admin" });
    await makeAdmin(admin);
    const colleague = await registerUser({ firstName: "Colleague" });
    const partner = await registerUser({ orgCode: "ORGB", firstName: "Partner" });
    await setPolicy(org.a, { external_policy: "ALL_ORGANIZATIONS" });
    await setPolicy(org.b, { external_policy: "ALL_ORGANIZATIONS" });
    return { admin, colleague, partner };
  };

  const send = (from: User, body: Record<string, unknown>) => api("POST", "/broadcasts", { token: from.token, body });

  it("needs broadcast permission", async () => {
    const { colleague } = await setup();
    const result = await send(colleague, { message: "hi", targets: [{ organizationId: org.a.toString() }] });
    assert.equal(result.json.errorCode, "BROADCAST_NOT_ALLOWED");
  });

  it("delivers private copies that never list other organizations or recipients", async () => {
    const { admin, colleague, partner } = await setup();
    const partnerSocket = await connected(partner.token);
    const live = nextEvent(partnerSocket, "broadcast:new");

    const sent = await send(admin, {
      title: "Holiday",
      message: "Office closed Friday",
      targets: [{ organizationId: org.a.toString() }, { organizationId: org.b.toString() }],
    });
    assert.equal(sent.status, 201);
    assert.equal(sent.json.data.recipients, 2);

    const view = await live;
    assert.equal(view.senderOrganizationName, "Org A");
    assert.deepEqual(
      Object.keys(view).sort(),
      ["broadcastId", "createdAt", "isAnnouncement", "message", "readAt", "senderName", "senderOrganizationName", "senderUserOrganizationId", "title"],
    );

    const inbox = await api("GET", "/broadcasts/inbox", { token: colleague.token });
    assert.equal(inbox.json.data.broadcasts[0].message, "Office closed Friday");
    assert.equal(inbox.json.data.unreadCount, 1);
    await api("POST", `/broadcasts/${view.broadcastId}/read`, { token: colleague.token });

    const stats = await api("GET", `/broadcasts/${view.broadcastId}/stats`, { token: admin.token });
    assert.deepEqual(stats.json.data.totals, { recipients: 2, delivered: 1, read: 1 });
    const orgB = stats.json.data.organizations.find((o: any) => o.organizationName === "Org B");
    assert.deepEqual([orgB.recipients, orgB.delivered, orgB.read], [1, 0, 0]);
    assert.deepEqual(stats.json.data.ownMembers.map((m: any) => m.name), ["Colleague"]);

    const peek = await api("GET", `/broadcasts/${view.broadcastId}/stats`, { token: partner.token });
    assert.equal(peek.status, 404);
  });

  it("refuses organizations the policy does not allow, and departments outside the own organization", async () => {
    const { admin } = await setup();
    await setPolicy(org.b, { external_policy: "INTERNAL_ONLY" });
    const blocked = await send(admin, { message: "hi", targets: [{ organizationId: org.b.toString() }] });
    assert.equal(blocked.json.errorCode, "TARGET_NOT_ALLOWED");

    await setPolicy(org.b, { external_policy: "ALL_ORGANIZATIONS" });
    const deptElsewhere = await send(admin, { message: "hi", targets: [{ organizationId: org.b.toString(), departmentIds: ["1"] }] });
    assert.equal(deptElsewhere.status, 400);
  });

  it("targets a department in the own organization", async () => {
    const { admin, colleague } = await setup();
    const other = await registerUser({ firstName: "Elsewhere" });
    const dept = await api("POST", "/organization/departments", { token: admin.token, body: { name: "Sales" } });
    await api("PATCH", `/organization/members/${colleague.userOrganizationId}`, { token: admin.token, body: { departmentId: dept.json.data.departmentId } });

    const sent = await send(admin, { message: "Sales only", targets: [{ organizationId: org.a.toString(), departmentIds: [dept.json.data.departmentId] }] });
    assert.equal(sent.json.data.recipients, 1);
    assert.equal((await api("GET", "/broadcasts/inbox", { token: other.token })).json.data.broadcasts.length, 0);
  });

  it("allows replies to the sender only when it is not an announcement", async () => {
    const { admin, colleague } = await setup();
    const announcement = await send(admin, { message: "FYI", targets: [{ organizationId: org.a.toString() }] });
    const blocked = await api("POST", `/broadcasts/${announcement.json.data.broadcastId}/reply`, { token: colleague.token, body: { message: "ok" } });
    assert.equal(blocked.json.errorCode, "REPLIES_DISABLED");

    const question = await send(admin, { message: "Who can attend?", isAnnouncement: false, targets: [{ organizationId: org.a.toString() }] });
    const replied = await api("POST", `/broadcasts/${question.json.data.broadcastId}/reply`, { token: colleague.token, body: { message: "Me" } });
    assert.equal(replied.status, 201);
    assert.equal(replied.json.data.receiverUserOrganizationId, admin.userOrganizationId);
  });
});
