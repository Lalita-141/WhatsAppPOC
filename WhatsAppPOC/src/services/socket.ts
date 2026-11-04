import { io } from 'socket.io-client';
import { activeBaseUrl } from '../environments/environment_constant';
import {
    expireSession,
    getLatestAccessToken,
    refreshAccessToken,
} from './auth/authSession';

const SOCKET_URL = activeBaseUrl.replace(/\/api\/v1\/?$/, '');

let handshakeToken = '';
let hasRetriedExpiredToken = false;

export const socket = io(SOCKET_URL, {
    transports: ['websocket'],
    autoConnect: false,
    // Evaluated on every connection attempt, so reconnects use the newest token.
    auth: (callback) => {
        callback({ token: getLatestAccessToken() || handshakeToken });
    },
});

socket.on('connect', () => {
    hasRetriedExpiredToken = false;
});

// A rejected handshake does not reconnect by itself.
socket.on('connect_error', async (error) => {
    if (error.message === 'SESSION_REVOKED') {
        expireSession();
        return;
    }

    if (error.message === 'TOKEN_EXPIRED' && !hasRetriedExpiredToken) {
        hasRetriedExpiredToken = true;

        const token = await refreshAccessToken();

        if (token) {
            socket.connect();
        }
    }
});

export const connectSocket = (accessToken: string) => {
    if (socket.connected) {
        return;
    }

    handshakeToken = accessToken;
    socket.connect();
};

export const disconnectSocket = () => {
    handshakeToken = '';
    socket.disconnect();
};
