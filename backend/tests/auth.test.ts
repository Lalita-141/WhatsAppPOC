import "./helpers/test-env.js";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  api,
  country,
  loginAgain,
  nextPhone,
  prisma,
  registerUser,
  requestOtp,
  sentCodes,
  setupHarness,
  skipCooldown,
  verify,
} from "./helpers/harness.js";
import { env } from "../src/config/env.js";
import { setSmsProvider } from "../src/modules/sms/sms.service.js";

setupHarness();

const wrongCode = (code: string) => (code === "000000" ? "000001" : "000000");

describe("OTP", () => {
  it("never returns the code by default and stores only a hash", async () => {
    const phone = nextPhone();
    const { response, code } = await requestOtp(phone);

    assert.equal(response.status, 200);
    assert.equal(response.json.data.otp, undefined);
    assert.equal(JSON.stringify(response.json).includes(code), false);
    assert.match(code, /^\d{6}$/);

    const row = await prisma.register_otp.findFirstOrThrow();
    assert.notEqual(row.otp, code);
    assert.equal(row.otp.length, 64);
  });

  it("returns the code only when the development echo is on", async () => {
    const phone = nextPhone();
    env.otpDevEcho = true;
    try {
      const { response, code } = await requestOtp(phone);
      assert.equal(response.json.data.otp, code);
    } finally {
      env.otpDevEcho = false;
    }
  });

  it("is single use", async () => {
    const phone = nextPhone();
    const { code } = await requestOtp(phone);

    assert.equal((await verify(phone, code)).status, 200);

    const replay = await verify(phone, code);
    assert.equal(replay.status, 400);
    assert.equal(replay.json.errorCode, "OTP_NOT_FOUND");
  });

  it("rejects an expired code", async () => {
    const phone = nextPhone();
    const { code } = await requestOtp(phone);
    await prisma.register_otp.updateMany({
      data: { expires_at: new Date(Date.now() - 1000) },
    });

    const result = await verify(phone, code);
    assert.equal(result.json.errorCode, "OTP_EXPIRED");
  });

  it("invalidates the previous code when a new one is requested", async () => {
    const phone = nextPhone();
    const { code: first } = await requestOtp(phone);
    await skipCooldown();
    const { code: second } = await requestOtp(phone);

    if (first !== second) {
      assert.equal((await verify(phone, first)).json.errorCode, "INVALID_OTP");
    }
    assert.equal((await verify(phone, second)).status, 200);
  });

  it("enforces the resend cooldown across organizations", async () => {
    const phone = nextPhone();
    await requestOtp(phone, "ORGA");

    const other = await requestOtp(phone, "ORGB");
    assert.equal(other.response.status, 429);
    assert.equal(other.response.json.errorCode, "OTP_COOLDOWN");

    // Guards against a database/UTC time-zone mismatch inflating the wait.
    const seconds = Number(/wait (\d+) seconds/.exec(other.response.json.message)?.[1]);
    assert.ok(seconds >= 1 && seconds <= 60, `waited ${seconds} seconds`);
  });

  it("blocks after 5 wrong codes, and a new request cannot reset it", async () => {
    const phone = nextPhone();
    const { code } = await requestOtp(phone);
    const wrong = wrongCode(code);

    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const result = await verify(phone, wrong);
      assert.equal(result.json.errorCode, "INVALID_OTP");
    }

    assert.equal((await verify(phone, wrong)).json.errorCode, "OTP_BLOCKED");

    // Even the correct code fails now.
    assert.equal((await verify(phone, code)).json.errorCode, "OTP_BLOCKED");

    await skipCooldown();
    const again = await requestOtp(phone);
    assert.equal(again.response.json.errorCode, "OTP_BLOCKED");

    const otherOrg = await requestOtp(phone, "ORGB");
    assert.equal(otherOrg.response.json.errorCode, "OTP_BLOCKED");
  });

  it("does not let parallel guesses exceed the limit", async () => {
    const phone = nextPhone();
    const { code } = await requestOtp(phone);
    const wrong = wrongCode(code);

    await Promise.all(
      Array.from({ length: 25 }, () => verify(phone, wrong)),
    );

    const row = await prisma.register_otp.findFirstOrThrow();
    assert.ok(row.trail_count <= 5, `trail_count was ${row.trail_count}`);
  });

  it("lets only one of many parallel correct submissions succeed", async () => {
    const phone = nextPhone();
    const { code } = await requestOtp(phone);

    const results = await Promise.all(
      Array.from({ length: 4 }, () => verify(phone, code)),
    );

    assert.equal(results.filter((result) => result.status === 200).length, 1);
  });

  it("reports SMS failure and leaves no usable code", async () => {
    const phone = nextPhone();
    setSmsProvider({
      name: "failing",
      send: async () => {
        throw new Error("provider down");
      },
    });

    try {
      const result = await requestOtp(phone);
      assert.equal(result.response.status, 502);
      assert.equal(result.response.json.errorCode, "SMS_DELIVERY_FAILED");
      const row = await prisma.register_otp.findFirstOrThrow();
      // DATETIME(0) can round up to the next second.
      assert.ok(row.expires_at.getTime() <= Date.now() + 1000);
    } finally {
      setSmsProvider({
        name: "test",
        send: async (toE164, body) => {
          sentCodes.set(
            toE164.replace(/^\+1/, "").replace(/^\+91/, ""),
            /\d{6}/.exec(body)?.[0] as string,
          );
        },
      });
    }
  });

  it("answers malformed input with 400, not 500", async () => {
    const bad: unknown[] = [
      undefined,
      {},
      { orgCode: 1, countryId: 1, mobileNo: 1 },
      { orgCode: "ORGA", countryId: "abc", mobileNo: "9730700560" },
      { orgCode: "ORGA", countryId: country.in, mobileNo: "123456" },
    ];

    for (const body of bad) {
      const result = await api("POST", "/auth/send-otp", { body });
      assert.equal(result.status, 400, JSON.stringify(body));
    }

    const malformed = await api("POST", "/auth/send-otp", { rawBody: "{bad" });
    assert.equal(malformed.status, 400);
    assert.equal(malformed.json.errorCode, "INVALID_REQUEST_BODY");
  });
});

