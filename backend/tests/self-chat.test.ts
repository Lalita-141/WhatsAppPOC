import "./helpers/test-env.js";
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { io as connect, Socket } from "socket.io-client";
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

const connected = (token: string) =>
  new Promise<Socket>((resolve, reject) => {
    const socket = connect(baseUrl, {
      transports: ["websocket"],
      auth: { token },
      reconnection: false,
      forceNew: true,
    });
    openSockets.push(socket);
    socket.once("connect", () => resolve(socket));
    socket.once("connect_error", reject);
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

const list = async (token: string) => {
  const { json } = await api("GET", "/chat/conversations", { token });
  return json.data.conversations as any[];
};

const SELF_ROW = (id: string) => ({
  owner_user_organization_id: BigInt(id),
  peer_user_organization_id: BigInt(id),
});

describe("self-chat", () => {
  it("lists exactly one empty self-chat right after registration", async () => {
    const user = await registerUser();
    const conversations = await list(user.token);

    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].isSelf, true);
    assert.equal(conversations[0].userOrganizationId, user.userOrganizationId);
    assert.equal(conversations[0].lastMessage, null);
    assert.equal(conversations[0].unreadCount, 0);
  });

  it("refuses a second self-chat row at the database level", async () => {
    const user = await registerUser();

    await assert.rejects(
      prisma.conversation_state.create({ data: SELF_ROW(user.userOrganizationId) }),
    );
  });

  it("stores one row, marks it read and acknowledges only the sending socket", async () => {
    const user = await registerUser();
    const socket = await connected(user.token);

    const sent = nextEvent(socket, "message:sent");
    const noEcho = receivesNothing(socket, "message:new");
    socket.emit("message:send", {
      receiverUserOrganizationId: user.userOrganizationId,
      message: "  buy milk  ",
    });

    const message = await sent;
    await noEcho;

    assert.equal(message.message, "buy milk");
    assert.equal(message.status, "SEEN");

    const rows = await prisma.personal_chat_history.findMany({
      where: { sender_user_organization_id: BigInt(user.userOrganizationId) },
    });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].receiver_user_organization_id, rows[0].sender_user_organization_id);
    assert.ok(rows[0].receive_time);

    const state = await prisma.conversation_state.findFirstOrThrow({
      where: SELF_ROW(user.userOrganizationId),
    });
    assert.equal(state.last_message_id, rows[0].chat_id);
  });

  it("syncs to the user's other devices, not to anyone else", async () => {
    const user = await registerUser();
    const other = await registerUser();
    const phone = await connected(user.token);
    const tablet = await connected(user.token);
    const stranger = await connected(other.token);

    const synced = nextEvent(tablet, "message:new");
    const strangerSilent = receivesNothing(stranger, "message:new");
    phone.emit("message:send", {
      receiverUserOrganizationId: user.userOrganizationId,
      message: "note",
    });

    assert.equal((await synced).message, "note");
    await strangerSilent;
  });

  it("does not fire receipts for self messages", async () => {
    const user = await registerUser();
    const socket = await connected(user.token);

    const sent = nextEvent(socket, "message:sent");
    socket.emit("message:send", {
      receiverUserOrganizationId: user.userOrganizationId,
      message: "note",
    });
    const { messageId } = await sent;

    const silentDelivered = receivesNothing(socket, "message:delivered");
    const silentRead = receivesNothing(socket, "message:read");
    socket.emit("message:delivered", { messageId });
    socket.emit("message:read", { otherUserOrganizationId: user.userOrganizationId });
    await Promise.all([silentDelivered, silentRead]);

    const row = await prisma.personal_chat_history.findUniqueOrThrow({
      where: { chat_id: BigInt(messageId) },
    });
    assert.equal(row.status, "SEEN");
  });

  it("does not relay own typing back to the user", async () => {
    const user = await registerUser();
    const phone = await connected(user.token);
    const tablet = await connected(user.token);

    const silent = receivesNothing(tablet, "typing:start");
    phone.emit("typing:start", { receiverUserOrganizationId: user.userOrganizationId });
    await silent;
  });

  it("sends push for a normal message but not for a self message", async () => {
    const user = await registerUser();
    const friend = await registerUser();
    const socket = await connected(user.token);
    const pushAttempts: string[] = [];
    const record = (text: unknown) => {
      if (String(text).startsWith("[PushNotification]")) {
        pushAttempts.push(String(text));
      }
    };
    const log = mock.method(console, "log", record);
    const warn = mock.method(console, "warn", record);

    const send = async (receiverUserOrganizationId: string) => {
      const sent = nextEvent(socket, "message:sent");
      socket.emit("message:send", { receiverUserOrganizationId, message: "note" });
      await sent;
      await new Promise((resolve) => setTimeout(resolve, 150));
    };

    try {
      await send(user.userOrganizationId);
      assert.equal(pushAttempts.length, 0);

      // Control: proves this check would notice a push attempt.
      await send(friend.userOrganizationId);
      assert.equal(pushAttempts.length, 1);
    } finally {
      log.mock.restore();
      warn.mock.restore();
    }
  });

  it("shows history to its owner, and another user cannot read it", async () => {
    const user = await registerUser();
    const other = await registerUser();
    const socket = await connected(user.token);

    const sent = nextEvent(socket, "message:sent");
    socket.emit("message:send", {
      receiverUserOrganizationId: user.userOrganizationId,
      message: "private note",
    });
    await sent;

    const own = await api(
      "GET",
      `/chat/personal/${user.userOrganizationId}/messages`,
      { token: user.token },
    );
    assert.equal(own.status, 200);
    assert.equal(own.json.data.messages.length, 1);
    assert.equal(own.json.data.messages[0].isMine, true);

    const foreign = await api(
      "GET",
      `/chat/personal/${user.userOrganizationId}/messages`,
      { token: other.token },
    );
    assert.equal(foreign.status, 200);
    assert.equal(foreign.json.data.messages.length, 0);

    const otherList = await list(other.token);
    assert.equal(otherList.length, 1);
    assert.equal(otherList[0].userOrganizationId, other.userOrganizationId);
    assert.equal(otherList[0].lastMessage, null);
  });

  it("keeps self-chats separate between organizations", async () => {
    const user = await registerUser();
    const socket = await connected(user.token);

    const sent = nextEvent(socket, "message:sent");
    socket.emit("message:send", {
      receiverUserOrganizationId: user.userOrganizationId,
      message: "org A note",
    });
    await sent;

    const setup = await loginAgain(user.mobileNo, "ORGB");
    const joined = await api("POST", "/organization/setup", {
      token: setup.json.data.token,
      body: { orgCode: "ORGB" },
    });
    assert.equal(joined.status, 201);
    assert.notEqual(joined.json.data.userOrganizationId, user.userOrganizationId);

    const conversations = await list(joined.json.data.token);
    assert.equal(conversations.length, 1);
    assert.equal(conversations[0].isSelf, true);
    assert.equal(conversations[0].userOrganizationId, joined.json.data.userOrganizationId);
    assert.equal(conversations[0].lastMessage, null);
  });
});
