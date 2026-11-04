import "./test-env.js";
import http from "http";
import { AddressInfo } from "net";
import { after, before, beforeEach } from "node:test";
import app from "../../src/app.js";
import prisma from "../../src/config/database.js";
import { initializeSocket } from "../../src/socket/socket.server.js";
import { setSmsProvider } from "../../src/modules/sms/sms.service.js";

export { prisma };

export const sentCodes = new Map<string, string>();
export let baseUrl = "";
export let org: { a: bigint; b: bigint };
export let country: { in: string; us: string };

let phoneCounter = 0;

export const nextPhone = () => {
  phoneCounter += 1;
  return `98${String(phoneCounter + 10_000_000 + (process.pid % 1000) * 1000).slice(-8)}`;
};

export const api = async (
  method: string,
  path: string,
  options: { token?: string; body?: unknown; rawBody?: string; headers?: Record<string, string> } = {},
) => {
  const response = await fetch(`${baseUrl}/api/v1${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
      ...options.headers,
    },
    body:
      options.rawBody ??
      (options.body === undefined ? undefined : JSON.stringify(options.body)),
  });

  return {
    status: response.status,
    headers: response.headers,
    json: (await response.json().catch(() => null)) as any,
  };
};

export const requestOtp = async (
  mobileNo: string,
  orgCode = "ORGA",
  countryId = country.in,
) => {
  const response = await api("POST", "/auth/send-otp", {
    body: { orgCode, countryId, mobileNo },
  });

  return { response, code: sentCodes.get(mobileNo) as string };
};

export const verify = async (
  mobileNo: string,
  otp: string,
  orgCode = "ORGA",
  countryId = country.in,
) =>
  api("POST", "/auth/verify-otp", {
    body: { orgCode, countryId, mobileNo, otp },
  });

// Clears the resend cooldown so a test can request a second code immediately.
export const skipCooldown = async () => {
  await prisma.register_otp.updateMany({
    data: { created_at: new Date(Date.now() - 2 * 60 * 1000) },
  });
};

export const registerUser = async (
  options: { orgCode?: string; firstName?: string; mobileNo?: string } = {},
) => {
  const mobileNo = options.mobileNo ?? nextPhone();
  const orgCode = options.orgCode ?? "ORGA";
  const { code } = await requestOtp(mobileNo, orgCode);
  const verified = await verify(mobileNo, code, orgCode);
  const profile = await api("POST", "/user/profile", {
    token: verified.json.data.token,
    body: { firstName: options.firstName ?? "Test" },
  });

  return {
    mobileNo,
    token: profile.json.data.token as string,
    refreshToken: profile.json.data.refreshToken as string,
    sessionId: profile.json.data.sessionId as string,
    userId: profile.json.data.userId as string,
    userOrganizationId: profile.json.data.userOrganizationId as string,
  };
};

export const loginAgain = async (mobileNo: string, orgCode = "ORGA") => {
  await skipCooldown();
  const { code } = await requestOtp(mobileNo, orgCode);
  return verify(mobileNo, code, orgCode);
};

export const setupHarness = () => {
  let server: http.Server;

  before(async () => {
    // Last line of defence before any table is emptied: the connection the
    // app actually uses must point at a disposable *_test database.
    const [{ db }] = await prisma.$queryRaw<{ db: string }[]>`SELECT DATABASE() AS db`;
    if (!db?.endsWith("_test")) {
      throw new Error(`Refusing to run tests against database "${db}"`);
    }

    setSmsProvider({
      name: "test",
      send: async (toE164, body) => {
        const code = /\d{6}/.exec(body)?.[0] as string;
        sentCodes.set(toE164.replace(/^\+1/, "").replace(/^\+91/, ""), code);
      },
    });

    server = http.createServer(app);
    initializeSocket(server);
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  beforeEach(async () => {
    sentCodes.clear();
    await prisma.user_master.updateMany({ data: { profile_photo_media_id: null } });
    await prisma.call_session.deleteMany();
    await prisma.community.deleteMany();
    await prisma.channel.deleteMany();
    await prisma.status_post.deleteMany();
    await prisma.wp_group.deleteMany();
    await prisma.org_broadcast.deleteMany();
    await prisma.organization_audit_log.deleteMany();
    await prisma.organization_join_request.deleteMany();
    await prisma.organization_invite.deleteMany();
    await prisma.organization_relationship.deleteMany();
    await prisma.user_report.deleteMany();
    await prisma.user_block.deleteMany();
    await prisma.conversation_state.deleteMany();
    await prisma.user_device.deleteMany();
    await prisma.user_session.deleteMany();
    await prisma.personal_chat_history.deleteMany();
    await prisma.user_setting.deleteMany();
    await prisma.user_organization.deleteMany();
    await prisma.user_master.deleteMany();
    await prisma.register_otp.deleteMany();
    await prisma.organization_master.deleteMany();
    await prisma.country_master.deleteMany();

    const india = await prisma.country_master.create({
      data: { country_name: "India", country_code: "+91", iso_code: "IN" },
    });
    const us = await prisma.country_master.create({
      data: { country_name: "United States", country_code: "+1", iso_code: "US" },
    });
    country = { in: india.country_id.toString(), us: us.country_id.toString() };

    // Organization IDs are pushed away from small user IDs, so a test fails if
    // a user ID is ever confused with an organization ID.
    const orgA = await prisma.organization_master.create({
      data: { org_code: "ORGA", organization_name: "Org A" },
    });
    const orgB = await prisma.organization_master.create({
      data: { org_code: "ORGB", organization_name: "Org B" },
    });
    org = { a: orgA.org_id, b: orgB.org_id };

    // Open joining, so tests about other features can register freely. The
    // approval flow has its own tests, which switch it back on.
    await prisma.organization_setting.createMany({
      data: [
        { org_id: orgA.org_id, join_mode: "OPEN" },
        { org_id: orgB.org_id, join_mode: "OPEN" },
      ],
    });
  });

  after(async () => {
    (await import("../../src/socket/socket.server.js")).getIO().close();
    await new Promise((resolve) => server.close(resolve));
    await prisma.$disconnect();
  });
};
