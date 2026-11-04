import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";

import {
    canReach,
    markMessagesDelivered,
    markRead,
    MAX_MESSAGE_LENGTH,
    sendMessage,
    typingAllowed,
} from "../modules/chat/messages/message.service.js";

import {
    updateUserLastSeen,
    getUserLastSeenByUserOrgId,
    getLastSeenPrivacy,
    hasExchangedMessages,
} from "../modules/user/user.repository.js";
import { deliverGroupMessage, deliverNewMessage, emitToMember, emitToMembers, groupChatKey } from "./delivery.js";
import {
    markGroupDelivered,
    markGroupRead,
    participatingMemberIds,
    requireMember,
    sendGroupMessage,
    toGroupMessageDto,
} from "../modules/group/group.service.js";
import prisma from "../config/database.js";
import { activeChatMap, onlineUsers, userRoom as roomOf } from "./presence.state.js";
import { getActiveSessionContext } from "../modules/auth/session.service.js";
import { env } from "../config/env.js";
import { logger } from "../config/logger.js";
import { ApiError } from "../utils/api-error.js";
import { verifyAccessToken } from "../utils/jwt.js";
import { registerSocketServer, sessionRoom } from "./socket.registry.js";
import { registerCallHandlers } from "./call.handlers.js";
import { toMessageDto } from "../modules/chat/messages/message.service.js";

interface AuthenticatedSocket extends Socket {
    user?: {
        userId: bigint;
        organizationId: bigint;
        userOrganizationId: bigint;
        sessionId: bigint;
    };
}

const MAX_SOCKET_PAYLOAD_BYTES = 64 * 1024;
const PEER_ACCESS_CACHE_MS = 60 * 1000;
const RATE_WINDOW_MS = 10 * 1000;

// Maximum events per socket in each 10-second window.
const EVENT_LIMITS: Record<string, number> = {
    "message:send": 30,
    "message:delivered": 120,
    "message:read": 60,
    "typing": 40,
    "presence:get": 60,
    "group:message:send": 30,
    "call": 10,
    "signal": 400,
};

const parseId = (value: unknown): bigint | null => {
    const text = typeof value === "number" ? String(value) : value;

    if (typeof text !== "string" || !/^\d{1,20}$/.test(text)) {
        return null;
    }

    return BigInt(text);
};

// Only errors written for clients are forwarded. Others could expose internals.
export const toSocketError = (
    error: unknown,
    fallbackCode: string,
    fallbackMessage: string,
) => {
    if (error instanceof ApiError) {
        return {
            errorCode: error.errorCode,
            message: error.message,
        };
    }

    return {
        errorCode: fallbackCode,
        message: fallbackMessage,
    };
};

let io: SocketIOServer;


