import "./helpers/test-env.js";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { io as connect, Socket } from "socket.io-client";
import { api, baseUrl, org, prisma, registerUser, setupHarness } from "./helpers/harness.js";

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

const receivesNothing = (socket: Socket, event: string, ms = 300) =>
  new Promise<void>((resolve, reject) => {
    const handler = () => reject(new Error(`Unexpected ${event}`));
    socket.once(event, handler);
    setTimeout(() => {
      socket.off(event, handler);
      resolve();
    }, ms);
  });

type User = Awaited<ReturnType<typeof registerUser>>;

const createGroup = async (owner: User, members: User[], name = "Team") => {
  const { status, json } = await api("POST", "/groups", {
    token: owner.token,
    body: { name, memberIds: members.map((m) => m.userOrganizationId) },
  });
  assert.equal(status, 201, JSON.stringify(json));
  return json.data;
};

const post = (user: User, groupId: string, message: string, extra: Record<string, unknown> = {}) =>
  api("POST", `/groups/${groupId}/messages`, { token: user.token, body: { message, ...extra } });

const history = async (user: User, groupId: string) =>
  (await api("GET", `/groups/${groupId}/messages`, { token: user.token })).json.data?.messages ?? [];

describe("groups", () => {
  it("creates a group with the creator as admin and a system message", async () => {
    const owner = await registerUser({ firstName: "Asha" });
    const bob = await registerUser({ firstName: "Bob" });
    const group = await createGroup(owner, [bob]);

    assert.equal(group.isAdmin, true);
    assert.deepEqual(group.members.map((m: any) => [m.name, m.role]), [["Asha", "ADMIN"], ["Bob", "USER"]]);
    const [created] = await history(bob, group.groupId);
    assert.equal(created.messageType, "SYSTEM");
    assert.match(created.message, /created the group/);
  });

  it("respects the organization's group creation permission", async () => {
    const member = await registerUser();
    await prisma.organization_setting.update({ where: { org_id: org.a }, data: { group_creation: "ADMINS" } });
    const { json } = await api("POST", "/groups", { token: member.token, body: { name: "x", memberIds: [] } });
    assert.equal(json.errorCode, "GROUP_CREATION_NOT_ALLOWED");
  });

  it("delivers messages to members only, with receipts for the sender", async () => {
    const owner = await registerUser();
    const bob = await registerUser();
    const outsider = await registerUser();
    const group = await createGroup(owner, [bob]);
    const bobSocket = await connected(bob.token);
    const ownerSocket = await connected(owner.token);
    const outsiderSocket = await connected(outsider.token);

    const arrives = nextEvent(bobSocket, "group:message:new");
    const silent = receivesNothing(outsiderSocket, "group:message:new");
    const ack = nextEvent(ownerSocket, "group:message:sent");
    ownerSocket.emit("group:message:send", { groupId: group.groupId, message: "hello team", clientMessageId: "group-msg-001" });

    const message = await arrives;
    assert.equal(message.message, "hello team");
    assert.equal(message.isMine, false);
    assert.equal((await ack).clientMessageId, "group-msg-001");
    await silent;

    // Retry with the same ID stores nothing new.
    const again = nextEvent(ownerSocket, "group:message:sent");
    ownerSocket.emit("group:message:send", { groupId: group.groupId, message: "hello team", clientMessageId: "group-msg-001" });
    await again;
    assert.equal(await prisma.group_chat.count({ where: { message_type: "TEXT" } }), 1);

    const receipt = nextEvent(ownerSocket, "group:message:receipt");
    bobSocket.emit("group:message:read", { groupId: group.groupId });
    await receipt;

    const receipts = await api("GET", `/groups/${group.groupId}/messages/${message.messageId}/receipts`, { token: owner.token });
    assert.equal(receipts.json.data[0].readAt !== null, true);
    const notSender = await api("GET", `/groups/${group.groupId}/messages/${message.messageId}/receipts`, { token: bob.token });
    assert.equal(notSender.status, 404);
  });

  it("hides the group from non-members", async () => {
    const owner = await registerUser();
    const outsider = await registerUser();
    const group = await createGroup(owner, []);

    for (const [method, path, body] of [
      ["GET", `/groups/${group.groupId}`, undefined],
      ["GET", `/groups/${group.groupId}/messages`, undefined],
      ["POST", `/groups/${group.groupId}/messages`, { message: "hi" }],
      ["POST", `/groups/${group.groupId}/members`, { userOrganizationIds: [outsider.userOrganizationId] }],
      ["GET", `/groups/${group.groupId}/search?q=hello`, undefined],
    ] as const) {
      assert.equal((await api(method, path, { token: outsider.token, body })).status, 404, `${method} ${path}`);
    }
  });

  it("lets only admins manage members, keeps one admin, and hands admin on when the last one leaves", async () => {
    const owner = await registerUser({ firstName: "Owner" });
    const bob = await registerUser({ firstName: "Bob" });
    const carol = await registerUser({ firstName: "Carol" });
    const group = await createGroup(owner, [bob]);

    const byMember = await api("POST", `/groups/${group.groupId}/members`, { token: bob.token, body: { userOrganizationIds: [carol.userOrganizationId] } });
    assert.equal(byMember.status, 403);

    await api("POST", `/groups/${group.groupId}/members`, { token: owner.token, body: { userOrganizationIds: [carol.userOrganizationId] } });
    const demote = await api("PATCH", `/groups/${group.groupId}/members/${owner.userOrganizationId}`, { token: owner.token, body: { role: "USER" } });
    assert.equal(demote.json.errorCode, "LAST_ADMIN");

    await api("POST", `/groups/${group.groupId}/leave`, { token: owner.token });
    const info = await api("GET", `/groups/${group.groupId}`, { token: bob.token });
    assert.deepEqual(info.json.data.members.find((m: any) => m.name === "Bob").role, "ADMIN");
    assert.equal((await api("GET", `/groups/${group.groupId}`, { token: owner.token })).status, 404);
  });

  it("shows new members only messages from after they joined", async () => {
    const owner = await registerUser();
    const late = await registerUser();
    const group = await createGroup(owner, []);
    await post(owner, group.groupId, "before you joined");
    await new Promise((resolve) => setTimeout(resolve, 1100));
    await api("POST", `/groups/${group.groupId}/members`, { token: owner.token, body: { userOrganizationIds: [late.userOrganizationId] } });

    const seen = (await history(late, group.groupId)).map((m: any) => m.message);
    assert.equal(seen.includes("before you joined"), false);
  });

  it("supports announcement-only groups", async () => {
    const owner = await registerUser();
    const bob = await registerUser();
    const group = await createGroup(owner, [bob]);
    await api("PATCH", `/groups/${group.groupId}`, { token: owner.token, body: { onlyAdminsCanSend: true } });

    assert.equal((await post(bob, group.groupId, "can I?")).json.errorCode, "ONLY_ADMINS_CAN_SEND");
    assert.equal((await post(owner, group.groupId, "announcement")).status, 201);
  });

  it("joins by invite link, and a revoked link stops working", async () => {
    const owner = await registerUser();
    const joiner = await registerUser();
    const group = await createGroup(owner, []);

    const link = await api("POST", `/groups/${group.groupId}/invite-link`, { token: owner.token });
    const joined = await api("POST", `/groups/join/${link.json.data.inviteCode}`, { token: joiner.token });
    assert.equal(joined.status, 200);

    await api("DELETE", `/groups/${group.groupId}/invite-link`, { token: owner.token });
    const late = await registerUser();
    assert.equal((await api("POST", `/groups/join/${link.json.data.inviteCode}`, { token: late.token })).status, 404);
  });

  it("needs permission and policy to add people from another organization, and suspends them on revoke", async () => {
    const owner = await registerUser();
    const partner = await registerUser({ orgCode: "ORGB" });
    const group = await createGroup(owner, []);
    const add = () => api("POST", `/groups/${group.groupId}/members`, { token: owner.token, body: { userOrganizationIds: [partner.userOrganizationId] } });

    assert.equal((await add()).status, 403, "the organizations cannot communicate yet");

    await prisma.organization_setting.updateMany({ data: { external_policy: "ALL_ORGANIZATIONS" } });
    assert.equal((await add()).json.errorCode, "EXTERNAL_MEMBERS_NOT_ALLOWED", "only admins by default");

    await prisma.user_organization.update({ where: { user_organization_id: BigInt(owner.userOrganizationId) }, data: { role: "ADMIN" } });
    assert.equal((await add()).status, 200);
    assert.equal((await post(partner, group.groupId, "hi from B")).status, 201);

    await prisma.organization_setting.update({ where: { org_id: org.b }, data: { external_policy: "INTERNAL_ONLY" } });
    assert.equal((await post(partner, group.groupId, "still here?")).json.errorCode, "GROUP_SUSPENDED");
    const info = await api("GET", `/groups/${group.groupId}`, { token: owner.token });
    assert.equal(info.json.data.members.find((m: any) => m.userOrganizationId === partner.userOrganizationId).isSuspended, true);
  });

  it("counts unread, mutes, pins and searches per member", async () => {
    const owner = await registerUser();
    const bob = await registerUser();
    const group = await createGroup(owner, [bob]);
    await post(owner, group.groupId, "quarterly numbers");
    await post(owner, group.groupId, "second");

    const list = await api("GET", "/groups", { token: bob.token });
    assert.equal(list.json.data[0].unreadCount, 3, "two messages plus the creation notice");

    const prefs = await api("PATCH", `/groups/${group.groupId}/preferences`, { token: bob.token, body: { muted: "forever", pinned: true } });
    assert.ok(prefs.json.data.mutedUntil);
    assert.equal(prefs.json.data.isPinned, true);
    const ownerView = await api("GET", "/groups", { token: owner.token });
    assert.equal(ownerView.json.data[0].mutedUntil, null);

    const found = await api("GET", `/groups/${group.groupId}/search?q=quarterly`, { token: bob.token });
    assert.deepEqual(found.json.data.map((m: any) => m.message), ["quarterly numbers"]);
  });

  it("forwards between a group and personal chats", async () => {
    const owner = await registerUser();
    const bob = await registerUser();
    const group = await createGroup(owner, [bob]);
    const sent = await post(owner, group.groupId, "share this");

    const toPerson = await api("POST", `/groups/${group.groupId}/messages/${sent.json.data.messageId}/forward`, {
      token: bob.token,
      body: { receiverUserOrganizationIds: [owner.userOrganizationId] },
    });
    assert.equal(toPerson.status, 201);

    const personal = await api("POST", "/chat/personal-chat/send", { token: owner.token, body: { receiverUserOrganizationId: bob.userOrganizationId, message: "to the group" } });
    const toGroup = await api("POST", `/chat/messages/${personal.json.data.messageId}/forward`, {
      token: bob.token,
      body: { groupIds: [group.groupId] },
    });
    assert.equal(toGroup.status, 201);
    assert.equal((await history(owner, group.groupId)).at(-1).forwarded, true);
  });

  it("lets the sender delete for everyone and admins delete any message", async () => {
    const owner = await registerUser();
    const bob = await registerUser();
    const group = await createGroup(owner, [bob]);
    const fromBob = await post(bob, group.groupId, "oops");
    const fromOwner = await post(owner, group.groupId, "admin note");

    assert.equal((await api("DELETE", `/groups/${group.groupId}/messages/${fromOwner.json.data.messageId}`, { token: bob.token })).status, 403);
    assert.equal((await api("DELETE", `/groups/${group.groupId}/messages/${fromBob.json.data.messageId}`, { token: owner.token })).status, 200);

    const deleted = (await history(bob, group.groupId)).find((m: any) => m.messageId === fromBob.json.data.messageId);
    assert.equal(deleted.isDeleted, true);
    assert.equal(deleted.message, null);
  });
});
