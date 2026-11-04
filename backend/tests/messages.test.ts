import "./helpers/test-env.js";
import assert from "node:assert/strict";
import { afterEach, describe, it, mock } from "node:test";
import { io as connect, Socket } from "socket.io-client";
import { api, baseUrl, prisma, registerUser, setupHarness } from "./helpers/harness.js";

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

const send = async (from: User, to: User, message: string, extra: Record<string, unknown> = {}) => {
  const { status, json } = await api("POST", "/chat/personal-chat/send", {
    token: from.token,
    body: { receiverUserOrganizationId: to.userOrganizationId, message, ...extra },
  });
  assert.ok(status === 201 || status === 200, JSON.stringify(json));
  return json.data;
};

const history = async (viewer: User, peer: User) =>
  (await api("GET", `/chat/personal/${peer.userOrganizationId}/messages`, { token: viewer.token })).json.data.messages;

const conversations = async (viewer: User, query = "") =>
  (await api("GET", `/chat/conversations${query}`, { token: viewer.token })).json.data;

describe("sending", () => {
  it("stores a retried send once and acknowledges the client ID", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const socket = await connected(alice.token);

    for (let attempt = 0; attempt < 2; attempt++) {
      const ack = nextEvent(socket, "message:sent");
      socket.emit("message:send", {
        receiverUserOrganizationId: bob.userOrganizationId,
        message: "hello",
        clientMessageId: "client-msg-0001",
      });
      assert.equal((await ack).clientMessageId, "client-msg-0001");
    }

    assert.equal(await prisma.personal_chat_history.count(), 1);
  });

  it("returns a failed send's client ID so the app can offer retry", async () => {
    const alice = await registerUser();
    const outsider = await registerUser({ orgCode: "ORGB" });
    const socket = await connected(alice.token);

    const error = nextEvent(socket, "message:error");
    socket.emit("message:send", {
      receiverUserOrganizationId: outsider.userOrganizationId,
      message: "hi",
      clientMessageId: "client-msg-0002",
    });

    assert.equal((await error).clientMessageId, "client-msg-0002");
  });

  it("shows a sent message on the sender's other devices", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const phone = await connected(alice.token);
    const laptop = await connected(alice.token);

    const mirrored = nextEvent(laptop, "message:new");
    phone.emit("message:send", { receiverUserOrganizationId: bob.userOrganizationId, message: "from phone" });

    const message = await mirrored;
    assert.equal(message.isMine, true);
    assert.equal(message.message, "from phone");
  });

  it("only allows replies to a message in the same chat", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const carol = await registerUser();
    const original = await send(bob, alice, "question?");
    const elsewhere = await send(carol, alice, "other chat");

    const reply = await send(alice, bob, "answer", { replyToMessageId: original.messageId });
    assert.equal(reply.replyTo.messageId, original.messageId);
    assert.equal(reply.replyTo.message, "question?");

    const { status } = await api("POST", "/chat/personal-chat/send", {
      token: alice.token,
      body: { receiverUserOrganizationId: bob.userOrganizationId, message: "x", replyToMessageId: elsewhere.messageId },
    });
    assert.equal(status, 400);
  });

  it("catches up an offline device and marks a batch delivered", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const first = await send(alice, bob, "one");
    await send(alice, bob, "two");

    const { json } = await api("GET", `/chat/sync?after=${BigInt(first.messageId) - 1n}`, { token: bob.token });
    assert.deepEqual(json.data.messages.map((m: any) => m.message), ["one", "two"]);

    const aliceSocket = await connected(alice.token);
    const bobSocket = await connected(bob.token);
    const ticks: string[] = [];
    aliceSocket.on("message:delivered", (payload) => ticks.push(payload.messageId));
    bobSocket.emit("message:delivered", { messageIds: json.data.messages.map((m: any) => m.messageId) });
    await new Promise((resolve) => setTimeout(resolve, 300));

    assert.equal(ticks.length, 2);
    assert.equal(await prisma.personal_chat_history.count({ where: { status: "DELIVERED" } }), 2);
  });
});

