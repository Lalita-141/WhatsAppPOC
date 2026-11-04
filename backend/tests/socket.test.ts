import "./helpers/test-env.js";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { io as connect, Socket } from "socket.io-client";
import { toSocketError } from "../src/socket/socket.server.js";
import {
  api,
  baseUrl,
  loginAgain,
  prisma,
  registerUser,
  setupHarness,
} from "./helpers/harness.js";

setupHarness();

const openSockets: Socket[] = [];

afterEach(() => {
  openSockets.splice(0).forEach((socket) => socket.disconnect());
});

const open = (token?: string) => {
  const socket = connect(baseUrl, {
    transports: ["websocket"],
    auth: token ? { token } : {},
    reconnection: false,
    forceNew: true,
  });
  openSockets.push(socket);
  return socket;
};

const connected = (token: string) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = open(token);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
  });

const refused = (token?: string) =>
  new Promise<string>((resolve, reject) => {
    const socket = open(token);
    socket.once("connect", () => reject(new Error("Socket should be refused")));
    socket.once("connect_error", (error) => resolve(error.message));
  });

const nextEvent = <T = any>(socket: Socket, event: string, ms = 2000) =>
  new Promise<T>((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for ${event}`)),
      ms,
    );
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

describe("socket authentication", () => {
  it("refuses missing, invalid and setup tokens", async () => {
    assert.match(await refused(), /required/);
    assert.equal(await refused("garbage"), "INVALID_TOKEN");

    const user = await registerUser();
    const setup = await loginAgain(user.mobileNo, "ORGB");
    assert.ok(await refused(setup.json.data.token));
  });

  it("refuses a revoked session", async () => {
    const user = await registerUser();
    await api("POST", "/auth/logout", { token: user.token });

    assert.equal(await refused(user.token), "SESSION_REVOKED");
  });

  it("closes a live socket when its session is revoked", async () => {
    const user = await registerUser();
    const socket = await connected(user.token);
    const closed = nextEvent(socket, "disconnect");

    await api("POST", "/auth/logout", { token: user.token });

    assert.equal(await closed, "io server disconnect");
  });

  it("logout-all closes sockets on every device, but not other users", async () => {
    const user = await registerUser();
    const other = await registerUser();
    const second = await loginAgain(user.mobileNo);

    const socketA = await connected(user.token);
    const socketB = await connected(second.json.data.token);
    const bystander = await connected(other.token);
    const closedA = nextEvent(socketA, "disconnect");
    const closedB = nextEvent(socketB, "disconnect");

    await api("POST", "/auth/logout-all", { token: user.token });

    await Promise.all([closedA, closedB]);
    assert.equal(bystander.connected, true);
  });
});

describe("socket messaging", () => {
  it("delivers a same-organization message and its status", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const aliceSocket = await connected(alice.token);
    const bobSocket = await connected(bob.token);

    const sent = nextEvent(aliceSocket, "message:sent");
    const received = nextEvent(bobSocket, "message:new");
    aliceSocket.emit("message:send", {
      receiverUserOrganizationId: bob.userOrganizationId,
      message: "hello",
    });

    assert.equal((await sent).message, "hello");
    const message = await received;
    assert.equal(message.senderUserOrganizationId, alice.userOrganizationId);

    const delivered = nextEvent(aliceSocket, "message:delivered");
    bobSocket.emit("message:delivered", { messageId: message.messageId });
    assert.equal((await delivered).status, "DELIVERED");

    const read = nextEvent(aliceSocket, "message:read");
    bobSocket.emit("message:read", {
      otherUserOrganizationId: alice.userOrganizationId,
    });
    assert.deepEqual((await read).messageIds, [message.messageId]);
  });

  it("blocks cross-organization messages", async () => {
    const alice = await registerUser();
    const outsider = await registerUser({ orgCode: "ORGB" });
    const aliceSocket = await connected(alice.token);
    const outsiderSocket = await connected(outsider.token);

    const error = nextEvent(aliceSocket, "message:error");
    const nothing = receivesNothing(outsiderSocket, "message:new");
    aliceSocket.emit("message:send", {
      receiverUserOrganizationId: outsider.userOrganizationId,
      message: "hello",
    });

    // Same answer as for a missing user, so it does not reveal who exists.
    assert.equal((await error).errorCode, "CANNOT_MESSAGE");
    await nothing;
    assert.equal(await prisma.personal_chat_history.count(), 0);
  });

  it("rejects invalid payloads without saving them", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const socket = await connected(alice.token);

    const cases: [unknown, string][] = [
      [{ receiverUserOrganizationId: bob.userOrganizationId, message: "x".repeat(5001) }, "INVALID_MESSAGE"],
      [{ receiverUserOrganizationId: bob.userOrganizationId, message: { $ne: 1 } }, "INVALID_MESSAGE"],
      [{ receiverUserOrganizationId: bob.userOrganizationId, message: "x", media: { url: "http://evil" } }, "MEDIA_NOT_SUPPORTED"],
      [{ receiverUserOrganizationId: "0x10", message: "x" }, "INVALID_RECEIVER"],
      [{ receiverUserOrganizationId: "1 OR 1=1", message: "x" }, "INVALID_RECEIVER"],
    ];

    for (const [payload, errorCode] of cases) {
      const error = nextEvent(socket, "message:error");
      socket.emit("message:send", payload);
      assert.equal((await error).errorCode, errorCode);
    }

    assert.equal(await prisma.personal_chat_history.count(), 0);
  });

  it("cannot mark someone else's message as delivered", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const mallory = await registerUser();
    const aliceSocket = await connected(alice.token);
    const malloryFeed = await connected(mallory.token);

    const sent = nextEvent(aliceSocket, "message:sent");
    aliceSocket.emit("message:send", {
      receiverUserOrganizationId: bob.userOrganizationId,
      message: "private",
    });
    const { messageId } = await sent;

    // Ignored without saying whether the message exists.
    const aliceHearsNothing = receivesNothing(aliceSocket, "message:delivered");
    malloryFeed.emit("message:delivered", { messageId });
    await aliceHearsNothing;

    const row = await prisma.personal_chat_history.findFirstOrThrow();
    assert.equal(row.status, "SENT");
  });

  it("does not return internal errors to the client", async () => {
    const alice = await registerUser();
    const socket = await connected(alice.token);

    const error = nextEvent(socket, "message:error");
    socket.emit("message:send", {
      // Larger than any BIGINT: must not surface a database error.
      receiverUserOrganizationId: "99999999999999999999",
      message: "x",
    });

    const payload = await error;
    assert.equal(payload.errorCode, "CANNOT_MESSAGE");
    assert.equal(/prisma|sql|bigint/i.test(payload.message), false);

    assert.deepEqual(
      toSocketError(new Error("Prisma: table secret missing"), "CODE", "Safe"),
      { errorCode: "CODE", message: "Safe" },
    );
  });

  it("limits message floods", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const socket = await connected(alice.token);

    const limited = nextEvent(socket, "message:error", 5000);
    for (let index = 0; index < 31; index += 1) {
      socket.emit("message:send", {
        receiverUserOrganizationId: bob.userOrganizationId,
        message: `m${index}`,
      });
    }

    assert.equal((await limited).errorCode, "RATE_LIMITED");
  });
});

describe("socket presence and typing", () => {
  it("shows presence inside the organization", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const aliceSocket = await connected(alice.token);
    await connected(bob.token);

    const status = nextEvent(aliceSocket, "presence:status");
    aliceSocket.emit("presence:get", {
      targetUserOrganizationId: bob.userOrganizationId,
    });

    assert.equal((await status).isOnline, true);
  });

  it("hides presence and last seen across organizations", async () => {
    const alice = await registerUser();
    const outsider = await registerUser({ orgCode: "ORGB" });
    await prisma.user_master.update({
      where: { user_id: BigInt(outsider.userId) },
      data: { last_seen: new Date() },
    });
    const aliceSocket = await connected(alice.token);
    await connected(outsider.token);

    const status = nextEvent(aliceSocket, "presence:status");
    aliceSocket.emit("presence:get", {
      targetUserOrganizationId: outsider.userOrganizationId,
    });

    const result = await status;
    assert.equal(result.isOnline, false);
    assert.equal(result.lastSeen, null);
  });

  it("honors the last-seen privacy setting", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const aliceSocket = await connected(alice.token);
    await connected(bob.token);
    const bobId = BigInt(bob.userOrganizationId);

    const ask = async () => {
      const status = nextEvent(aliceSocket, "presence:status");
      aliceSocket.emit("presence:get", {
        targetUserOrganizationId: bob.userOrganizationId,
      });
      return (await status).isOnline;
    };

    await prisma.user_setting.update({
      where: { user_organization_id: bobId },
      data: { last_seen_privacy: "NOBODY" },
    });
    assert.equal(await ask(), false);

    await prisma.user_setting.update({
      where: { user_organization_id: bobId },
      data: { last_seen_privacy: "CONTACTS" },
    });
    assert.equal(await ask(), false);

    await prisma.personal_chat_history.create({
      data: {
        sender_user_organization_id: BigInt(alice.userOrganizationId),
        receiver_user_organization_id: bobId,
        message: "hi",
      },
    });
    assert.equal(await ask(), true);
  });

  it("does not broadcast presence for someone hiding it", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await prisma.user_setting.update({
      where: { user_organization_id: BigInt(bob.userOrganizationId) },
      data: { last_seen_privacy: "NOBODY" },
    });
    const aliceSocket = await connected(alice.token);

    const seen: string[] = [];
    aliceSocket.on("presence:update", (update) => {
      seen.push(update.userOrganizationId);
    });

    const bobSocket = await connected(bob.token);
    bobSocket.disconnect();
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.equal(seen.includes(bob.userOrganizationId), false);
  });

  it("relays typing only inside the organization", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const outsider = await registerUser({ orgCode: "ORGB" });
    const aliceSocket = await connected(alice.token);
    const bobSocket = await connected(bob.token);
    const outsiderSocket = await connected(outsider.token);

    const typing = nextEvent(bobSocket, "typing:start");
    aliceSocket.emit("typing:start", {
      receiverUserOrganizationId: bob.userOrganizationId,
    });
    assert.equal((await typing).senderUserOrganizationId, alice.userOrganizationId);

    const nothing = receivesNothing(outsiderSocket, "typing:start");
    aliceSocket.emit("typing:start", {
      receiverUserOrganizationId: outsider.userOrganizationId,
    });
    await nothing;
  });
});
