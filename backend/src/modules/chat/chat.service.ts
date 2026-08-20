import { ApiError } from "../../utils/api-error.js";
import prisma from "../../config/database.js";
import { createPersonalMessage, getUsersForChat } from "./chat.repository.js";
import { normalizeIndianPhoneNumber } from "../../utils/phone.js";

import { findUsersByMobileNumbers } from "./chat.repository.js";

// Send Pesional message
export const sendPersonalMessage = async (
    senderUserOrganizationId: bigint,
    receiverUserOrganizationId: string,
    message: string,
    created_by: bigint,
    media: string,


) => {
    const receiverId = BigInt(receiverUserOrganizationId);

    // 1. Check receiver exists
    const receiver = await prisma.user_organization.findUnique({
        where: {
            user_organization_id: receiverId,
        },
    });

    if (!receiver) {
        throw new ApiError(
            404,
            "RECEIVER_NOT_FOUND",
            "Receiver not found",
        );
    }

    // 2. Check sender and receiver belong to same organization
    const sender = await prisma.user_organization.findUnique({
        where: {
            user_organization_id: senderUserOrganizationId,
        },
    });

    if (!sender) {
        throw new ApiError(
            404,
            "SENDER_NOT_FOUND",
            "Sender organization membership not found",
        );
    }

    if (sender.org_id !== receiver.org_id) {
        throw new ApiError(
            403,
            "INVALID_ORGANIZATION",
            "You cannot send a message to this user",
        );
    }

    // 3. Prevent sending message to yourself
    if (
        senderUserOrganizationId === receiverId
    ) {
        throw new ApiError(
            400,
            "INVALID_RECEIVER",
            "You cannot send a message to yourself",
        );
    }

    // 4. Save message
    const chat = await createPersonalMessage({
        senderUserOrganizationId,
        receiverUserOrganizationId: receiverId,
        message: message.trim(),
        createdBy: senderUserOrganizationId,
        media: "text",
        // messageType: "personal",

    });

    // 5. Return safe response
    return {
        chatId: chat.chat_id.toString(),

        senderUserOrganizationId:
            chat.sender_user_organization_id.toString(),

        receiverUserOrganizationId:
            chat.receiver_user_organization_id.toString(),

        message: chat.message,

        status: chat.status,

        sendTime: chat.send_time,
    };
};



// chcek contacts from phone
export const checkContacts = async (
    currentUserOrganizationId: bigint,
    contacts: {
        name: string;
        phone: string;
    }[],
) => {

    // Remove duplicate phone numbers
    const uniquePhones = [
        ...new Set(
            contacts
                .map((contact) => {
                    try {
                        return normalizeIndianPhoneNumber(contact.phone);
                    } catch {
                        return null;
                    }
                })
                .filter(Boolean) as string[],
        ),
    ];

    if (uniquePhones.length === 0) {
        throw new ApiError(
            400,
            "CONTACTS_REQUIRED",
            "At least one contact is required",
        );
    }

    // Find registered users
    const users =
        await findUsersByMobileNumbers(uniquePhones);

    const registeredPhones = new Set(
        users.map((user) => user.mobile_no),
    );

    const registered = users
        .filter((user) => {
            return user.user_organization.some(
                (organization) =>
                    organization.org_id ===
                    currentUserOrganizationId,
            );
        })
        .map((user) => {
            const organization =
                user.user_organization[0];

            return {
                userId: user.user_id.toString(),

                userOrganizationId:
                    organization?.user_organization_id.toString(),

                name: [user.first_name, user.last_name]
                    .filter(Boolean)
                    .join(" "),

                phone: user.mobile_no,
            };
        });

    const notRegistered = contacts
        .filter((contact) => {
            try {
                return !registeredPhones.has(
                    normalizeIndianPhoneNumber(contact.phone)
                );
            } catch {
                return true;
            }
        })
        .map((contact) => ({
            name: contact.name,
            phone: contact.phone,
        }));

    return {
        registered,
        notRegistered,
    };
};


//form get chat list 
export const getChatContacts = async (
    organizationId: bigint,
    currentUserId: bigint,
) => {

    const users = await getUsersForChat(
        organizationId,
        currentUserId,
    );

    return users.map((user) => {

        const organization =
            user.user_organization[0];

        return {
            userId: user.user_id.toString(),

            userOrganizationId:
                organization?.user_organization_id.toString(),

            firstName: user.first_name,

            lastName: user.last_name,

            name: [
                user.first_name,
                user.last_name,
            ]
                .filter(Boolean)
                .join(" "),

            mobileNo: user.mobile_no,

            profilePhoto: user.profile_photo,

            about: user.about,

            lastSeen: user.last_seen,
        };
    });
};