// In-memory connection state for this process. Phase 12 moves it to Redis so
// several backend instances can share it.

// userOrganizationId -> ids of that member's connected sockets
export const onlineUsers = new Map<string, Set<string>>();

// socket id -> the chat that socket has open (peer ID or "group:<id>")
export const activeChatMap = new Map<string, string>();

export const userRoom = (userOrganizationId: bigint | string) =>
    `user:${userOrganizationId.toString()}`;

// A chat is a peer's userOrganizationId, or "group:<id>" for a group.
export const isViewingChatWith = (viewer: bigint, chat: bigint | string) =>
    Array.from(onlineUsers.get(viewer.toString()) ?? []).some(
        (socketId) => activeChatMap.get(socketId) === chat.toString(),
    );
