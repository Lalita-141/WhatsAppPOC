import { Server as HttpServer } from "http";
import { Server as SocketIOServer, Socket } from "socket.io";
import jwt from "jsonwebtoken";

import {
    sendPersonalMessage,
    markMessageDelivered,
    markPersonalMessagesRead
} from "../modules/chat/personal/personal.service.js";

import {
    updateUserLastSeen,
    getUserLastSeenByUserOrgId
} from "../modules/user/user.repository.js";

interface AccessTokenPayload {
    userId: string;
    organizationId: string;
    userOrganizationId: string;
    type: "ACCESS";
}

interface AuthenticatedSocket extends Socket {
    user?: {
        userId: bigint;
        organizationId: bigint;
        userOrganizationId: bigint;
    };
}

let io: SocketIOServer;

// In-memory presence map: userOrganizationId -> Set of active socket IDs
const onlineUsers = new Map<string, Set<string>>();

export const initializeSocket = (
    httpServer: HttpServer,
) => {
    io = new SocketIOServer(httpServer, {
        cors: {
            origin: "*",
        },
    });

    // --------------------------------------------------
    // Socket authentication middleware
    // --------------------------------------------------

    io.use((socket, next) => {
        try {
            const token = socket.handshake.auth?.token;

            if (!token) {
                return next(
                    new Error("Authentication token is required"),
                );
            }

            const secret = process.env.JWT_ACCESS_SECRET;

            if (!secret) {
                return next(
                    new Error(
                        "JWT_ACCESS_SECRET is not configured",
                    ),
                );
            }

            const decoded = jwt.verify(
                token,
                secret,
            ) as AccessTokenPayload;

            if (decoded.type !== "ACCESS") {
                return next(
                    new Error("Invalid token type"),
                );
            }

            if (!decoded.userOrganizationId) {
                return next(
                    new Error(
                        "User organization ID is missing",
                    ),
                );
            }

            const authenticatedSocket =
                socket as AuthenticatedSocket;

            authenticatedSocket.user = {
                userId: BigInt(decoded.userId),
                organizationId: BigInt(decoded.organizationId),
                userOrganizationId: BigInt(decoded.userOrganizationId),
            };

            next();

        } catch (error) {

            if (error instanceof jwt.TokenExpiredError) {
                return next(new Error("TOKEN_EXPIRED"));
            }

            if (error instanceof jwt.JsonWebTokenError) {
                return next(new Error("INVALID_TOKEN"));
            }

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

            console.log("Socket connected:", socket.id);
            console.log("User:", authenticatedSocket.user?.userId.toString());
            console.log("User Organization:", authenticatedSocket.user?.userOrganizationId.toString());

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

            if (organizationId) {
                const orgRoom = `org:${organizationId}`;
                socket.join(orgRoom);
            }

            console.log(
                `Socket ${socket.id} joined ${userRoom}`,
            );

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
            if (isFirstSocket && organizationId) {
                io.to(`org:${organizationId}`).emit("presence:update", {
                    userOrganizationId,
                    isOnline: true,
                    lastSeen: null,
                });

                console.log(
                    `User ${userOrganizationId} is now ONLINE`,
                );
            }

            // --------------------------------------------------
            // Disconnect logic
            // --------------------------------------------------

            socket.on(
                "disconnect",
                (reason) => {

                    console.log(
                        "Socket disconnected:",
                        socket.id,
                        reason,
                    );

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
                                        console.error(
                                            "Failed to update last_seen:",
                                            err,
                                        );
                                    });
                                }

                                if (organizationId) {
                                    io.to(`org:${organizationId}`).emit(
                                        "presence:update",
                                        {
                                            userOrganizationId,
                                            isOnline: false,
                                            lastSeen:
                                                lastSeen.toISOString(),
                                        },
                                    );
                                }

                                console.log(
                                    `User ${userOrganizationId} is now OFFLINE (last seen: ${lastSeen.toISOString()})`,
                                );
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
                        const targetUserOrgId =
                            data?.targetUserOrganizationId?.toString();

                        if (!targetUserOrgId) {
                            return;
                        }

                        const isOnline = Boolean(
                            onlineUsers.has(targetUserOrgId) &&
                            onlineUsers.get(targetUserOrgId)!.size > 0,
                        );

                        let lastSeen: string | null = null;

                        // If user is offline, fetch their persisted last_seen from DB
                        if (!isOnline) {
                            try {
                                const dbLastSeen =
                                    await getUserLastSeenByUserOrgId(
                                        BigInt(targetUserOrgId),
                                    );

                                if (dbLastSeen) {
                                    lastSeen =
                                        dbLastSeen.toISOString();
                                }
                            } catch (dbErr) {
                                console.error(
                                    "Failed to fetch last_seen for presence:get:",
                                    dbErr,
                                );
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
                        console.error(
                            "presence:get error:",
                            error,
                        );
                    }
                },
            );

            // --------------------------------------------------
            // TYPING INDICATOR (typing:start & typing:stop)
            // --------------------------------------------------

            socket.on("typing:start", (data) => {
                try {
                    const senderUserOrganizationId =
                        authenticatedSocket.user?.userOrganizationId?.toString();
                    const receiverUserOrganizationId =
                        data?.receiverUserOrganizationId?.toString();

                    console.log(
                        `[Socket] typing:start from ${senderUserOrganizationId} to ${receiverUserOrganizationId}`,
                    );

                    if (!senderUserOrganizationId || !receiverUserOrganizationId) {
                        return;
                    }

                    io.to(`user:${receiverUserOrganizationId}`).emit("typing:start", {
                        senderUserOrganizationId,
                    });
                } catch (error) {
                    console.error("typing:start error:", error);
                }
            });

            socket.on("typing:stop", (data) => {
                try {
                    const senderUserOrganizationId =
                        authenticatedSocket.user?.userOrganizationId?.toString();
                    const receiverUserOrganizationId =
                        data?.receiverUserOrganizationId?.toString();

                    console.log(
                        `[Socket] typing:stop from ${senderUserOrganizationId} to ${receiverUserOrganizationId}`,
                    );

                    if (!senderUserOrganizationId || !receiverUserOrganizationId) {
                        return;
                    }

                    io.to(`user:${receiverUserOrganizationId}`).emit("typing:stop", {
                        senderUserOrganizationId,
                    });
                } catch (error) {
                    console.error("typing:stop error:", error);
                }
            });

            // send Message Event

            socket.on(
                "message:send",
                async (data) => {

                    try {

                        // --------------------------------------------------
                        // 1. Get authenticated sender
                        // --------------------------------------------------

                        const sender =
                            authenticatedSocket.user;

                        if (!sender) {
                            socket.emit(
                                "message:error",
                                {
                                    errorCode: "UNAUTHORIZED",
                                    message: "Socket authentication required",
                                },
                            );

                            return;
                        }


                        // --------------------------------------------------
                        // 2. Validate request
                        // --------------------------------------------------

                        const receiverUserOrganizationId =
                            data?.receiverUserOrganizationId;

                        const message =
                            data?.message;

                        const media =
                            data?.media;


                        if (
                            !receiverUserOrganizationId
                        ) {

                            socket.emit(
                                "message:error",
                                {
                                    errorCode:
                                        "RECEIVER_REQUIRED",

                                    message:
                                        "Receiver user organization ID is required",
                                },
                            );

                            return;
                        }


                        // --------------------------------------------------
                        // 3. Convert receiver ID
                        // --------------------------------------------------

                        let receiverId: bigint;

                        try {

                            receiverId =
                                BigInt(
                                    receiverUserOrganizationId,
                                );

                        } catch {

                            socket.emit(
                                "message:error",
                                {
                                    errorCode:
                                        "INVALID_RECEIVER",

                                    message:
                                        "Invalid receiver user organization ID",
                                },
                            );

                            return;
                        }


                        // --------------------------------------------------
                        // 4. Save message
                        // --------------------------------------------------

                        const savedMessage =
                            await sendPersonalMessage(
                                sender.userOrganizationId,
                                receiverId,
                                message,
                                media,
                            );


                        // --------------------------------------------------
                        // 5. Send confirmation to sender
                        // --------------------------------------------------

                        socket.emit(
                            "message:sent",
                            savedMessage,
                        );


                        // --------------------------------------------------
                        // 6. Deliver to receiver
                        // --------------------------------------------------

                        const receiverRoom =
                            `user:${receiverId.toString()}`;

                        io.to(receiverRoom).emit(
                            "message:new",
                            savedMessage,
                        );


                        console.log(
                            `Message ${savedMessage.messageId} sent from ${sender.userOrganizationId} to ${receiverId}`,
                        );

                    } catch (error) {

                        console.error(
                            "message:send error:",
                            error,
                        );


                        socket.emit(
                            "message:error",
                            {
                                errorCode:
                                    error instanceof Error
                                        ? "MESSAGE_SEND_FAILED"
                                        : "UNKNOWN_ERROR",

                                message:
                                    error instanceof Error
                                        ? error.message
                                        : "Unable to send message",
                            },
                        );
                    }
                },
            );

            // on socket message delivered
            socket.on(
                "message:delivered",
                async (data) => {

                    try {

                        const receiver =
                            authenticatedSocket.user;

                        if (!receiver) {
                            socket.emit(
                                "message:error",
                                {
                                    errorCode: "UNAUTHORIZED",
                                    message:
                                        "Socket authentication required",
                                },
                            );

                            return;
                        }


                        if (!data?.messageId) {
                            socket.emit(
                                "message:error",
                                {
                                    errorCode: "MESSAGE_ID_REQUIRED",
                                    message:
                                        "Message ID is required",
                                },
                            );

                            return;
                        }


                        let chatId: bigint;

                        try {

                            chatId =
                                BigInt(data.messageId);

                        } catch {

                            socket.emit(
                                "message:error",
                                {
                                    errorCode: "INVALID_MESSAGE_ID",
                                    message:
                                        "Invalid message ID",
                                },
                            );

                            return;
                        }


                        // ---------------------------------------------
                        // Update database
                        // ---------------------------------------------

                        const delivered =
                            await markMessageDelivered(
                                chatId,
                                receiver.userOrganizationId,
                            );


                        // ---------------------------------------------
                        // Notify original sender
                        // ---------------------------------------------

                        io.to(
                            `user:${delivered.senderUserOrganizationId}`,
                        ).emit(
                            "message:delivered",
                            delivered,
                        );


                        console.log(
                            `Message ${delivered.messageId} delivered to ${delivered.receiverUserOrganizationId}`,
                        );

                    } catch (error) {

                        console.error(
                            "message:delivered error:",
                            error,
                        );

                        socket.emit(
                            "message:error",
                            {
                                errorCode:
                                    "DELIVERY_UPDATE_FAILED",

                                message:
                                    error instanceof Error
                                        ? error.message
                                        : "Unable to update delivery status",
                            },
                        );
                    }
                },
            );

            // message read
            // --------------------------------------------------
            // MESSAGE READ
            // --------------------------------------------------

            socket.on("message:read", async (data) => {

                try {

                    const authenticatedSocket =
                        socket as AuthenticatedSocket;

                    const currentUserOrganizationId =
                        authenticatedSocket.user
                            ?.userOrganizationId;

                    if (!currentUserOrganizationId) {
                        return;
                    }

                    // ----------------------------------------------
                    // Validate other user
                    // ----------------------------------------------

                    const otherUserOrganizationId =
                        BigInt(data?.otherUserOrganizationId);

                    if (
                        currentUserOrganizationId ===
                        otherUserOrganizationId
                    ) {
                        return;
                    }

                    // ----------------------------------------------
                    // Mark messages READ
                    // ----------------------------------------------

                    const result =
                        await markPersonalMessagesRead(
                            currentUserOrganizationId,
                            otherUserOrganizationId,
                        );

                    // Nothing changed
                    if (result.messageIds.length === 0) {
                        return;
                    }

                    console.log(
                        "Messages marked READ:",
                        result.messageIds,
                    );

                    // ----------------------------------------------
                    // Notify original sender
                    // ----------------------------------------------

                    io.to(
                        `user:${result.senderUserOrganizationId}`,
                    ).emit(
                        "message:read",
                        {
                            messageIds:
                                result.messageIds,

                            readerUserOrganizationId:
                                result.readerUserOrganizationId,
                        },
                    );

                } catch (error) {

                    console.error(
                        "message:read error:",
                        error,
                    );
                }
            });
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