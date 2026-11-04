import "./helpers/test-env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  api,
  loginAgain,
  prisma,
  registerUser,
  setupHarness,
  skipCooldown,
} from "./helpers/harness.js";

setupHarness();

const joinOrgB = async (mobileNo: string) => {
  const setup = await loginAgain(mobileNo, "ORGB");
  const joined = await api("POST", "/organization/setup", {
    token: setup.json.data.token,
    body: { orgCode: "ORGB" },
  });
  assert.equal(joined.status, 201);
  return joined.json.data;
};

describe("organizations", () => {
  it("lists only the caller's memberships and marks the current one", async () => {
    const user = await registerUser();
    await registerUser();
    const inB = await joinOrgB(user.mobileNo);

    const { status, json } = await api("GET", "/auth/organizations", { token: inB.token });

    assert.equal(status, 200);
    assert.deepEqual(
      json.data.map((m: any) => [m.orgCode, m.isCurrent]),
      [["ORGA", false], ["ORGB", true]],
    );
  });

  it("switches to another own membership and ends the old session", async () => {
    const user = await registerUser();
    const inB = await joinOrgB(user.mobileNo);

    const switched = await api("POST", "/auth/switch-organization", {
      token: inB.token,
      body: { userOrganizationId: user.userOrganizationId },
    });

    assert.equal(switched.status, 200);
    assert.equal(switched.json.data.userOrganizationId, user.userOrganizationId);
    assert.ok(switched.json.data.refreshToken);

    const me = await api("GET", "/auth/me", { token: switched.json.data.token });
    assert.equal(me.status, 200);

    const oldAccess = await api("GET", "/auth/me", { token: inB.token });
    assert.equal(oldAccess.status, 401);

    const oldRefresh = await api("POST", "/auth/refresh", {
      body: { refreshToken: inB.refreshToken },
    });
    assert.equal(oldRefresh.status, 401);
  });

  it("refuses to switch into someone else's membership", async () => {
    const user = await registerUser();
    const stranger = await registerUser();

    const { status, json } = await api("POST", "/auth/switch-organization", {
      token: user.token,
      body: { userOrganizationId: stranger.userOrganizationId },
    });

    assert.equal(status, 404);
    assert.equal(json.errorCode, "MEMBERSHIP_NOT_FOUND");

    const stillValid = await api("GET", "/auth/me", { token: user.token });
    assert.equal(stillValid.status, 200);
  });

  it("rejects switching to the current or a malformed membership", async () => {
    const user = await registerUser();

    const same = await api("POST", "/auth/switch-organization", {
      token: user.token,
      body: { userOrganizationId: user.userOrganizationId },
    });
    assert.equal(same.status, 400);

    const bad = await api("POST", "/auth/switch-organization", {
      token: user.token,
      body: { userOrganizationId: "1 OR 1=1" },
    });
    assert.equal(bad.status, 400);
  });
});

describe("privacy settings", () => {
  it("returns defaults and saves valid changes for this membership only", async () => {
    const user = await registerUser();
    const other = await registerUser();

    const initial = await api("GET", "/user/settings/privacy", { token: user.token });
    assert.equal(initial.json.data.lastSeenPrivacy, "EVERYONE");
    assert.equal(initial.json.data.readReceipts, true);

    const saved = await api("PUT", "/user/settings/privacy", {
      token: user.token,
      body: { lastSeenPrivacy: "NOBODY", readReceipts: false },
    });
    assert.equal(saved.status, 200);
    assert.equal(saved.json.data.lastSeenPrivacy, "NOBODY");
    assert.equal(saved.json.data.readReceipts, false);

    const untouched = await api("GET", "/user/settings/privacy", { token: other.token });
    assert.equal(untouched.json.data.lastSeenPrivacy, "EVERYONE");
  });

  it("rejects unknown fields and invalid values", async () => {
    const user = await registerUser();

    for (const body of [
      { lastSeenPrivacy: "FRIENDS" },
      { readReceipts: "no" },
      { user_organization_id: "1" },
      {},
    ]) {
      const { status } = await api("PUT", "/user/settings/privacy", { token: user.token, body });
      assert.equal(status, 400, JSON.stringify(body));
    }
  });
});

describe("account deletion", () => {
  it("requires explicit confirmation", async () => {
    const user = await registerUser();

    const { status } = await api("DELETE", "/user/account", { token: user.token, body: {} });

    assert.equal(status, 400);
    assert.equal((await api("GET", "/auth/me", { token: user.token })).status, 200);
  });

  it("signs out every device, removes personal data and frees the number", async () => {
    const user = await registerUser({ firstName: "Asha" });
    const inB = await joinOrgB(user.mobileNo);
    await prisma.user_device.create({
      data: {
        user_organization_id: BigInt(user.userOrganizationId),
        fcm_token: "token-to-remove",
      },
    });

    const deleted = await api("DELETE", "/user/account", {
      token: user.token,
      body: { confirmation: "DELETE" },
    });
    assert.equal(deleted.status, 200);

    assert.equal((await api("GET", "/auth/me", { token: user.token })).status, 401);
    assert.equal((await api("GET", "/auth/me", { token: inB.token })).status, 401);
    assert.equal(
      (await api("POST", "/auth/refresh", { body: { refreshToken: user.refreshToken } })).status,
      401,
    );

    const row = await prisma.user_master.findUniqueOrThrow({
      where: { user_id: BigInt(user.userId) },
    });
    assert.equal(row.first_name, "Deleted");
    assert.notEqual(row.mobile_no, user.mobileNo);
    assert.ok(row.deleted_at);
    assert.equal(await prisma.user_device.count(), 0);

    await skipCooldown();
    const again = await registerUser({ mobileNo: user.mobileNo });
    assert.notEqual(again.userId, user.userId);
  });
});