describe("phone identity", () => {
  it("keeps the same digits in different countries as separate people", async () => {
    const digits = "2025550123";
    const owner = await registerUser({
      mobileNo: digits,
      firstName: "Indian owner",
    });
    assert.ok(owner.userId);

    await skipCooldown();

    // 2025550123 is possible in both countries.
    const { code } = await requestOtp(digits, "ORGA", country.us);
    const result = await verify(digits, code, "ORGA", country.us);

    assert.equal(result.status, 200);
    assert.equal(result.json.data.nextStep, "PROFILE_SETUP");
    assert.equal(result.json.data.userId, undefined);
  });
});

describe("registration", () => {
  it("requires a setup token", async () => {
    const result = await api("POST", "/user/profile", {
      body: {
        orgCode: "ORGA",
        countryId: country.in,
        mobileNo: "9730700560",
        firstName: "Attacker",
      },
    });

    assert.equal(result.status, 401);
    assert.equal(await prisma.user_master.count(), 0);
  });

  it("uses the verified number, ignoring a different number in the body", async () => {
    const phone = nextPhone();
    const { code } = await requestOtp(phone);
    const verified = await verify(phone, code);

    const victim = nextPhone();
    const result = await api("POST", "/user/profile", {
      token: verified.json.data.token,
      body: {
        orgCode: "ORGB",
        mobileNo: victim,
        firstName: "Attacker",
      },
    });

    assert.equal(result.status, 201);
    assert.equal(result.json.data.mobileNo, phone);
    assert.equal(result.json.data.organizationId, (await prisma.organization_master.findFirstOrThrow({ where: { org_code: "ORGA" } })).org_id.toString());
    assert.equal(
      await prisma.user_master.count({ where: { mobile_no: victim } }),
      0,
    );
  });

  it("rejects replaying a setup token once the account exists", async () => {
    const phone = nextPhone();
    const { code } = await requestOtp(phone);
    const { json } = await verify(phone, code);
    const token = json.data.token;

    const first = await api("POST", "/user/profile", {
      token,
      body: { firstName: "One" },
    });
    assert.equal(first.status, 201);

    const second = await api("POST", "/user/profile", {
      token,
      body: { firstName: "Two" },
    });
    assert.equal(second.status, 409);
  });

  it("returns a working session without a second OTP", async () => {
    const user = await registerUser();

    const me = await api("GET", "/auth/me", { token: user.token });
    assert.equal(me.status, 200);
    assert.equal(me.json.data.userOrganizationId, user.userOrganizationId);
    assert.ok(user.refreshToken.length > 40);
  });
});

