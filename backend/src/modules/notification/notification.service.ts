import { getFirebaseAdmin } from "../../config/firebase.js";
import {
    getActiveDevicesByUserOrganizationId,
    deleteStaleDeviceTokens,
} from "../device/device.repository.js";

export interface SendPushNotificationParams {
    receiverUserOrganizationId: bigint;
    senderUserOrganizationId: bigint;
    senderName: string;
    messageText: string;
    chatId: string;
}

export const sendPersonalChatPushNotification = async ({
    receiverUserOrganizationId,
    senderUserOrganizationId,
    senderName,
    messageText,
    chatId,
}: SendPushNotificationParams) => {
    try {
        const admin = getFirebaseAdmin();
        if (!admin) {
            console.warn("[PushNotification] Firebase Admin not initialized, skipping notification");
            return;
        }

        const devices = await getActiveDevicesByUserOrganizationId(receiverUserOrganizationId);
        if (!devices || devices.length === 0) {
            console.log(`[PushNotification] No active devices found for receiver ${receiverUserOrganizationId}`);
            return;
        }

        const tokens = devices.map((d) => d.fcm_token);

        const payload = {
            tokens,
            notification: {
                title: senderName || "New Message",
                body: messageText || "Sent a message",
            },
            data: {
                type: "PERSONAL_CHAT",
                senderUserOrganizationId: senderUserOrganizationId.toString(),
                senderName: senderName || "",
                chatId: chatId.toString(),
            },
            android: {
                priority: "high" as const,
                notification: {
                    channelId: "chat_messages",
                    sound: "default",
                },
            },
            apns: {
                payload: {
                    aps: {
                        sound: "default",
                        badge: 1,
                    },
                },
            },
        };

        const response = await admin.messaging().sendEachForMulticast(payload);
        console.log(
            `[PushNotification] Sent to ${devices.length} devices (success: ${response.successCount}, failure: ${response.failureCount})`,
        );

        // Collect and cleanup stale/unregistered tokens
        if (response.failureCount > 0) {
            const staleTokens: string[] = [];
            response.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errorCode = resp.error?.code;
                    if (
                        errorCode === "messaging/registration-token-not-registered" ||
                        errorCode === "messaging/invalid-registration-token"
                    ) {
                        staleTokens.push(tokens[idx]);
                    }
                }
            });

            if (staleTokens.length > 0) {
                console.log(`[PushNotification] Cleaning up ${staleTokens.length} stale FCM tokens`);
                await deleteStaleDeviceTokens(staleTokens);
            }
        }
    } catch (error) {
        console.error("[PushNotification] Error sending push notification:", error);
    }
};
