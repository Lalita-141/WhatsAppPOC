import "./helpers/test-env.js";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { usePushTransportForTests } from "../src/modules/notification/notification.service.js";
import { api, prisma, registerUser, setupHarness } from "./helpers/harness.js";

setupHarness();

type User = Awaited<ReturnType<typeof registerUser>>;

const sent: any[] = [];
const capture = () => {
  sent.length = 0;
  usePushTransportForTests(async (payload) => {
    sent.push(payload);
    return { successCount: payload.tokens.length, failureCount: 0, responses: payload.tokens.map(() => ({ success: true })) };
  });
};

afterEach(() => usePushTransportForTests(null));

const withDevice = async (user: User, token = `fcm-${user.userOrganizationId}`) =>
  prisma.user_device.create({ data: { user_organization_id: BigInt(user.userOrganizationId), fcm_token: token } });

const settle = () => new Promise((resolve) => setTimeout(resolve, 150));

describe("push notifications", () => {
  it("sends a chat notification with the text, a thread and the receiving membership", async () => {
    const alice = await registerUser({ firstName: "Alice" });
    const bob = await registerUser();
    await withDevice(bob);
    capture();

    await api("POST", "/chat/personal-chat/send", { token: alice.token, body: { receiverUserOrganizationId: bob.userOrganizationId, message: "lunch?" } });
    await settle();

    assert.equal(sent.length, 1);
    assert.equal(sent[0].notification.title, "Alice");
    assert.equal(sent[0].notification.body, "lunch?");
    assert.equal(sent[0].data.type, "PERSONAL_CHAT");
    assert.equal(sent[0].data.receiverUserOrganizationId, bob.userOrganizationId);
    assert.equal(sent[0].android.notification.tag, `chat:${alice.userOrganizationId}`);
  });

  it("hides the text when previews are off, and sends nothing when chat notifications are off", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await withDevice(bob);
    capture();

    await api("PUT", "/user/settings/notifications", { token: bob.token, body: { showPreview: false } });
    await api("POST", "/chat/personal-chat/send", { token: alice.token, body: { receiverUserOrganizationId: bob.userOrganizationId, message: "secret plan" } });
    await settle();
    assert.equal(sent[0].notification.body, "New message");

    await api("PUT", "/user/settings/notifications", { token: bob.token, body: { messages: false } });
    await api("POST", "/chat/personal-chat/send", { token: alice.token, body: { receiverUserOrganizationId: bob.userOrganizationId, message: "again" } });
    await settle();
    assert.equal(sent.length, 1);
  });

  it("uses separate switches for groups and announcements", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await withDevice(bob);
    await prisma.user_organization.update({ where: { user_organization_id: BigInt(alice.userOrganizationId) }, data: { role: "ADMIN" } });
    const group = await api("POST", "/groups", { token: alice.token, body: { name: "Team", memberIds: [bob.userOrganizationId] } });
    await api("PUT", "/user/settings/notifications", { token: bob.token, body: { groups: false } });
    capture();

    await api("POST", `/groups/${group.json.data.groupId}/messages`, { token: alice.token, body: { message: "group news" } });
    await settle();
    assert.equal(sent.length, 0, "groups are off");

    const orgId = (await prisma.user_organization.findUniqueOrThrow({ where: { user_organization_id: BigInt(alice.userOrganizationId) } })).org_id;
    await api("POST", "/broadcasts", { token: alice.token, body: { message: "all hands", targets: [{ organizationId: orgId.toString() }] } });
    await settle();
    assert.equal(sent.length, 1, "announcements are still on");
    assert.equal(sent[0].data.type, "BROADCAST");
    assert.equal(sent[0].android.notification.channelId, "announcements");
  });

  it("validates notification settings and keeps them per membership", async () => {
    const bob = await registerUser();
    const bad = await api("PUT", "/user/settings/notifications", { token: bob.token, body: { messages: "no" } });
    assert.equal(bad.status, 400);
    const unknown = await api("PUT", "/user/settings/notifications", { token: bob.token, body: { everything: false } });
    assert.equal(unknown.status, 400);
    const ok = await api("GET", "/user/settings/notifications", { token: bob.token });
    assert.deepEqual(ok.json.data, { messages: true, groups: true, announcements: true, calls: true, showPreview: true });
  });

  it("removes tokens Firebase reports as no longer registered", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await withDevice(bob, "dead-token");
    usePushTransportForTests(async () => ({
      successCount: 0,
      failureCount: 1,
      responses: [{ success: false, error: { code: "messaging/registration-token-not-registered" } }],
    }));

    await api("POST", "/chat/personal-chat/send", { token: alice.token, body: { receiverUserOrganizationId: bob.userOrganizationId, message: "hi" } });
    await settle();
    assert.equal(await prisma.user_device.count(), 0);
  });
});