describe("token types", () => {
  it("does not accept a setup token on protected routes", async () => {
    const user = await registerUser();

    // Existing user, new organization: this yields an organization setup token.
    const orgSetup = await loginAgain(user.mobileNo, "ORGB");
    assert.equal(orgSetup.json.data.nextStep, "ORGANIZATION_SETUP");
    const setupToken = orgSetup.json.data.token;

    for (const [method, path, body] of [
      ["GET", "/auth/me", undefined],
      ["GET", "/chat/contacts", undefined],
      ["GET", "/chat/conversations", undefined],
      ["POST", "/chat/contacts/check", { contacts: [{ name: "x", phone: "9730700560" }] }],
    ] as const) {
      const result = await api(method, path, { token: setupToken, body });
      assert.ok(
        result.status === 401 || result.status === 403,
        `${path} returned ${result.status}`,
      );
    }
  });

  it("does not accept an access token for setup, or a profile token for access", async () => {
    const user = await registerUser();

    const setupWithAccess = await api("POST", "/organization/setup", {
      token: user.token,
      body: { orgCode: "ORGB" },
    });
    assert.equal(setupWithAccess.status, 403);

    const phone = nextPhone();
    const { code } = await requestOtp(phone);
    const { json } = await verify(phone, code);

    const accessWithProfile = await api("GET", "/auth/me", {
      token: json.data.token,
    });
    assert.equal(accessWithProfile.status, 401);
  });
});

describe("sessions", () => {
  it("rotates the refresh token", async () => {
    const user = await registerUser();

    const refreshed = await api("POST", "/auth/refresh", {
      body: { refreshToken: user.refreshToken },
    });

    assert.equal(refreshed.status, 200);
    assert.notEqual(refreshed.json.data.refreshToken, user.refreshToken);
    assert.equal(
      (await api("GET", "/auth/me", { token: refreshed.json.data.token })).status,
      200,
    );
  });

  it("stores only a hash of the refresh token", async () => {
    const user = await registerUser();
    const session = await prisma.user_session.findFirstOrThrow();

    assert.notEqual(session.refresh_token_hash, user.refreshToken);
    assert.equal(session.refresh_token_hash.length, 64);
  });

  it("allows a quick retry after a lost response", async () => {
    const user = await registerUser();

    await api("POST", "/auth/refresh", {
      body: { refreshToken: user.refreshToken },
    });

    const retry = await api("POST", "/auth/refresh", {
      body: { refreshToken: user.refreshToken },
    });
    assert.equal(retry.status, 200);
  });

  it("revokes the session when an old token is reused later", async () => {
    const user = await registerUser();

    const refreshed = await api("POST", "/auth/refresh", {
      body: { refreshToken: user.refreshToken },
    });
    await prisma.user_session.updateMany({
      data: { rotated_at: new Date(Date.now() - 60 * 1000) },
    });

    const stolen = await api("POST", "/auth/refresh", {
      body: { refreshToken: user.refreshToken },
    });
    assert.equal(stolen.status, 401);
    assert.equal(stolen.json.errorCode, "REFRESH_TOKEN_REUSED");

    // The legitimate holder is out too, and must log in again.
    const legitimate = await api("POST", "/auth/refresh", {
      body: { refreshToken: refreshed.json.data.refreshToken },
    });
    assert.equal(legitimate.status, 401);
    assert.equal(
      (await api("GET", "/auth/me", { token: refreshed.json.data.token })).status,
      401,
    );
  });

  it("rejects unknown and expired refresh tokens", async () => {
    const user = await registerUser();

    const unknown = await api("POST", "/auth/refresh", {
      body: { refreshToken: "nope" },
    });
    assert.equal(unknown.status, 401);

    await prisma.user_session.updateMany({
      data: { expires_at: new Date(Date.now() - 1000) },
    });
    const expired = await api("POST", "/auth/refresh", {
      body: { refreshToken: user.refreshToken },
    });
    assert.equal(expired.status, 401);
    assert.equal((await api("GET", "/auth/me", { token: user.token })).status, 401);
  });

  it("logout ends the session immediately and removes its push token", async () => {
    const user = await registerUser();
    await api("POST", "/user/device", {
      token: user.token,
      body: { fcmToken: "device-1", deviceType: "android" },
    });
    assert.equal(await prisma.user_device.count(), 1);

    assert.equal(
      (await api("POST", "/auth/logout", { token: user.token })).status,
      200,
    );

    assert.equal(await prisma.user_device.count(), 0);
    assert.equal((await api("GET", "/auth/me", { token: user.token })).status, 401);
    assert.equal(
      (
        await api("POST", "/auth/refresh", {
          body: { refreshToken: user.refreshToken },
        })
      ).status,
      401,
    );
  });

  it("can log out with only the refresh token once access has expired", async () => {
    const user = await registerUser();
    await api("POST", "/user/device", {
      token: user.token,
      body: { fcmToken: "device-2" },
    });

    const result = await api("POST", "/auth/revoke", {
      body: { refreshToken: user.refreshToken },
    });
    assert.equal(result.status, 200);

    assert.equal(await prisma.user_device.count(), 0);
    assert.equal((await api("GET", "/auth/me", { token: user.token })).status, 401);

    // Unknown tokens get the same answer and change nothing.
    const other = await registerUser();
    const unknown = await api("POST", "/auth/revoke", {
      body: { refreshToken: "unknown" },
    });
    assert.equal(unknown.status, 200);
    assert.equal((await api("GET", "/auth/me", { token: other.token })).status, 200);
  });

  it("logout-all ends every session in every organization", async () => {
    const user = await registerUser();
    const second = await loginAgain(user.mobileNo);
    const orgSetup = await loginAgain(user.mobileNo, "ORGB");
    const inOrgB = await api("POST", "/organization/setup", {
      token: orgSetup.json.data.token,
      body: { orgCode: "ORGB" },
    });
    assert.equal(inOrgB.status, 201);

    await api("POST", "/auth/logout-all", { token: user.token });

    for (const token of [user.token, second.json.data.token, inOrgB.json.data.token]) {
      assert.equal((await api("GET", "/auth/me", { token })).status, 401);
    }
  });

  it("lists own sessions and marks the current one", async () => {
    const user = await registerUser();
    await loginAgain(user.mobileNo);

    const result = await api("GET", "/auth/sessions", { token: user.token });
    assert.equal(result.json.data.length, 2);
    assert.equal(
      result.json.data.filter((session: any) => session.isCurrent).length,
      1,
    );
    assert.equal(JSON.stringify(result.json).includes("hash"), false);
  });

  it("cannot revoke another user's session", async () => {
    const user = await registerUser();
    const other = await registerUser();

    const attempt = await api("DELETE", `/auth/sessions/${other.sessionId}`, {
      token: user.token,
    });
    assert.equal(attempt.status, 404);
    assert.equal((await api("GET", "/auth/me", { token: other.token })).status, 200);

    const own = await api("DELETE", `/auth/sessions/${user.sessionId}`, {
      token: user.token,
    });
    assert.equal(own.status, 200);
    assert.equal((await api("GET", "/auth/me", { token: user.token })).status, 401);
  });

  it("ends access when a membership or a user is removed", async () => {
    const member = await registerUser();
    const person = await registerUser();

    await prisma.user_organization.update({
      where: { user_organization_id: BigInt(member.userOrganizationId) },
      data: { deleted_at: new Date() },
    });
    assert.equal((await api("GET", "/auth/me", { token: member.token })).status, 401);
    assert.equal(
      (
        await api("POST", "/auth/refresh", {
          body: { refreshToken: member.refreshToken },
        })
      ).status,
      401,
    );

    await prisma.user_master.update({
      where: { user_id: BigInt(person.userId) },
      data: { deleted_at: new Date() },
    });
    assert.equal((await api("GET", "/auth/me", { token: person.token })).status, 401);
  });
});

