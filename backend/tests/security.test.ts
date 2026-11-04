import "./helpers/test-env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  api,
  baseUrl,
  loginAgain,
  org,
  prisma,
  registerUser,
  setupHarness,
} from "./helpers/harness.js";

setupHarness();

describe("push tokens", () => {
  it("cannot be deleted by another user", async () => {
    const owner = await registerUser();
    const attacker = await registerUser();

    await api("POST", "/user/device", {
      token: owner.token,
      body: { fcmToken: "owner-token" },
    });

    const attempt = await api("DELETE", "/user/device", {
      token: attacker.token,
      body: { fcmToken: "owner-token" },
    });
    assert.equal(attempt.status, 200);
    assert.equal(await prisma.user_device.count(), 1);

    await api("DELETE", "/user/device", {
      token: owner.token,
      body: { fcmToken: "owner-token" },
    });
    assert.equal(await prisma.user_device.count(), 0);
  });

  it("validates registration input", async () => {
    const user = await registerUser();

    for (const body of [
      {},
      { fcmToken: 5 },
      { fcmToken: "x".repeat(501) },
      { fcmToken: "ok", deviceType: {} },
    ]) {
      const result = await api("POST", "/user/device", {
        token: user.token,
        body,
      });
      assert.equal(result.status, 400, JSON.stringify(body));
    }
  });
});

describe("organization directory", () => {
  it("GET /chat/contacts returns only the caller's organization", async () => {
    const outsider = await registerUser({ orgCode: "ORGB", firstName: "Outsider" });
    const colleague = await registerUser({ firstName: "Colleague" });
    const me = await registerUser({ firstName: "Me" });

    const result = await api("GET", "/chat/contacts", { token: me.token });

    assert.equal(result.status, 200);
    const ids = result.json.data.map((user: any) => user.userOrganizationId);
    assert.deepEqual(ids, [colleague.userOrganizationId]);
    assert.ok(!ids.includes(outsider.userOrganizationId));
  });

  it("contact check returns the membership in the caller's organization", async () => {
    // Member of B first, so B is this person's first membership row.
    const person = await registerUser({ orgCode: "ORGB" });
    const setup = await loginAgain(person.mobileNo, "ORGA");
    const inA = await api("POST", "/organization/setup", {
      token: setup.json.data.token,
      body: { orgCode: "ORGA" },
    });
    const me = await registerUser();

    const result = await api("POST", "/chat/contacts/check", {
      token: me.token,
      body: { contacts: [{ name: "P", phone: `+91${person.mobileNo}` }] },
    });

    assert.equal(result.status, 200);
    assert.equal(
      result.json.data.registered[0].userOrganizationId,
      inA.json.data.userOrganizationId,
    );
  });

  it("does not reveal that a number is registered in another organization", async () => {
    const outsider = await registerUser({ orgCode: "ORGB" });
    const me = await registerUser();

    const result = await api("POST", "/chat/contacts/check", {
      token: me.token,
      body: {
        contacts: [
          { name: "Outsider", phone: outsider.mobileNo },
          { name: "Nobody", phone: "9999999999" },
        ],
      },
    });

    assert.deepEqual(result.json.data.registered, []);
    assert.deepEqual(
      result.json.data.notRegistered.map((contact: any) => contact.name).sort(),
      ["Nobody", "Outsider"],
    );
    assert.ok(org.b);
  });

  it("limits contact uploads", async () => {
    const me = await registerUser();
    const result = await api("POST", "/chat/contacts/check", {
      token: me.token,
      body: {
        contacts: Array.from({ length: 5001 }, () => ({ name: "x", phone: "1" })),
      },
    });
    assert.equal(result.status, 400);
  });
});

describe("HTTP hardening", () => {
  it("allows only configured browser origins", async () => {
    const allowed = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { Origin: "https://admin.example.com" },
    });
    assert.equal(
      allowed.headers.get("access-control-allow-origin"),
      "https://admin.example.com",
    );

    const denied = await fetch(`${baseUrl}/api/v1/health`, {
      headers: { Origin: "https://evil.example.com" },
    });
    assert.equal(denied.headers.get("access-control-allow-origin"), null);
  });

  it("protected routes reject missing and invalid tokens", async () => {
    for (const path of [
      "/auth/me",
      "/auth/sessions",
      "/user/getProfile",
      "/chat/contacts",
      "/chat/conversations",
      "/chat/personal/1/messages",
    ]) {
      assert.equal((await api("GET", path)).status, 401, path);
      assert.equal((await api("GET", path, { token: "garbage" })).status, 401, path);
    }
  });

  it("answers unknown routes with the standard JSON error", async () => {
    const result = await api("GET", "/does-not-exist");
    assert.equal(result.status, 404);
    assert.equal(result.json.errorCode, "NOT_FOUND");
  });
});
