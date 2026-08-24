import { io } from 'socket.io-client';

const SOCKET_URL = 'http://172.20.1.72:5001';

export const socket = io(SOCKET_URL, {
    transports: ['websocket'],
    autoConnect: false,
});

export const connectSocket = (accessToken: string) => {
    if (socket.connected) {
        console.log('Socket already connected');
        return;
    }

    socket.auth = {
        token: accessToken,
    };

    socket.connect();

    socket.on('connect', () => {
        console.log('Socket connected:', socket.id);
    });

    socket.on('connect_error', (error) => {
        console.log('Socket connection error:', error.message);
    });

    socket.on('disconnect', (reason) => {
        console.log('Socket disconnected:', reason);
    });
};

export const disconnectSocket = () => {
    if (socket.connected) {
        socket.disconnect();
    }
};