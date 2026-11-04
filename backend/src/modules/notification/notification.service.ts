import prisma from "../../config/database.js";
import { getFirebaseAdmin } from "../../config/firebase.js";
import { logger } from "../../config/logger.js";
import {
    getActiveDevicesByUserOrganizationId,
    deleteStaleDeviceTokens,
} from "../device/device.repository.js";

type MulticastSender = (payload: any) => Promise<{
    successCount: number;
    failureCount: number;
    responses: { success: boolean; error?: { code?: string } }[];
}>;

let testTransport: MulticastSender | null = null;

/** Tests capture outgoing pushes here instead of calling Firebase. */
export const usePushTransportForTests = (transport: MulticastSender | null) => {
    testTransport = transport;
};

export type PushCategory = "MESSAGE" | "GROUP" | "ANNOUNCEMENT" | "CALL";

const PREFERENCE: Record<PushCategory, "notify_messages" | "notify_groups" | "notify_announcements" | "notify_calls"> = {
    MESSAGE: "notify_messages",
    GROUP: "notify_groups",
    ANNOUNCEMENT: "notify_announcements",
    CALL: "notify_calls",
};

export interface PushMessage {
    receiverUserOrganizationId: bigint;
    category: PushCategory;
    title: string;
    body: string;
    data: Record<string, string>;
    channelId?: string;
    /** Notifications with the same thread replace or stack together on the phone. */
    thread?: string;
}

/** Sends one notification to every active device of a member and drops dead tokens. */
export const sendPushNotification = async ({
    receiverUserOrganizationId,
    category,
    title,
    body,
    data,
    channelId = "chat_messages",
    thread,
}: PushMessage) => {
    try {
        // The member's notification settings decide whether and what to show.
        const settings = await prisma.user_setting.findUnique({
            where: { user_organization_id: receiverUserOrganizationId },
            select: { notify_messages: true, notify_groups: true, notify_announcements: true, notify_calls: true, show_preview: true },
        });
        if (settings && !settings[PREFERENCE[category]]) {
            return;
        }
        if (settings && !settings.show_preview && category !== "CALL") {
            body = category === "ANNOUNCEMENT" ? "New announcement" : "New message";
        }

        const admin = getFirebaseAdmin();
        const send: MulticastSender | null =
            testTransport ?? (admin ? (payload) => admin.messaging().sendEachForMulticast(payload) : null);
        if (!send) {
            console.warn("[PushNotification] Firebase Admin not initialized, skipping notification");
            return;
        }

        const devices = await getActiveDevicesByUserOrganizationId(receiverUserOrganizationId);
        if (!devices || devices.length === 0) {
            console.log(`[PushNotification] No active devices found for receiver ${receiverUserOrganizationId}`);
            return;
        }

        const tokens = devices.map((d) => d.fcm_token);

        const response = await send({
            tokens,
            notification: { title, body },
            // The app checks receiverUserOrganizationId, so a phone that has
            // switched organization ignores a late notification for the old one.
            data: { ...data, receiverUserOrganizationId: receiverUserOrganizationId.toString() },
            android: {
                priority: "high" as const,
                notification: { channelId, sound: "default", ...(thread ? { tag: thread } : {}) },
            },
            apns: {
                payload: { aps: { sound: "default", ...(thread ? { "thread-id": thread } : {}) } },
            },
        });

        if (response.failureCount > 0) {
            const staleTokens: string[] = [];
            response.responses.forEach((resp, idx) => {
                const errorCode = resp.error?.code;
                if (
                    !resp.success &&
                    (errorCode === "messaging/registration-token-not-registered" ||
                        errorCode === "messaging/invalid-registration-token")
                ) {
                    staleTokens.push(tokens[idx]);
                }
            });

            if (staleTokens.length > 0) {
                await deleteStaleDeviceTokens(staleTokens);
            }
        }
    } catch (error) {
        logger.error({ err: error }, "Push notification failed");
    }
};

export interface SendPushNotificationParams {
    receiverUserOrganizationId: bigint;
    senderUserOrganizationId: bigint;
    senderName: string;
    messageText: string;
    chatId: string;
}

export const sendPersonalChatPushNotification = ({
    receiverUserOrganizationId,
    senderUserOrganizationId,
    senderName,
    messageText,
    chatId,
}: SendPushNotificationParams) =>
    sendPushNotification({
        receiverUserOrganizationId,
        category: "MESSAGE",
        thread: `chat:${senderUserOrganizationId}`,
        title: senderName || "New Message",
        body: messageText || "Sent a message",
        data: {
            type: "PERSONAL_CHAT",
            senderUserOrganizationId: senderUserOrganizationId.toString(),
            senderName: senderName || "",
            chatId: chatId.toString(),
        },
    });