describe("organization setup", () => {
  it("joins, creates settings, and returns a session", async () => {
    const user = await registerUser();
    const orgSetup = await loginAgain(user.mobileNo, "ORGB");

    const joined = await api("POST", "/organization/setup", {
      token: orgSetup.json.data.token,
      body: { orgCode: "ORGB" },
    });

    assert.equal(joined.status, 201);
    assert.equal(
      await prisma.user_setting.count({
        where: {
          user_organization_id: BigInt(joined.json.data.userOrganizationId),
        },
      }),
      1,
    );
    assert.equal(
      (await api("GET", "/auth/me", { token: joined.json.data.token })).status,
      200,
    );
  });

  it("rejects a different organization than the verified one", async () => {
    const user = await registerUser();
    const orgSetup = await loginAgain(user.mobileNo, "ORGB");
    await prisma.organization_master.create({
      data: { org_code: "ORGC", organization_name: "Org C" },
    });

    const result = await api("POST", "/organization/setup", {
      token: orgSetup.json.data.token,
      body: { orgCode: "ORGC" },
    });
    assert.equal(result.status, 403);
  });

  it("does not let a removed member back in", async () => {
    const user = await registerUser();
    await prisma.user_organization.update({
      where: { user_organization_id: BigInt(user.userOrganizationId) },
      data: { deleted_at: new Date() },
    });

    // Refused at login, before any setup token is issued.
    const result = await loginAgain(user.mobileNo);
    assert.equal(result.status, 403);
    assert.equal(result.json.errorCode, "MEMBERSHIP_REMOVED");
    assert.equal(result.json.data, undefined);
  });
});
