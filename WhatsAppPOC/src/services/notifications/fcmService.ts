import {
    getMessaging,
    getToken,
    requestPermission,
    registerDeviceForRemoteMessages,
} from '@react-native-firebase/messaging';

const messaging = getMessaging();

export const requestNotificationPermission = async () => {
    try {
        await registerDeviceForRemoteMessages(messaging);

        const token = await getToken(messaging);

        console.log('🔥 FCM TOKEN:', token);

        return token;
    } catch (error) {
        console.error('Notification permission error:', error);
        return null;
    }
};

export const getFCMToken = async () => {
    try {
        const token = await getToken(messaging);

        console.log('🔥 FCM TOKEN:', token);

        return token;
    } catch (error) {
        console.error('FCM token error:', error);
        return null;
    }
};