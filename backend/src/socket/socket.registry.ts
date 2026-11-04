import { Server as SocketIOServer } from "socket.io";

let registeredIo: SocketIOServer | null = null;

export const registerSocketServer = (io: SocketIOServer) => {
  registeredIo = io;
};

export const getRegisteredSocketServer = () => registeredIo;

export const sessionRoom = (sessionId: bigint | string) =>
  `session:${sessionId.toString()}`;

// Closes live sockets so a revoked session cannot keep receiving messages.
export const disconnectSessions = (sessionIds: bigint[]) => {
  if (!registeredIo || sessionIds.length === 0) {
    return;
  }

  registeredIo
    .in(sessionIds.map(sessionRoom))
    .disconnectSockets(true);
};
