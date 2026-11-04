import crypto from "node:crypto";
import prisma from "../../config/database.js";
import { env } from "../../config/env.js";
import { ApiError } from "../../utils/api-error.js";
import { assertCanMessage } from "../chat/messages/message.service.js";
import { findMembership } from "../chat/messages/message.repository.js";
import { getOrganizationSetting } from "../policy/communication.policy.js";

export const RING_TIMEOUT_MS = 45 * 1000;
export const RECONNECT_GRACE_MS = 20 * 1000;
const TURN_CREDENTIAL_TTL_S = 6 * 60 * 60;

/** Live state of calls on this server: who is in them and which device answered. */
export interface LiveCall {
    callId: bigint;
    caller: bigint;
    callee: bigint;
    type: "AUDIO" | "VIDEO";
    callerSocketId: string;
    calleeSocketId: string | null;
    ringTimer?: ReturnType<typeof setTimeout>;
    graceTimers: Map<string, ReturnType<typeof setTimeout>>;
}

export const liveCalls = new Map<string, LiveCall>();

export const isBusy = (member: bigint) =>
    [...liveCalls.values()].some((c) => c.caller === member || c.callee === member);

export const assertCanCall = async (caller: bigint, callee: bigint) => {
    if (caller === callee) throw new ApiError(400, "INVALID_CALLEE", "You cannot call yourself");
    await assertCanMessage(caller, callee);
    for (const member of [caller, callee]) {
        const membership = await findMembership(member);
        if (membership && !(await getOrganizationSetting(membership.org_id)).calls_enabled) {
            throw new ApiError(403, "CALLS_DISABLED", "Calls are turned off for this organization");
        }
    }
};

export const createCall = (caller: bigint, callee: bigint, type: "AUDIO" | "VIDEO", status: "RINGING" | "BUSY" = "RINGING") =>
    prisma.call_session.create({
        data: { caller_user_org_id: caller, callee_user_org_id: callee, type, status, ...(status === "BUSY" ? { ended_at: new Date(), end_reason: "BUSY" } : {}) },
    });

export const finishCall = async (callId: bigint, status: "ENDED" | "MISSED" | "REJECTED" | "CANCELLED" | "FAILED", reason: string) => {
    const live = liveCalls.get(callId.toString());
    if (live) {
        clearTimeout(live.ringTimer);
        live.graceTimers.forEach(clearTimeout);
        liveCalls.delete(callId.toString());
    }
    await prisma.call_session.updateMany({
        where: { call_id: callId, status: { in: ["RINGING", "ONGOING"] } },
        data: { status, end_reason: reason, ended_at: new Date() },
    });
};

export const markAnswered = (callId: bigint) =>
    prisma.call_session.updateMany({ where: { call_id: callId, status: "RINGING" }, data: { status: "ONGOING", answered_at: new Date() } });

/**
 * ICE servers for WebRTC. TURN credentials follow the coturn REST scheme: the
 * username carries an expiry, and the password is an HMAC of it, so nothing
 * long-lived is handed to the phone.
 */
export const iceServers = (member: bigint) => {
    const servers: { urls: string[]; username?: string; credential?: string }[] = [];
    if (env.calls.stunUrls.length) servers.push({ urls: env.calls.stunUrls });
    if (env.calls.turnUrls.length && env.calls.turnSecret) {
        const username = `${Math.floor(Date.now() / 1000) + TURN_CREDENTIAL_TTL_S}:${member}`;
        const credential = crypto.createHmac("sha1", env.calls.turnSecret).update(username).digest("base64");
        servers.push({ urls: env.calls.turnUrls, username, credential });
    }
    return { iceServers: servers, hasTurn: servers.some((s) => s.username) };
};

const fullName = (u: { first_name: string; last_name: string | null }) => [u.first_name, u.last_name].filter(Boolean).join(" ");

export const callHistory = async (member: bigint, cursor: unknown) => {
    const before = typeof cursor === "string" && /^\d{1,20}$/.test(cursor) ? BigInt(cursor) : undefined;
    const person = { select: { user_organization_id: true, user_master: { select: { first_name: true, last_name: true, profile_photo_media_id: true } } } };
    const rows = await prisma.call_session.findMany({
        where: { OR: [{ caller_user_org_id: member }, { callee_user_org_id: member }], ...(before ? { call_id: { lt: before } } : {}) },
        orderBy: { call_id: "desc" },
        take: 50,
        include: { caller: person, callee: person },
    });
    return {
        calls: rows.map((c) => {
            const outgoing = c.caller_user_org_id === member;
            const peer = outgoing ? c.callee : c.caller;
            return {
                callId: c.call_id.toString(),
                type: c.type,
                direction: outgoing ? "OUTGOING" : "INCOMING",
                status: c.status,
                peer: {
                    userOrganizationId: peer.user_organization_id.toString(),
                    name: fullName(peer.user_master),
                    profilePhotoMediaId: peer.user_master.profile_photo_media_id?.toString() ?? null,
                },
                startedAt: c.created_at,
                durationSeconds: c.answered_at && c.ended_at ? Math.round((c.ended_at.getTime() - c.answered_at.getTime()) / 1000) : 0,
            };
        }),
        nextCursor: rows.length === 50 ? rows[rows.length - 1].call_id.toString() : null,
    };
};

export const callerName = async (member: bigint) => {
    const m = await prisma.user_organization.findUnique({ where: { user_organization_id: member }, select: { user_master: { select: { first_name: true, last_name: true } } } });
    return m ? fullName(m.user_master) : "Someone";
};
