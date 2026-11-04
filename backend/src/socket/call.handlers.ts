import { Server as SocketIOServer, Socket } from "socket.io";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/api-error.js";
import { userRoom } from "./presence.state.js";
import { sendPushNotification } from "../modules/notification/notification.service.js";
import {
    assertCanCall,
    callerName,
    createCall,
    finishCall,
    isBusy,
    liveCalls,
    LiveCall,
    markAnswered,
    RECONNECT_GRACE_MS,
    RING_TIMEOUT_MS,
} from "../modules/call/call.service.js";

const MAX_SDP_BYTES = 16 * 1024;
const MAX_ICE_BYTES = 2 * 1024;

const parseId = (value: unknown) => (typeof value === "string" && /^\d{1,20}$/.test(value) ? BigInt(value) : null);

/**
 * WebRTC signaling for one-to-one calls. The server never sees audio or video:
 * it checks who may call whom, relays offers, answers and ICE candidates
 * between the two devices in the call, and records the outcome.
 */
export const registerCallHandlers = (
    io: SocketIOServer,
    socket: Socket,
    member: bigint,
    isAllowed: (event: string) => boolean,
) => {
    const fail = (callId: string | null, errorCode: string, message: string) =>
        socket.emit("call:error", { callId, errorCode, message });

    // A device that connects while a call to it is still ringing (for example
    // after tapping the call notification) is told about that call.
    for (const live of liveCalls.values()) {
        if (live.callee === member && !live.calleeSocketId) {
            callerName(live.caller)
                .then((name) =>
                    socket.emit("call:incoming", {
                        callId: live.callId.toString(),
                        callerUserOrganizationId: live.caller.toString(),
                        callerName: name,
                        type: live.type,
                    }),
                )
                .catch(() => undefined);
        }
    }

    const callFor = (data: any) => {
        const live = liveCalls.get(String(data?.callId ?? ""));
        return live && (live.caller === member || live.callee === member) ? live : null;
    };

    const otherSide = (live: LiveCall) => {
        if (member === live.caller) return live.calleeSocketId ?? userRoom(live.callee);
        return live.callerSocketId;
    };

    const end = async (live: LiveCall, status: "ENDED" | "MISSED" | "REJECTED" | "CANCELLED" | "FAILED", reason: string) => {
        await finishCall(live.callId, status, reason);
        const payload = { callId: live.callId.toString(), status, reason };
        io.to(userRoom(live.caller)).emit("call:ended", payload);
        io.to(userRoom(live.callee)).emit("call:ended", payload);
    };

    socket.on("call:invite", async (data) => {
        try {
            if (!isAllowed("call")) return fail(null, "RATE_LIMITED", "Too many call attempts");
            const callee = parseId(data?.calleeUserOrganizationId);
            const type = data?.type === "VIDEO" ? "VIDEO" : data?.type === "AUDIO" ? "AUDIO" : null;
            if (!callee || !type) return fail(null, "INVALID_CALL", "calleeUserOrganizationId and type are required");

            await assertCanCall(member, callee);

            if (isBusy(member) || isBusy(callee)) {
                const busy = await createCall(member, callee, type, "BUSY");
                return socket.emit("call:busy", { callId: busy.call_id.toString() });
            }

            const call = await createCall(member, callee, type);
            const live: LiveCall = { callId: call.call_id, caller: member, callee, type, callerSocketId: socket.id, calleeSocketId: null, graceTimers: new Map() };
            live.ringTimer = setTimeout(() => {
                end(live, "MISSED", "NO_ANSWER").catch((err) => logger.error({ err }, "Missed call update failed"));
            }, RING_TIMEOUT_MS);
            liveCalls.set(call.call_id.toString(), live);

            const name = await callerName(member);
            socket.emit("call:created", { callId: call.call_id.toString(), calleeUserOrganizationId: callee.toString(), type });
            io.to(userRoom(callee)).emit("call:incoming", {
                callId: call.call_id.toString(),
                callerUserOrganizationId: member.toString(),
                callerName: name,
                type,
            });
            sendPushNotification({
                receiverUserOrganizationId: callee,
                category: "CALL",
                channelId: "calls",
                thread: `call:${call.call_id}`,
                title: name,
                body: type === "VIDEO" ? "Incoming video call" : "Incoming voice call",
                data: { type: "INCOMING_CALL", callId: call.call_id.toString(), callerUserOrganizationId: member.toString(), callerName: name, callType: type },
            });
        } catch (error) {
            const { errorCode, message } = error instanceof ApiError ? error : { errorCode: "CALL_FAILED", message: "Could not start the call" };
            if (!(error instanceof ApiError)) logger.error({ err: error }, "call:invite failed");
            fail(null, errorCode, message);
        }
    });

    // The callee's device lets the caller know it is ringing.
    socket.on("call:ringing", (data) => {
        const live = callFor(data);
        if (live && member === live.callee) io.to(live.callerSocketId).emit("call:ringing", { callId: live.callId.toString() });
    });

    socket.on("call:accept", async (data) => {
        const live = callFor(data);
        if (!live || member !== live.callee || live.calleeSocketId) return fail(String(data?.callId ?? ""), "CALL_NOT_AVAILABLE", "This call is no longer ringing");
        clearTimeout(live.ringTimer);
        live.calleeSocketId = socket.id;
        await markAnswered(live.callId);
        io.to(live.callerSocketId).emit("call:accepted", { callId: live.callId.toString() });
        // The callee's other devices stop ringing.
        socket.to(userRoom(live.callee)).emit("call:answered-elsewhere", { callId: live.callId.toString() });
    });

    socket.on("call:reject", async (data) => {
        const live = callFor(data);
        if (live && member === live.callee && !live.calleeSocketId) await end(live, "REJECTED", "DECLINED");
    });

    socket.on("call:cancel", async (data) => {
        const live = callFor(data);
        if (live && member === live.caller && !live.calleeSocketId) await end(live, "CANCELLED", "CALLER_CANCELLED");
    });

    socket.on("call:end", async (data) => {
        const live = callFor(data);
        if (live) await end(live, live.calleeSocketId ? "ENDED" : "CANCELLED", "HANGUP");
    });

    // Offer, answer and ICE candidates go only to the other device in the call.
    const relay = (event: "call:offer" | "call:answer" | "call:ice", maxBytes: number) => (data: any) => {
        const live = callFor(data);
        if (!live || !isAllowed("signal")) return;
        if (member === live.callee && socket.id !== live.calleeSocketId) return;
        if (JSON.stringify(data?.payload ?? null).length > maxBytes) return fail(live.callId.toString(), "SIGNAL_TOO_LARGE", "Signaling message too large");
        io.to(otherSide(live)).emit(event, { callId: live.callId.toString(), payload: data.payload });
    };
    socket.on("call:offer", relay("call:offer", MAX_SDP_BYTES));
    socket.on("call:answer", relay("call:answer", MAX_SDP_BYTES));
    socket.on("call:ice", relay("call:ice", MAX_ICE_BYTES));

    // A participant whose connection dropped comes back with the call ID.
    socket.on("call:rejoin", (data) => {
        const live = callFor(data);
        if (!live) return fail(String(data?.callId ?? ""), "CALL_NOT_AVAILABLE", "This call has ended");
        const side = member === live.caller ? "caller" : "callee";
        clearTimeout(live.graceTimers.get(side));
        live.graceTimers.delete(side);
        if (side === "caller") live.callerSocketId = socket.id;
        else live.calleeSocketId = socket.id;
        io.to(otherSide(live)).emit("call:peer-reconnected", { callId: live.callId.toString() });
    });

    socket.on("disconnect", () => {
        for (const live of liveCalls.values()) {
            const side = live.callerSocketId === socket.id ? "caller" : live.calleeSocketId === socket.id ? "callee" : null;
            if (!side) continue;
            if (!live.calleeSocketId && side === "caller") {
                end(live, "CANCELLED", "CALLER_DISCONNECTED").catch(() => undefined);
                continue;
            }
            io.to(side === "caller" ? live.calleeSocketId ?? userRoom(live.callee) : live.callerSocketId).emit("call:peer-reconnecting", { callId: live.callId.toString() });
            live.graceTimers.set(side, setTimeout(() => {
                end(live, "ENDED", "CONNECTION_LOST").catch(() => undefined);
            }, RECONNECT_GRACE_MS));
        }
    });
};