describe("editing and deleting", () => {
  it("lets only the sender edit, within 15 minutes", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const message = await send(alice, bob, "teh");

    const byBob = await api("PATCH", `/chat/messages/${message.messageId}`, { token: bob.token, body: { message: "x" } });
    assert.equal(byBob.status, 403);

    const edited = await api("PATCH", `/chat/messages/${message.messageId}`, { token: alice.token, body: { message: "the" } });
    assert.equal(edited.status, 200);
    assert.equal(edited.json.data.message, "the");
    assert.ok(edited.json.data.editedAt);

    await prisma.personal_chat_history.update({
      where: { chat_id: BigInt(message.messageId) },
      data: { send_time: new Date(Date.now() - 16 * 60 * 1000) },
    });
    const late = await api("PATCH", `/chat/messages/${message.messageId}`, { token: alice.token, body: { message: "late" } });
    assert.equal(late.json.errorCode, "EDIT_WINDOW_PASSED");
  });

  it("deletes for me without affecting the other person", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const message = await send(alice, bob, "oops");

    const { status } = await api("DELETE", `/chat/messages/${message.messageId}?scope=me`, { token: bob.token });
    assert.equal(status, 200);

    assert.equal((await history(bob, alice)).length, 0);
    assert.equal((await history(alice, bob)).length, 1);
  });

  it("deletes for everyone: sender only, content gone, live update to both", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const message = await send(alice, bob, "secret");
    const bobSocket = await connected(bob.token);

    const byBob = await api("DELETE", `/chat/messages/${message.messageId}?scope=everyone`, { token: bob.token });
    assert.equal(byBob.status, 403);

    const update = nextEvent(bobSocket, "message:updated");
    await api("DELETE", `/chat/messages/${message.messageId}?scope=everyone`, { token: alice.token });

    const { reason, message: dto } = await update;
    assert.equal(reason, "deleted");
    assert.equal(dto.isDeleted, true);
    assert.equal(dto.message, null);

    const row = await prisma.personal_chat_history.findUniqueOrThrow({ where: { chat_id: BigInt(message.messageId) } });
    assert.equal(row.message, null);
  });

  it("cannot touch a message in someone else's chat", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const mallory = await registerUser();
    const message = await send(alice, bob, "private");

    for (const [method, path, body] of [
      ["DELETE", `/chat/messages/${message.messageId}?scope=me`, undefined],
      ["PUT", `/chat/messages/${message.messageId}/reaction`, { emoji: "👍" }],
      ["PUT", `/chat/messages/${message.messageId}/star`, undefined],
      ["PUT", `/chat/messages/${message.messageId}/pin`, undefined],
      ["POST", `/chat/messages/${message.messageId}/forward`, { receiverUserOrganizationIds: [mallory.userOrganizationId] }],
    ] as const) {
      const { status } = await api(method, path, { token: mallory.token, body });
      assert.equal(status, 404, `${method} ${path}`);
    }
  });
});

describe("reactions, stars, pins and forwarding", () => {
  it("keeps one reaction per person and accepts emoji only", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const message = await send(alice, bob, "nice");

    await api("PUT", `/chat/messages/${message.messageId}/reaction`, { token: bob.token, body: { emoji: "👍" } });
    const changed = await api("PUT", `/chat/messages/${message.messageId}/reaction`, { token: bob.token, body: { emoji: "❤️" } });
    assert.deepEqual(changed.json.data.reactions.map((r: any) => r.emoji), ["❤️"]);

    const text = await api("PUT", `/chat/messages/${message.messageId}/reaction`, { token: bob.token, body: { emoji: "lol" } });
    assert.equal(text.status, 400);

    await api("DELETE", `/chat/messages/${message.messageId}/reaction`, { token: bob.token });
    assert.equal(await prisma.message_reaction.count(), 0);
  });

  it("stars privately and lists starred messages", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const message = await send(alice, bob, "keep this");

    await api("PUT", `/chat/messages/${message.messageId}/star`, { token: bob.token });

    const bobStarred = await api("GET", "/chat/starred", { token: bob.token });
    assert.deepEqual(bobStarred.json.data.messages.map((m: any) => m.message), ["keep this"]);
    const aliceStarred = await api("GET", "/chat/starred", { token: alice.token });
    assert.equal(aliceStarred.json.data.messages.length, 0);
  });

  it("allows three pinned messages per chat", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const ids = [];
    for (const text of ["a", "b", "c", "d"]) ids.push((await send(alice, bob, text)).messageId);

    for (const id of ids.slice(0, 3)) {
      assert.equal((await api("PUT", `/chat/messages/${id}/pin`, { token: bob.token })).status, 200);
    }
    const fourth = await api("PUT", `/chat/messages/${ids[3]}/pin`, { token: alice.token });
    assert.equal(fourth.json.errorCode, "PIN_LIMIT");

    const pinnedList = await api("GET", `/chat/personal/${bob.userOrganizationId}/pinned`, { token: alice.token });
    assert.equal(pinnedList.json.data.length, 3);
  });

  it("forwards to several chats, marked as forwarded, and refuses unreachable ones", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const carol = await registerUser();
    const outsider = await registerUser({ orgCode: "ORGB" });
    const message = await send(bob, alice, "share me");

    const refused = await api("POST", `/chat/messages/${message.messageId}/forward`, {
      token: alice.token,
      body: { receiverUserOrganizationIds: [carol.userOrganizationId, outsider.userOrganizationId] },
    });
    assert.equal(refused.status, 403);
    assert.equal(await prisma.personal_chat_history.count(), 1);

    const ok = await api("POST", `/chat/messages/${message.messageId}/forward`, {
      token: alice.token,
      body: { receiverUserOrganizationIds: [carol.userOrganizationId, alice.userOrganizationId] },
    });
    assert.equal(ok.status, 201);
    assert.ok(ok.json.data.every((m: any) => m.forwarded && m.message === "share me"));
  });
});