export const initializeSocket = (
    httpServer: HttpServer,
) => {
    io = new SocketIOServer(httpServer, {
        cors: {
            origin: env.corsOrigins,
        },
        maxHttpBufferSize: MAX_SOCKET_PAYLOAD_BYTES,
    });

    registerSocketServer(io);

    // --------------------------------------------------
    // Socket authentication middleware
    // --------------------------------------------------

    io.use(async (socket, next) => {
        try {
            const token = socket.handshake.auth?.token;

            if (!token || typeof token !== "string") {
                return next(
                    new Error("Authentication token is required"),
                );
            }

            const decoded = verifyAccessToken(token);

            if (decoded.type !== "ACCESS" || !decoded.sessionId) {
                return next(
                    new Error("Invalid token type"),
                );
            }

            const session = await getActiveSessionContext(
                BigInt(decoded.sessionId),
            );

            if (
                !session ||
                session.user_organization_id.toString() !==
                    decoded.userOrganizationId
            ) {
                return next(new Error("SESSION_REVOKED"));
            }

            const authenticatedSocket =
                socket as AuthenticatedSocket;

            authenticatedSocket.user = {
                userId: session.user_organization.user_id,
                organizationId: session.user_organization.org_id,
                userOrganizationId: session.user_organization_id,
                sessionId: session.session_id,
            };

            next();

        } catch (error) {

            if (error instanceof jwt.TokenExpiredError) {
                return next(new Error("TOKEN_EXPIRED"));
            }

            if (error instanceof jwt.JsonWebTokenError) {
                return next(new Error("INVALID_TOKEN"));
            }

            logger.error({ err: error }, "Socket authentication failed");

            next(new Error("Socket authentication failed"));
        }
    });

    // --------------------------------------------------
    // Connection
    // --------------------------------------------------

    io.on(
        "connection",
        (socket) => {

            const authenticatedSocket = socket as AuthenticatedSocket;

            const eventCounters = new Map<string, { count: number; resetAt: number }>();
            const peerAccessCache = new Map<string, { allowed: boolean; expiresAt: number }>();

            const isEventAllowed = (event: string) => {
                const now = Date.now();
                const counter = eventCounters.get(event);

                if (!counter || counter.resetAt <= now) {
                    eventCounters.set(event, { count: 1, resetAt: now + RATE_WINDOW_MS });
                    return true;
                }

                counter.count += 1;

                return counter.count <= EVENT_LIMITS[event];
            };

            // Uses the same rule as sending a message: same organization, no block.
            const canReachMember = async (targetUserOrganizationId: bigint) => {
                const key = targetUserOrganizationId.toString();
                const cached = peerAccessCache.get(key);

                if (cached && cached.expiresAt > Date.now()) {
                    return cached.allowed;
                }

                const allowed = await canReach(
                    authenticatedSocket.user!.userOrganizationId,
                    targetUserOrganizationId,
                );

                peerAccessCache.set(key, {
                    allowed,
                    expiresAt: Date.now() + PEER_ACCESS_CACHE_MS,
                });

                return allowed;
            };

            // Status changes are only broadcast for people who share them with everyone.
            const broadcastPresence = (
                isOnline: boolean,
                lastSeen: string | null,
            ) => {
                const member = authenticatedSocket.user;

                if (!member) {
                    return;
                }

                getLastSeenPrivacy(member.userOrganizationId)
                    .then((privacy) => {
                        if (privacy === "EVERYONE") {
                            io.to(`org:${member.organizationId}`).emit("presence:update", {
                                userOrganizationId: member.userOrganizationId.toString(),
                                isOnline,
                                lastSeen,
                            });
                        }
                    })
                    .catch((err) => {
                        logger.error({ err }, "Failed to broadcast presence");
                    });
            };

            // --------------------------------------------------
            // Join user-specific & organization rooms
            // --------------------------------------------------

            const userOrganizationId = authenticatedSocket.user?.userOrganizationId?.toString();
            const organizationId = authenticatedSocket.user?.organizationId?.toString();

            if (!userOrganizationId) {
                socket.disconnect(true);
                return;
            }

            const userRoom =
                `user:${userOrganizationId}`;

            socket.join(userRoom);
            socket.join(sessionRoom(authenticatedSocket.user!.sessionId));

            if (organizationId) {
                const orgRoom = `org:${organizationId}`;
                socket.join(orgRoom);
            }

            // --------------------------------------------------
            // Track online presence (Multi-socket support)
            // --------------------------------------------------

            if (!onlineUsers.has(userOrganizationId)) {
                onlineUsers.set(userOrganizationId, new Set());
            }

            const userSockets = onlineUsers.get(userOrganizationId)!;
            const isFirstSocket = userSockets.size === 0;
            userSockets.add(socket.id);

            // Broadcast online status if this is user's first active connection
            if (isFirstSocket) {
                broadcastPresence(true, null);
            }

            // --------------------------------------------------
            // Disconnect logic
            // --------------------------------------------------

            socket.on(
                "disconnect",
                () => {

                    activeChatMap.delete(socket.id);

                    if (userOrganizationId) {
                        const sockets = onlineUsers.get(userOrganizationId);
                        if (sockets) {
                            sockets.delete(socket.id);

                            // Only mark offline if all active connections for this user are gone
                            if (sockets.size === 0) {
                                onlineUsers.delete(userOrganizationId);

                                const lastSeen = new Date();

                                // Persist last_seen to DB
                                if (authenticatedSocket.user?.userId) {
                                    updateUserLastSeen(
                                        authenticatedSocket.user.userId,
                                        lastSeen,
                                    ).catch((err) => {
                                        logger.error({ err }, "Failed to update last_seen");
                                    });
                                }

                                broadcastPresence(false, lastSeen.toISOString());
                            }
                        }
                    }
                },
            );

            // --------------------------------------------------
            // PRESENCE GET (Query single user online status)
            // --------------------------------------------------

            socket.on(
                "presence:get",
                async (data) => {
                    try {
                        const targetId = parseId(data?.targetUserOrganizationId);
                        const viewerId = authenticatedSocket.user?.userOrganizationId;

                        if (!targetId || !viewerId || !isEventAllowed("presence:get")) {
                            return;
                        }

                        const targetUserOrgId = targetId.toString();

                        // People the viewer may not see get the same answer as an
                        // offline user, so this cannot be used to find accounts.
                        let isVisible = await canReachMember(targetId);

                        if (isVisible) {
                            const privacy = await getLastSeenPrivacy(targetId);

                            isVisible =
                                privacy === "EVERYONE" ||
                                (privacy === "CONTACTS" &&
                                    (await hasExchangedMessages(viewerId, targetId)));
                        }

                        const isOnline =
                            isVisible &&
                            Boolean(onlineUsers.get(targetUserOrgId)?.size);

                        let lastSeen: string | null = null;

                        // If user is offline, fetch their persisted last_seen from DB
                        if (isVisible && !isOnline) {
                            const dbLastSeen =
                                await getUserLastSeenByUserOrgId(targetId);

                            if (dbLastSeen) {
                                lastSeen =
                                    dbLastSeen.toISOString();
                            }
                        }

                        socket.emit(
                            "presence:status",
                            {
                                userOrganizationId:
                                    targetUserOrgId,
                                isOnline,
                                lastSeen,
                            },
                        );
                    } catch (error) {
                        logger.error({ err: error }, "presence:get failed");
                    }
                },
            );

            // --------------------------------------------------
            // TYPING INDICATOR (typing:start & typing:stop)
            // --------------------------------------------------

            const relayTyping = async (
                event: "typing:start" | "typing:stop",
                data: { receiverUserOrganizationId?: unknown } | undefined,
            ) => {
                try {
                    const senderUserOrganizationId =
                        authenticatedSocket.user?.userOrganizationId?.toString();
                    const receiverId = parseId(data?.receiverUserOrganizationId);

                    if (
                        !senderUserOrganizationId ||
                        !receiverId ||
                        !isEventAllowed("typing") ||
                        receiverId === authenticatedSocket.user?.userOrganizationId ||
                        !(await canReachMember(receiverId)) ||
                        !(await typingAllowed(authenticatedSocket.user!.userOrganizationId))
                    ) {
                        return;
                    }

                    io.to(`user:${receiverId}`).emit(event, {
                        senderUserOrganizationId,
                    });
                } catch (error) {
                    logger.error({ err: error }, `${event} failed`);
                }
            };

            socket.on("typing:start", (data) => relayTyping("typing:start", data));
            socket.on("typing:stop", (data) => relayTyping("typing:stop", data));

            // --------------------------------------------------
            // ACTIVE CHAT TRACKING (To prevent duplicate FCM push notifications)
            // --------------------------------------------------

            socket.on("chat:active", (data) => {
                const targetUserOrgId = parseId(data?.activeWithUserOrganizationId);
                const groupId = parseId(data?.activeGroupId);
                if (targetUserOrgId) {
                    activeChatMap.set(socket.id, targetUserOrgId.toString());
                } else if (groupId) {
                    activeChatMap.set(socket.id, groupChatKey(groupId));
                }
            });

            socket.on("chat:inactive", () => {
                activeChatMap.delete(socket.id);
            });

            // --------------------------------------------------
            // SEND MESSAGE
            // --------------------------------------------------

            socket.on("message:send", async (data) => {
                const clientMessageId =
                    typeof data?.clientMessageId === "string" ? data.clientMessageId : null;

                const fail = (errorCode: string, message: string) =>
                    socket.emit("message:error", { errorCode, message, clientMessageId });

                try {
                    const sender = authenticatedSocket.user;

                    if (!sender) {
                        return fail("UNAUTHORIZED", "Socket authentication required");
                    }

                    if (!isEventAllowed("message:send")) {
                        return fail("RATE_LIMITED", "You are sending messages too quickly");
                    }

                    const hasMedia = data?.mediaId !== undefined && data?.mediaId !== null;
                    if (
                        (typeof data?.message !== "string" && !(hasMedia && (data?.message === undefined || data?.message === null))) ||
                        (typeof data?.message === "string" && data.message.length > MAX_MESSAGE_LENGTH)
                    ) {
                        return fail(
                            "INVALID_MESSAGE",
                            `Message must be text of at most ${MAX_MESSAGE_LENGTH} characters`,
                        );
                    }

                    // Files arrive through the upload API; only their ID is sent here.
                    if (data?.media !== undefined && data?.media !== null) {
                        return fail("MEDIA_NOT_SUPPORTED", "Attach files through the upload API");
                    }

                    let mediaId: bigint | null = null;
                    if (data?.mediaId !== undefined && data?.mediaId !== null) {
                        mediaId = parseId(data.mediaId);
                        if (!mediaId) return fail("INVALID_MEDIA", "Invalid media ID");
                    }

                    if (!data?.receiverUserOrganizationId) {
                        return fail("RECEIVER_REQUIRED", "Receiver user organization ID is required");
                    }

                    const receiverId = parseId(data.receiverUserOrganizationId);

                    if (!receiverId) {
                        return fail("INVALID_RECEIVER", "Invalid receiver user organization ID");
                    }

                    let replyToMessageId: bigint | null = null;

                    if (data.replyToMessageId !== undefined && data.replyToMessageId !== null) {
                        replyToMessageId = parseId(data.replyToMessageId);

                        if (!replyToMessageId) {
                            return fail("INVALID_REPLY", "Invalid reply message ID");
                        }
                    }

                    const { message, created } = await sendMessage({
                        sender: sender.userOrganizationId,
                        receiver: receiverId,
                        message: data.message,
                        clientMessageId,
                        replyToMessageId,
                        mediaId,
                    });

                    // The acknowledgement carries clientMessageId, so the client
                    // replaces exactly the optimistic bubble it created.
                    socket.emit("message:sent", toMessageDto(message, sender.userOrganizationId));

                    if (created) {
                        deliverNewMessage(message, socket.id);
                    }
                } catch (error) {
                    logger.error({ err: error }, "message:send failed");

                    const { errorCode, message } = toSocketError(
                        error,
                        "MESSAGE_SEND_FAILED",
                        "Unable to send message",
                    );
                    fail(errorCode, message);
                }
            });

            // --------------------------------------------------
            // MESSAGE DELIVERED (one ID or a batch after reconnecting)
            // --------------------------------------------------

            socket.on("message:delivered", async (data) => {
                try {
                    const receiver = authenticatedSocket.user;

                    if (!receiver || !isEventAllowed("message:delivered")) {
                        return;
                    }

                    const raw = Array.isArray(data?.messageIds)
                        ? data.messageIds
                        : [data?.messageId];
                    const chatIds = raw
                        .map(parseId)
                        .filter((id: bigint | null): id is bigint => id !== null);

                    if (chatIds.length === 0) {
                        return socket.emit("message:error", {
                            errorCode: "MESSAGE_ID_REQUIRED",
                            message: "Message ID is required",
                        });
                    }

                    const delivered = await markMessagesDelivered(
                        chatIds,
                        receiver.userOrganizationId,
                    );

                    for (const row of delivered) {
                        io.to(roomOf(row.sender_user_organization_id)).emit("message:delivered", {
                            messageId: row.chat_id.toString(),
                            senderUserOrganizationId: row.sender_user_organization_id.toString(),
                            receiverUserOrganizationId: receiver.userOrganizationId.toString(),
                            status: "DELIVERED",
                            receiveTime: row.receive_time,
                        });
                    }
                } catch (error) {
                    logger.error({ err: error }, "message:delivered failed");

                    socket.emit(
                        "message:error",
                        toSocketError(error, "DELIVERY_UPDATE_FAILED", "Unable to update delivery status"),
                    );
                }
            });

            // --------------------------------------------------
            // MESSAGE READ
            // --------------------------------------------------

            socket.on("message:read", async (data) => {
                try {
                    const reader = authenticatedSocket.user?.userOrganizationId;
                    const peer = parseId(data?.otherUserOrganizationId);

                    if (!reader || !peer || !isEventAllowed("message:read") || reader === peer) {
                        return;
                    }

                    const result = await markRead(reader, peer);

                    if (result.chatIds.length === 0) {
                        return;
                    }

                    // The reader's other devices clear their unread badge.
                    emitToMember(reader, "conversation:updated", {
                        peerUserOrganizationId: peer.toString(),
                        unreadCount: 0,
                    });

                    // Blue ticks only when both people allow read receipts.
                    if (result.notifySender) {
                        io.to(roomOf(peer)).emit("message:read", {
                            messageIds: result.chatIds.map((id) => id.toString()),
                            readerUserOrganizationId: reader.toString(),
                            readTime: result.readTime,
                        });
                    }
                } catch (error) {
                    logger.error({ err: error }, "message:read failed");
                }
            });

            // --------------------------------------------------
            // GROUP MESSAGES
            // --------------------------------------------------

            socket.on("group:message:send", async (data) => {
                const clientMessageId = typeof data?.clientMessageId === "string" ? data.clientMessageId : null;
                const fail = (errorCode: string, message: string) =>
                    socket.emit("group:message:error", { errorCode, message, clientMessageId, groupId: data?.groupId ?? null });

                try {
                    const sender = authenticatedSocket.user!;
                    if (!isEventAllowed("group:message:send")) {
                        return fail("RATE_LIMITED", "You are sending messages too quickly");
                    }
                    if (data?.media !== undefined && data?.media !== null) {
                        return fail("MEDIA_NOT_SUPPORTED", "Attach files through the upload API");
                    }
                    const groupId = parseId(data?.groupId);
                    if (!groupId) return fail("INVALID_GROUP", "Invalid group");
                    const replyToMessageId = data?.replyToMessageId ? parseId(data.replyToMessageId) : null;
                    const mediaId = data?.mediaId ? parseId(data.mediaId) : null;
                    if (data?.mediaId && !mediaId) return fail("INVALID_MEDIA", "Invalid media ID");

                    const { row, recipients, created } = await sendGroupMessage({
                        sender: sender.userOrganizationId,
                        groupId,
                        message: data?.message,
                        clientMessageId,
                        replyToMessageId,
                        mediaId,
                    });

                    socket.emit("group:message:sent", toGroupMessageDto(row, sender.userOrganizationId));

                    if (created) {
                        const group = await prisma.wp_group.findUniqueOrThrow({ where: { group_id: groupId }, select: { group_name: true } });
                        await deliverGroupMessage(row, recipients, group.group_name, socket.id);
                    }
                } catch (error) {
                    logger.error({ err: error }, "group:message:send failed");
                    const { errorCode, message } = toSocketError(error, "MESSAGE_SEND_FAILED", "Unable to send message");
                    fail(errorCode, message);
                }
            });

            socket.on("group:message:delivered", async (data) => {
                try {
                    const viewer = authenticatedSocket.user!.userOrganizationId;
                    if (!isEventAllowed("message:delivered")) return;
                    const ids = (Array.isArray(data?.messageIds) ? data.messageIds : [data?.messageId])
                        .map(parseId)
                        .filter((id: bigint | null): id is bigint => id !== null);
                    for (const item of await markGroupDelivered(viewer, ids)) {
                        io.to(roomOf(item.sender)).emit("group:message:receipt", {
                            groupId: item.groupId.toString(),
                            messageId: item.messageId.toString(),
                        });
                    }
                } catch (error) {
                    logger.error({ err: error }, "group:message:delivered failed");
                }
            });

            socket.on("group:message:read", async (data) => {
                try {
                    const viewer = authenticatedSocket.user!.userOrganizationId;
                    const groupId = parseId(data?.groupId);
                    if (!groupId || !isEventAllowed("message:read")) return;
                    const read = await markGroupRead(viewer, groupId);
                    emitToMember(viewer, "group:updated", { groupId: groupId.toString() });
                    for (const sender of new Set(read.map((r) => r.sender.toString()))) {
                        io.to(roomOf(sender)).emit("group:message:receipt", { groupId: groupId.toString() });
                    }
                } catch (error) {
                    logger.error({ err: error }, "group:message:read failed");
                }
            });

            const relayGroupTyping = async (event: "group:typing:start" | "group:typing:stop", data: any) => {
                try {
                    const sender = authenticatedSocket.user!.userOrganizationId;
                    const groupId = parseId(data?.groupId);
                    if (!groupId || !isEventAllowed("typing") || !(await typingAllowed(sender))) return;
                    const { group } = await requireMember(groupId, sender);
                    const members = (await participatingMemberIds(groupId, group.org_id)).filter((m) => m !== sender);
                    emitToMembers(members, event, () => ({ groupId: groupId.toString(), senderUserOrganizationId: sender.toString() }));
                } catch {
                    // Not a member: ignored without saying whether the group exists.
                }
            };

            registerCallHandlers(io, socket, authenticatedSocket.user!.userOrganizationId, isEventAllowed);

            socket.on("group:typing:start", (data) => relayGroupTyping("group:typing:start", data));
            socket.on("group:typing:stop", (data) => relayGroupTyping("group:typing:stop", data));
        },
    );

    return io;
};

export const getIO = () => {

    if (!io) {
        throw new Error(
            "Socket.IO has not been initialized",
        );
    }

    return io;
};