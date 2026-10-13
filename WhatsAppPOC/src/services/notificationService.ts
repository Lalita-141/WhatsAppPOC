import { Platform, PermissionsAndroid, Alert } from 'react-native';
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

export interface NotificationChatData {
    type?: string;
    senderUserOrganizationId?: string;
    senderName?: string;
    chatId?: string;
}

export const requestNotificationPermission = async (): Promise<boolean> => {
    try {
        if (Platform.OS === 'android' && Platform.Version >= 33) {
            const granted = await PermissionsAndroid.request(
                PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS
            );
            if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
                console.log('Android POST_NOTIFICATIONS permission denied');
                return false;
            }
        }

        const messagingInstance = getMessaging();
        const authStatus = await requestPermission(messagingInstance);
        const enabled =
            authStatus === AuthorizationStatus.AUTHORIZED ||
            authStatus === AuthorizationStatus.PROVISIONAL;

        console.log('Firebase messaging authorization status:', authStatus, 'enabled:', enabled);
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
        console.log('[FCM] Device FCM Token:', token);
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
            console.log('[FCM] No token available to register');
            return;
        }

        await fetchApi('POST', apiPath.device, accessToken, false, {
            fcmToken: tokenToRegister,
            deviceType: Platform.OS.toUpperCase(),
            deviceName: `${Platform.OS} device`,
        });

        console.log('[FCM] Device token registered with backend successfully');
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

        console.log('[FCM] Device token unregistered from backend successfully');
    } catch (error) {
        console.warn('[FCM] Failed to unregister device token:', error);
    }
};

export const setupNotificationListeners = (
    onNotificationClick: (data: NotificationChatData) => void,
    getActiveChatUserOrgId?: () => string | null
) => {
    const messagingInstance = getMessaging();

    // 1. Foreground message handler
    const unsubscribeForeground = onMessage(messagingInstance, (remoteMessage: RemoteMessage) => {
        console.log('[FCM] Foreground message received:', remoteMessage);

        const data = remoteMessage.data as NotificationChatData;
        const currentActiveChatId = getActiveChatUserOrgId ? getActiveChatUserOrgId() : null;

        // If the user is currently viewing this sender's chat, do not display in-app alert
        if (
            currentActiveChatId &&
            data?.senderUserOrganizationId &&
            String(currentActiveChatId) === String(data.senderUserOrganizationId)
        ) {
            console.log('[FCM] Foreground alert skipped: user is actively viewing this chat');
            return;
        }

        // In-app alert when receiving notification while app is in foreground
        if (remoteMessage.notification?.title) {
            Alert.alert(
                remoteMessage.notification.title,
                remoteMessage.notification.body || '',
                [
                    { text: 'Dismiss', style: 'cancel' },
                    {
                        text: 'Open',
                        onPress: () => {
                            if (data) onNotificationClick(data);
                        },
                    },
                ]
            );
        }
    });

    // 2. Background notification clicked (app was minimized/backgrounded)
    const unsubscribeNotificationOpened = onNotificationOpenedApp(
        messagingInstance,
        (remoteMessage: RemoteMessage) => {
            console.log('[FCM] Notification caused app to open from background:', remoteMessage);
            if (remoteMessage.data) {
                onNotificationClick(remoteMessage.data as NotificationChatData);
            }
        }
    );

    // 3. Terminated notification clicked (app was completely closed/killed)
    getInitialNotification(messagingInstance).then((remoteMessage) => {
        if (remoteMessage) {
            console.log('[FCM] Notification caused app to open from quit state:', remoteMessage);
            if (remoteMessage.data) {
                onNotificationClick(remoteMessage.data as NotificationChatData);
            }
        }
    });

    // 4. Token refresh listener
    const unsubscribeTokenRefresh = onTokenRefresh(messagingInstance, (newToken: string) => {
        console.log('[FCM] Token refreshed:', newToken);
    });

    return () => {
        unsubscribeForeground();
        unsubscribeNotificationOpened();
        unsubscribeTokenRefresh();
    };
};