describe("search", () => {
  it("finds visible messages in the caller's chats only", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const carol = await registerUser();
    await send(alice, bob, "Project Falcon kickoff");
    const hidden = await send(bob, alice, "falcon budget");
    await send(carol, bob, "falcon is secret from alice");
    await api("DELETE", `/chat/messages/${hidden.messageId}?scope=me`, { token: alice.token });

    const { json } = await api("GET", "/chat/search?q=falcon", { token: alice.token });
    assert.deepEqual(json.data.messages.map((m: any) => m.message), ["Project Falcon kickoff"]);

    const wildcard = await api("GET", "/chat/search?q=%25%25", { token: alice.token });
    assert.equal(wildcard.json.data.messages.length, 0);

    const short = await api("GET", "/chat/search?q=a", { token: alice.token });
    assert.equal(short.status, 400);
  });
});

describe("conversations", () => {
  it("counts unread per chat and clears it on read", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await send(alice, bob, "1");
    await send(alice, bob, "2");

    const before = await conversations(bob);
    const row = before.conversations.find((c: any) => c.userOrganizationId === alice.userOrganizationId);
    assert.equal(row.unreadCount, 2);
    assert.equal(row.lastMessage.message, "2");

    const bobSocket = await connected(bob.token);
    bobSocket.emit("message:read", { otherUserOrganizationId: alice.userOrganizationId });
    await new Promise((resolve) => setTimeout(resolve, 300));

    const after = await conversations(bob);
    assert.equal(after.conversations.find((c: any) => c.userOrganizationId === alice.userOrganizationId).unreadCount, 0);
  });

  it("pages by newest message without repeating chats", async () => {
    const alice = await registerUser();
    const peers = [];
    for (let i = 0; i < 3; i++) {
      const peer = await registerUser();
      await send(peer, alice, `hi ${i}`);
      peers.push(peer);
    }

    const first = await conversations(alice, "?limit=2");
    const second = await conversations(alice, `?limit=2&cursor=${first.pagination.nextCursor}`);
    const names = [...first.conversations, ...second.conversations]
      .filter((c: any) => !c.isSelf)
      .map((c: any) => c.lastMessage.message);

    assert.deepEqual(names, ["hi 2", "hi 1", "hi 0"]);
    assert.equal(second.pagination.hasMore, false);
  });

  it("pins, archives and mutes for the owner only", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await send(bob, alice, "hello");

    const pinnedState = await api("PATCH", `/chat/conversations/${bob.userOrganizationId}`, {
      token: alice.token,
      body: { pinned: true, muted: "8h" },
    });
    assert.equal(pinnedState.json.data.isPinned, true);
    assert.ok(pinnedState.json.data.mutedUntil);

    await api("PATCH", `/chat/conversations/${bob.userOrganizationId}`, { token: alice.token, body: { archived: true } });
    const main = await conversations(alice);
    assert.equal(main.conversations.some((c: any) => c.userOrganizationId === bob.userOrganizationId), false);
    const archived = await conversations(alice, "?archived=true");
    assert.equal(archived.conversations[0].isPinned, false);

    const bobView = await conversations(bob);
    const row = bobView.conversations.find((c: any) => c.userOrganizationId === alice.userOrganizationId);
    assert.equal(row.isArchived, false);
    assert.equal(row.mutedUntil, null);

    const bad = await api("PATCH", `/chat/conversations/${bob.userOrganizationId}`, { token: alice.token, body: { muted: "1y" } });
    assert.equal(bad.status, 400);
  });

  it("does not send push for a muted chat", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await api("PATCH", `/chat/conversations/${alice.userOrganizationId}`, { token: bob.token, body: { muted: "forever" } });

    const attempts: string[] = [];
    const record = (text: unknown) => {
      if (String(text).startsWith("[PushNotification]")) attempts.push(String(text));
    };
    const log = mock.method(console, "log", record);
    const warn = mock.method(console, "warn", record);
    try {
      await send(alice, bob, "quiet");
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(attempts.length, 0);

      // Control: an unmuted chat does try to push.
      await send(bob, alice, "loud");
      await new Promise((resolve) => setTimeout(resolve, 150));
      assert.equal(attempts.length, 1);
    } finally {
      log.mock.restore();
      warn.mock.restore();
    }
  });
});

