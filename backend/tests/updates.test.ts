import "./helpers/test-env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import sharp from "sharp";
import { api, baseUrl, org, prisma, registerUser, setupHarness } from "./helpers/harness.js";

setupHarness();

type User = Awaited<ReturnType<typeof registerUser>>;

const message = (from: User, to: User) =>
  api("POST", "/chat/personal-chat/send", { token: from.token, body: { receiverUserOrganizationId: to.userOrganizationId, message: "hi" } });

const feedOwners = async (user: User) =>
  (await api("GET", "/status", { token: user.token })).json.data.map((g: any) => g.owner.userOrganizationId);

const uploadPhoto = async (user: User) => {
  const bytes = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#123456" } }).jpeg().toBuffer();
  const started = await api("POST", "/media/uploads", { token: user.token, body: { kind: "IMAGE", mimeType: "image/jpeg", size: bytes.length } });
  const done = await fetch(`${baseUrl}${started.json.data.uploadPath}`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${user.token}`, "Content-Type": "application/octet-stream" },
    body: new Uint8Array(bytes),
  });
  return ((await done.json()) as any).data.mediaId as string;
};

describe("status updates", () => {
  it("shows a contacts-only status to people the owner has chatted with", async () => {
    const alice = await registerUser();
    const friend = await registerUser();
    const stranger = await registerUser();
    await message(alice, friend);

    const posted = await api("POST", "/status", { token: alice.token, body: { kind: "TEXT", text: "In Pune today", audience: "CONTACTS" } });
    assert.equal(posted.status, 201);

    assert.deepEqual(await feedOwners(friend), [alice.userOrganizationId]);
    assert.deepEqual(await feedOwners(stranger), []);
    assert.equal((await api("POST", `/status/${posted.json.data.statusId}/view`, { token: stranger.token })).status, 404);
  });

  it("records views for the owner only, and expires after 24 hours", async () => {
    const alice = await registerUser({ firstName: "Alice" });
    const bob = await registerUser({ firstName: "Bob" });
    const posted = await api("POST", "/status", { token: alice.token, body: { kind: "TEXT", text: "hello", audience: "EVERYONE" } });
    const statusId = posted.json.data.statusId;

    await api("POST", `/status/${statusId}/view`, { token: bob.token });
    const viewers = await api("GET", `/status/${statusId}/viewers`, { token: alice.token });
    assert.deepEqual(viewers.json.data.map((v: any) => v.name), ["Bob"]);
    assert.equal((await api("GET", `/status/${statusId}/viewers`, { token: bob.token })).status, 404);

    await prisma.status_post.update({ where: { status_id: BigInt(statusId) }, data: { expires_at: new Date(Date.now() - 1000) } });
    assert.deepEqual(await feedOwners(bob), []);
  });

  it("shares a selected-audience photo only with the chosen people, including its file", async () => {
    const alice = await registerUser();
    const chosen = await registerUser();
    const other = await registerUser();
    const mediaId = await uploadPhoto(alice);

    const posted = await api("POST", "/status", {
      token: alice.token,
      body: { kind: "IMAGE", mediaId, audience: "SELECTED", audienceIds: [chosen.userOrganizationId] },
    });
    assert.equal(posted.status, 201);
    assert.equal((await api("GET", `/media/${mediaId}/url`, { token: chosen.token })).status, 200);
    assert.equal((await api("GET", `/media/${mediaId}/url`, { token: other.token })).status, 404);
    assert.deepEqual(await feedOwners(other), []);
  });

  it("hides statuses across organizations unless the policy allows, and between blocked people", async () => {
    const alice = await registerUser();
    const partner = await registerUser({ orgCode: "ORGB" });
    const colleague = await registerUser();
    await api("POST", "/status", { token: alice.token, body: { kind: "TEXT", text: "hi", audience: "EVERYONE" } });

    assert.deepEqual(await feedOwners(partner), []);
    await prisma.organization_setting.updateMany({ data: { external_policy: "ALL_ORGANIZATIONS" } });
    assert.deepEqual(await feedOwners(partner), [alice.userOrganizationId]);

    await api("POST", "/user/blocks", { token: colleague.token, body: { userOrganizationId: alice.userOrganizationId } });
    assert.deepEqual(await feedOwners(colleague), []);
  });
});

describe("channels", () => {
  const setup = async () => {
    const owner = await registerUser({ firstName: "Owner" });
    await prisma.user_organization.update({ where: { user_organization_id: BigInt(owner.userOrganizationId) }, data: { role: "ADMIN" } });
    const created = await api("POST", "/channels", { token: owner.token, body: { name: "Company news" } });
    assert.equal(created.status, 201);
    return { owner, channelId: created.json.data.channelId as string };
  };

  it("lets members discover and follow, and only admins post", async () => {
    const { owner, channelId } = await setup();
    const follower = await registerUser();

    const discovered = await api("GET", "/channels/discover", { token: follower.token });
    assert.equal(discovered.json.data[0].channelId, channelId);
    assert.equal((await api("GET", `/channels/${channelId}/posts`, { token: follower.token })).status, 404, "follow first");

    await api("POST", `/channels/${channelId}/follow`, { token: follower.token });
    assert.equal((await api("POST", `/channels/${channelId}/posts`, { token: follower.token, body: { text: "me too" } })).status, 403);

    await api("POST", `/channels/${channelId}/posts`, { token: owner.token, body: { text: "Welcome" } });
    const mine = await api("GET", "/channels", { token: follower.token });
    assert.equal(mine.json.data[0].unreadCount, 1);
    const posts = await api("GET", `/channels/${channelId}/posts`, { token: follower.token });
    assert.deepEqual(posts.json.data.posts.map((p: any) => p.text), ["Welcome"]);
  });

  it("needs broadcast permission to create a channel", async () => {
    const member = await registerUser();
    const denied = await api("POST", "/channels", { token: member.token, body: { name: "x" } });
    assert.equal(denied.json.errorCode, "CHANNEL_CREATION_NOT_ALLOWED");
  });

  it("is only visible to organizations allowed by the policy", async () => {
    const { channelId } = await setup();
    const outsider = await registerUser({ orgCode: "ORGB" });
    assert.equal((await api("GET", "/channels/discover", { token: outsider.token })).json.data.length, 0);
    assert.equal((await api("POST", `/channels/${channelId}/follow`, { token: outsider.token })).status, 404);
  });
});

describe("communities", () => {
  it("links groups and adds their members to the announcement group", async () => {
    const admin = await registerUser({ firstName: "Admin" });
    const bob = await registerUser();
    const carol = await registerUser();
    const team = await api("POST", "/groups", { token: admin.token, body: { name: "Team", memberIds: [bob.userOrganizationId] } });

    const created = await api("POST", "/communities", { token: admin.token, body: { name: "Engineering", groupIds: [team.json.data.groupId] } });
    assert.equal(created.status, 201);
    const announcementGroupId = created.json.data.announcementGroupId;

    // Bob was in a linked group, so he is in the community and gets announcements.
    const forBob = await api("GET", "/communities", { token: bob.token });
    assert.equal(forBob.json.data[0].name, "Engineering");
    const posted = await api("POST", `/groups/${announcementGroupId}/messages`, { token: bob.token, body: { message: "hi" } });
    assert.equal(posted.json.errorCode, "ONLY_ADMINS_CAN_SEND");
    assert.equal((await api("POST", `/groups/${announcementGroupId}/messages`, { token: admin.token, body: { message: "Kickoff Monday" } })).status, 201);

    // Adding Carol to a linked group brings her into the community.
    await api("POST", `/groups/${team.json.data.groupId}/members`, { token: admin.token, body: { userOrganizationIds: [carol.userOrganizationId] } });
    assert.equal((await api("GET", "/communities", { token: carol.token })).json.data.length, 1);
  });

  it("lets community members join its groups, and hides it from others", async () => {
    const admin = await registerUser();
    const bob = await registerUser();
    const outsider = await registerUser();
    const team = await api("POST", "/groups", { token: admin.token, body: { name: "Team", memberIds: [bob.userOrganizationId] } });
    const side = await api("POST", "/groups", { token: admin.token, body: { name: "Social", memberIds: [] } });
    const community = await api("POST", "/communities", { token: admin.token, body: { name: "All", groupIds: [team.json.data.groupId, side.json.data.groupId] } });
    const communityId = community.json.data.communityId;

    const joined = await api("POST", `/communities/${communityId}/groups/${side.json.data.groupId}/join`, { token: bob.token });
    assert.equal(joined.status, 200);
    assert.equal((await api("GET", `/groups/${side.json.data.groupId}`, { token: bob.token })).status, 200);

    assert.equal((await api("GET", `/communities/${communityId}`, { token: outsider.token })).status, 404);
    assert.equal((await api("POST", `/communities/${communityId}/groups/${side.json.data.groupId}/join`, { token: outsider.token })).status, 404);
  });

  it("only takes groups the creator admins", async () => {
    const admin = await registerUser();
    const other = await registerUser();
    const theirs = await api("POST", "/groups", { token: other.token, body: { name: "Theirs", memberIds: [] } });
    const result = await api("POST", "/communities", { token: admin.token, body: { name: "Grab", groupIds: [theirs.json.data.groupId] } });
    assert.equal(result.json.errorCode, "INVALID_GROUP");
  });
});

void org;
