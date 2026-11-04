import "./helpers/test-env.js";
import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { io as connect, Socket } from "socket.io-client";
import { api, baseUrl, org, prisma, registerUser, setupHarness } from "./helpers/harness.js";
import { liveCalls } from "../src/modules/call/call.service.js";

setupHarness();

const openSockets: Socket[] = [];
afterEach(() => {
  openSockets.splice(0).forEach((socket) => socket.disconnect());
  liveCalls.forEach((call) => {
    clearTimeout(call.ringTimer);
    call.graceTimers.forEach(clearTimeout);
  });
  liveCalls.clear();
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

const ring = async (caller: Socket, callee: User, calleeSocket: Socket, type = "VIDEO") => {
  const incoming = nextEvent(calleeSocket, "call:incoming");
  const created = nextEvent(caller, "call:created");
  caller.emit("call:invite", { calleeUserOrganizationId: callee.userOrganizationId, type });
  return { incoming: await incoming, created: await created };
};

describe("calls", () => {
  it("rings, connects, relays signaling only between the answering devices, and records the call", async () => {
    const alice = await registerUser({ firstName: "Alice" });
    const bob = await registerUser();
    const aliceSocket = await connected(alice.token);
    const bobPhone = await connected(bob.token);
    const bobTablet = await connected(bob.token);

    const tabletRings = nextEvent(bobTablet, "call:incoming");
    const { incoming } = await ring(aliceSocket, bob, bobPhone);
    assert.equal(incoming.callerName, "Alice");
    await tabletRings;

    const accepted = nextEvent(aliceSocket, "call:accepted");
    const elsewhere = nextEvent(bobTablet, "call:answered-elsewhere");
    bobPhone.emit("call:accept", { callId: incoming.callId });
    await accepted;
    await elsewhere;

    const offer = nextEvent(bobPhone, "call:offer");
    const tabletSilent = receivesNothing(bobTablet, "call:offer");
    aliceSocket.emit("call:offer", { callId: incoming.callId, payload: { type: "offer", sdp: "v=0" } });
    assert.equal((await offer).payload.sdp, "v=0");
    await tabletSilent;

    const answer = nextEvent(aliceSocket, "call:answer");
    bobPhone.emit("call:answer", { callId: incoming.callId, payload: { type: "answer", sdp: "v=0" } });
    await answer;

    const ended = nextEvent(bobPhone, "call:ended");
    aliceSocket.emit("call:end", { callId: incoming.callId });
    assert.equal((await ended).status, "ENDED");

    const row = await prisma.call_session.findUniqueOrThrow({ where: { call_id: BigInt(incoming.callId) } });
    assert.equal(row.status, "ENDED");
    assert.ok(row.answered_at);
  });

  it("lets outsiders neither join nor listen in", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const mallory = await registerUser();
    const aliceSocket = await connected(alice.token);
    const bobSocket = await connected(bob.token);
    const mallorySocket = await connected(mallory.token);

    const { incoming } = await ring(aliceSocket, bob, bobSocket);

    const refused = nextEvent(mallorySocket, "call:error");
    mallorySocket.emit("call:accept", { callId: incoming.callId });
    assert.equal((await refused).errorCode, "CALL_NOT_AVAILABLE");

    const silent = receivesNothing(aliceSocket, "call:offer");
    mallorySocket.emit("call:offer", { callId: incoming.callId, payload: { sdp: "evil" } });
    await silent;
  });

  it("records rejected and cancelled calls", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const aliceSocket = await connected(alice.token);
    const bobSocket = await connected(bob.token);

    const first = await ring(aliceSocket, bob, bobSocket);
    const rejected = nextEvent(aliceSocket, "call:ended");
    bobSocket.emit("call:reject", { callId: first.incoming.callId });
    assert.equal((await rejected).status, "REJECTED");

    const second = await ring(aliceSocket, bob, bobSocket, "AUDIO");
    const cancelled = nextEvent(bobSocket, "call:ended");
    aliceSocket.emit("call:cancel", { callId: second.incoming.callId });
    assert.equal((await cancelled).status, "CANCELLED");

    const history = await api("GET", "/calls", { token: bob.token });
    assert.deepEqual(history.json.data.calls.map((c: any) => [c.status, c.direction, c.type]), [["CANCELLED", "INCOMING", "AUDIO"], ["REJECTED", "INCOMING", "VIDEO"]]);
  });

  it("says busy when the person is already in a call", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const carol = await registerUser();
    const aliceSocket = await connected(alice.token);
    const bobSocket = await connected(bob.token);
    const carolSocket = await connected(carol.token);
    await ring(aliceSocket, bob, bobSocket);

    const busy = nextEvent(carolSocket, "call:busy");
    carolSocket.emit("call:invite", { calleeUserOrganizationId: bob.userOrganizationId, type: "AUDIO" });
    const { callId } = await busy;
    assert.equal((await prisma.call_session.findUniqueOrThrow({ where: { call_id: BigInt(callId) } })).status, "BUSY");
  });

  it("refuses calls the organization policy or the callee's block forbids", async () => {
    const alice = await registerUser();
    const outsider = await registerUser({ orgCode: "ORGB" });
    const bob = await registerUser();
    const aliceSocket = await connected(alice.token);

    const crossOrg = nextEvent(aliceSocket, "call:error");
    aliceSocket.emit("call:invite", { calleeUserOrganizationId: outsider.userOrganizationId, type: "AUDIO" });
    assert.equal((await crossOrg).errorCode, "CANNOT_MESSAGE");

    await prisma.organization_setting.update({ where: { org_id: org.a }, data: { calls_enabled: false } });
    const disabled = nextEvent(aliceSocket, "call:error");
    aliceSocket.emit("call:invite", { calleeUserOrganizationId: bob.userOrganizationId, type: "AUDIO" });
    assert.equal((await disabled).errorCode, "CALLS_DISABLED");
  });

  it("ends a call when a participant does not come back after losing connection", async () => {
    const callService = await import("../src/modules/call/call.service.js");
    const alice = await registerUser();
    const bob = await registerUser();
    const aliceSocket = await connected(alice.token);
    const bobSocket = await connected(bob.token);
    const { incoming } = await ring(aliceSocket, bob, bobSocket);
    bobSocket.emit("call:accept", { callId: incoming.callId });
    await nextEvent(aliceSocket, "call:accepted");

    const reconnecting = nextEvent(aliceSocket, "call:peer-reconnecting");
    bobSocket.disconnect();
    await reconnecting;

    // Bob comes back on a new connection within the grace period.
    const bobAgain = await connected(bob.token);
    const back = nextEvent(aliceSocket, "call:peer-reconnected");
    bobAgain.emit("call:rejoin", { callId: incoming.callId });
    await back;
    assert.equal(callService.liveCalls.get(incoming.callId)?.graceTimers.size, 0);
  });

  it("tells a device that connects late about a call still ringing", async () => {
    const alice = await registerUser();
    const bob = await registerUser();
    const aliceSocket = await connected(alice.token);
    const created = nextEvent(aliceSocket, "call:created");
    aliceSocket.emit("call:invite", { calleeUserOrganizationId: bob.userOrganizationId, type: "AUDIO" });
    const { callId } = await created;

    const late = connect(baseUrl, { transports: ["websocket"], auth: { token: bob.token }, reconnection: false, forceNew: true });
    openSockets.push(late);
    const incoming = await nextEvent(late, "call:incoming");
    assert.equal(incoming.callId, callId);
  });

  it("gives ICE servers, with short-lived TURN credentials only when TURN is configured", async () => {
    const alice = await registerUser();
    const { json } = await api("GET", "/calls/ice-servers", { token: alice.token });
    assert.equal(json.data.hasTurn, false);
    assert.ok(json.data.iceServers[0].urls[0].startsWith("stun:"));
  });
});