describe("privacy", () => {
  it("shows delivered instead of seen when the reader has read receipts off", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await api("PUT", "/user/settings/privacy", { token: bob.token, body: { readReceipts: false } });
    await send(alice, bob, "did you read this?");
    const aliceSocket = await connected(alice.token);
    const bobSocket = await connected(bob.token);

    const noTicks = receivesNothing(aliceSocket, "message:read");
    bobSocket.emit("message:read", { otherUserOrganizationId: alice.userOrganizationId });
    await noTicks;

    const [message] = await history(alice, bob);
    assert.equal(message.status, "DELIVERED");
    assert.equal(message.readTime, null);
    assert.equal(await prisma.personal_chat_history.count({ where: { status: "SEEN" } }), 1);
  });

  it("does not relay typing when the typist turned it off", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await api("PUT", "/user/settings/privacy", { token: alice.token, body: { typingIndicator: false } });
    const aliceSocket = await connected(alice.token);
    const bobSocket = await connected(bob.token);

    const silent = receivesNothing(bobSocket, "typing:start");
    aliceSocket.emit("typing:start", { receiverUserOrganizationId: bob.userOrganizationId });
    await silent;
  });
});

describe("blocking and reporting", () => {
  it("stops messages both ways without telling the blocked person", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await api("POST", "/user/blocks", { token: alice.token, body: { userOrganizationId: bob.userOrganizationId } });

    const fromBob = await api("POST", "/chat/personal-chat/send", {
      token: bob.token,
      body: { receiverUserOrganizationId: alice.userOrganizationId, message: "hi" },
    });
    assert.equal(fromBob.json.errorCode, "CANNOT_MESSAGE");

    const fromAlice = await api("POST", "/chat/personal-chat/send", {
      token: alice.token,
      body: { receiverUserOrganizationId: bob.userOrganizationId, message: "hi" },
    });
    assert.equal(fromAlice.json.errorCode, "USER_BLOCKED");

    const list = await api("GET", "/user/blocks", { token: alice.token });
    assert.equal(list.json.data[0].userOrganizationId, bob.userOrganizationId);

    await api("DELETE", `/user/blocks/${bob.userOrganizationId}`, { token: alice.token });
    await send(bob, alice, "hi again");
  });

  it("hides presence and typing between blocked people", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    await api("POST", "/user/blocks", { token: bob.token, body: { userOrganizationId: alice.userOrganizationId } });
    const aliceSocket = await connected(alice.token);
    const bobSocket = await connected(bob.token);

    const status = nextEvent(aliceSocket, "presence:status");
    aliceSocket.emit("presence:get", { targetUserOrganizationId: bob.userOrganizationId });
    assert.equal((await status).isOnline, false);

    const silent = receivesNothing(bobSocket, "typing:start");
    aliceSocket.emit("typing:start", { receiverUserOrganizationId: bob.userOrganizationId });
    await silent;
  });

  it("files a report, optionally blocks, and only for messages in that chat", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const carol = await registerUser();
    const spam = await send(bob, alice, "buy now");
    const other = await send(carol, bob, "unrelated");

    const bad = await api("POST", "/user/reports", {
      token: alice.token,
      body: { userOrganizationId: bob.userOrganizationId, reason: "SPAM", messageId: other.messageId },
    });
    assert.equal(bad.status, 400);

    const ok = await api("POST", "/user/reports", {
      token: alice.token,
      body: { userOrganizationId: bob.userOrganizationId, reason: "SPAM", messageId: spam.messageId, block: true },
    });
    assert.equal(ok.status, 201);
    assert.equal(ok.json.data.blocked, true);
    assert.equal(await prisma.user_report.count(), 1);
    assert.equal(await prisma.user_block.count(), 1);

    const invalidReason = await api("POST", "/user/reports", {
      token: alice.token,
      body: { userOrganizationId: bob.userOrganizationId, reason: "BORING" },
    });
    assert.equal(invalidReason.status, 400);
  });
});
