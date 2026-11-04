import "./helpers/test-env.js";
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import express from "express";
import { AddressInfo } from "net";
import { loadEnv } from "../src/config/env.js";
import { createRateLimiter } from "../src/middleware/rate-limit.middleware.js";
import {
  normalizeContactPhone,
  normalizePhoneForCountry,
} from "../src/utils/phone.js";
import { getSmsProvider } from "../src/modules/sms/sms.service.js";
import { env } from "../src/config/env.js";

const productionEnv = {
  NODE_ENV: "production",
  JWT_ACCESS_SECRET: "a".repeat(40),
  JWT_PROFILE_SETUP_SECRET: "b".repeat(40),
  OTP_HASH_SECRET: "c".repeat(40),
  MEDIA_URL_SECRET: "d".repeat(40),
  SMS_PROVIDER: "twilio",
  TWILIO_ACCOUNT_SID: "AC1",
  TWILIO_AUTH_TOKEN: "tok",
  TWILIO_FROM: "+15550000000",
  CORS_ORIGINS: "https://admin.example.com",
};

describe("production configuration refuses unsafe settings", () => {
  it("accepts a safe configuration", () => {
    assert.equal(loadEnv(productionEnv).isProduction, true);
  });

  const unsafe: [string, Record<string, string | undefined>, RegExp][] = [
    ["OTP echo", { OTP_DEV_ECHO: "true" }, /OTP_DEV_ECHO/],
    ["console SMS", { SMS_PROVIDER: "console" }, /console/],
    ["wildcard CORS", { CORS_ORIGINS: "*" }, /CORS_ORIGINS/],
    ["short secret", { JWT_ACCESS_SECRET: "short" }, /JWT_ACCESS_SECRET/],
    ["missing OTP secret", { OTP_HASH_SECRET: undefined }, /OTP_HASH_SECRET/],
    ["missing media link secret", { MEDIA_URL_SECRET: undefined }, /MEDIA_URL_SECRET/],
    ["unimplemented storage provider", { MEDIA_STORAGE_PROVIDER: "s3" }, /MEDIA_STORAGE_PROVIDER/],
    ["TURN without its secret", { TURN_URLS: "turn:turn.example.com:3478" }, /TURN_SECRET/],
    ["relaxed rate limits", { RATE_LIMIT_MULTIPLIER: "100" }, /RATE_LIMIT/],
    [
      "shared JWT secret",
      { JWT_PROFILE_SETUP_SECRET: "a".repeat(40) },
      /must be different/,
    ],
    ["incomplete Twilio", { TWILIO_AUTH_TOKEN: undefined }, /TWILIO/],
  ];

  for (const [name, overrides, message] of unsafe) {
    it(`rejects ${name}`, () => {
      assert.throws(() => loadEnv({ ...productionEnv, ...overrides }), message);
    });
  }
});

describe("phone normalization", () => {
  it("normalizes Indian and US numbers with their country", () => {
    assert.equal(
      normalizePhoneForCountry("9730700560", "IN").e164,
      "+919730700560",
    );
    assert.equal(
      normalizePhoneForCountry("2025550123", "US").e164,
      "+12025550123",
    );
  });

  it("rejects an impossible number with a 400, not a crash", () => {
    assert.throws(
      () => normalizePhoneForCountry("123456", "IN"),
      (error: any) => error.statusCode === 400,
    );
  });

  it("handles address-book formats", () => {
    for (const raw of ["+91 97307 00560", "919730700560", "09730700560", "97307-00560"]) {
      assert.equal(
        normalizeContactPhone(raw, "IN")?.nationalNumber,
        "9730700560",
        raw,
      );
    }
    assert.equal(normalizeContactPhone("+1 202 555 0123", "IN")?.callingCode, "1");
    assert.equal(normalizeContactPhone("not a phone", "IN"), null);
  });
});

describe("Twilio SMS provider", () => {
  afterEach(() => {
    mock.restoreAll();
    Object.assign(env.twilio, {
      accountSid: undefined,
      authToken: undefined,
      from: undefined,
    });
  });

  it("sends the expected request and reports failures", async () => {
    Object.assign(env.twilio, {
      accountSid: "AC123",
      authToken: "secret",
      from: "+15550000000",
    });

    const fetchMock = mock.method(globalThis, "fetch", async () =>
      new Response("{}", { status: 201 }),
    );

    await getSmsProvider("twilio").send("+919730700560", "code 123456");

    const [url, init] = fetchMock.mock.calls[0].arguments as [string, RequestInit];
    assert.equal(
      url,
      "https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json",
    );
    const form = init.body as URLSearchParams;
    assert.equal(form.get("To"), "+919730700560");
    assert.equal(form.get("From"), "+15550000000");
    assert.equal(
      (init.headers as Record<string, string>).Authorization,
      `Basic ${Buffer.from("AC123:secret").toString("base64")}`,
    );

    fetchMock.mock.mockImplementation(async () =>
      new Response("{}", { status: 400 }),
    );
    await assert.rejects(
      getSmsProvider("twilio").send("+919730700560", "code"),
      /HTTP 400/,
    );
  });
});

describe("rate limiter", () => {
  it("returns the standard error once the limit is passed", async () => {
    const app = express();
    // Multiplier is 1000 in tests, so 1 means 1000 requests are allowed; a
    // fractional limit keeps this test fast.
    app.get("/", createRateLimiter(0.002, 60_000), (_req, res) => {
      res.json({ ok: true });
    });
    const server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/`;

    assert.equal((await fetch(url)).status, 200);
    assert.equal((await fetch(url)).status, 200);
    const limited = await fetch(url);
    assert.equal(limited.status, 429);
    assert.equal(((await limited.json()) as any).errorCode, "RATE_LIMITED");

    server.close();
  });
});
