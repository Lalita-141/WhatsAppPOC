import { Platform, PermissionsAndroid } from 'react-native';
import {
    getMessaging,
    getToken,
    requestPermission,
    onMessage,
    onNotificationOpenedApp,
    getInitialNotification,
    onTokenRefresh,
    AuthorizationStatus,
    type RemoteMessage,
} from '@react-native-firebase/messaging';
import { apiPath } from '../environments/environment_urls';
import { fetchApi } from './api/httpService';
import { currentUserOrganizationId, getLatestAccessToken } from './auth/authSession';

export interface NotificationChatData {
    type?: 'PERSONAL_CHAT' | 'GROUP_CHAT' | 'BROADCAST' | string;
    senderUserOrganizationId?: string;
    senderName?: string;
    chatId?: string;
    groupId?: string;
    groupName?: string;
    broadcastId?: string;
    receiverUserOrganizationId?: string;
}

export interface InAppNotice {
    title: string;
    body: string;
    data: NotificationChatData;
}

/** The chat a notification belongs to, in the same form the open chat is tracked. */
export const chatKeyOf = (data: NotificationChatData) =>
    data.type === 'GROUP_CHAT' && data.groupId
        ? `group:${data.groupId}`
        : data.senderUserOrganizationId ?? null;

// A phone that switched organization may still get a notification for the old one.
const isForCurrentMembership = (data: NotificationChatData) => {
    const current = currentUserOrganizationId();
    return !data.receiverUserOrganizationId || !current || data.receiverUserOrganizationId === current;
};

export const requestNotificationPermission = async (): Promise<boolean> => {
    try {
        if (Platform.OS === 'android' && Platform.Version >= 33) {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
            );
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                return false;
            }
        }

        const messagingInstance = getMessaging();
        const authStatus = await requestPermission(messagingInstance);
        const enabled =
            authStatus === AuthorizationStatus.AUTHORIZED ||
            authStatus === AuthorizationStatus.PROVISIONAL;

        return enabled;
    } catch (error) {
        console.warn('Failed to request notification permission:', error);
        return false;
    }
};

export const getDeviceFcmToken = async (): Promise<string | null> => {
    try {
        const hasPermission = await requestNotificationPermission();
        if (!hasPermission) {
            return null;
        }

        const messagingInstance = getMessaging();
        const token = await getToken(messagingInstance);
        return token;
    } catch (error) {
        console.warn('[FCM] Error getting FCM token:', error);
        return null;
    }
};

export const registerDeviceTokenWithBackend = async (
    accessToken: string,
    fcmToken?: string
): Promise<void> => {
    try {
        if (!accessToken) return;

        const tokenToRegister = fcmToken || (await getDeviceFcmToken());
        if (!tokenToRegister) {
            return;
        }

        await fetchApi('POST', apiPath.device, accessToken, false, {
            fcmToken: tokenToRegister,
            deviceType: Platform.OS.toUpperCase(),
            deviceName: `${Platform.OS} device`,
        });

    } catch (error) {
        console.warn('[FCM] Failed to register device token with backend:', error);
    }
};

export const unregisterDeviceTokenFromBackend = async (
    accessToken: string,
    fcmToken: string
): Promise<void> => {
    try {
        if (!accessToken || !fcmToken) return;

        await fetchApi('DELETE', apiPath.device, accessToken, false, {
            fcmToken,
        });

    } catch (error) {
        console.warn('[FCM] Failed to unregister device token:', error);
    }
};

export const setupNotificationListeners = (
    onNotificationClick: (data: NotificationChatData) => void,
    getActiveChatKey?: () => string | null,
    onForegroundNotice?: (notice: InAppNotice) => void,
) => {
    const messagingInstance = getMessaging();
    const open = (remoteMessage: RemoteMessage | null) => {
        const data = remoteMessage?.data as NotificationChatData | undefined;
        if (data && isForCurrentMembership(data)) onNotificationClick(data);
    };

    // 1. In the foreground, live events already update the screens, so only a
    //    small banner is shown, and nothing for the chat that is open.
    const unsubscribeForeground = onMessage(messagingInstance, (remoteMessage: RemoteMessage) => {
        const data = (remoteMessage.data ?? {}) as NotificationChatData;
        if (!isForCurrentMembership(data)) return;
        const key = chatKeyOf(data);
        if (key && getActiveChatKey && getActiveChatKey() === key) return;
        if (remoteMessage.notification?.title) {
            onForegroundNotice?.({
                title: remoteMessage.notification.title,
                body: remoteMessage.notification.body || '',
                data,
            });
        }
    });

    // 2. Tapped while the app was in the background.
    const unsubscribeNotificationOpened = onNotificationOpenedApp(messagingInstance, open);

    // 3. Tapped while the app was closed.
    getInitialNotification(messagingInstance).then(open);

    // 4. A new token is registered against the current session.
    const unsubscribeTokenRefresh = onTokenRefresh(messagingInstance, (newToken: string) => {
        registerDeviceTokenWithBackend(getLatestAccessToken(), newToken);
    });

    return () => {
        unsubscribeForeground();
        unsubscribeNotificationOpened();
        unsubscribeTokenRefresh();
    };
};
