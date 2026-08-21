import { io } from "socket.io-client";

const SOCKET_URL =
    "http://172.20.1.72:5001";

export const socket = io(
    SOCKET_URL,
    {
        transports: ["websocket"],
        autoConnect: false,
    },
);