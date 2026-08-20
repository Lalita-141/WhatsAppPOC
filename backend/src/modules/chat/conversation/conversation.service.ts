import { findPersonalChatMessages, findUsersByUserOrganizationIds } from "./conversation.repository.js";


export const getConversations = async (
    currentUserOrganizationId: bigint,
) => {

    // --------------------------------------------------
    // 1. Get all messages involving current user
    // --------------------------------------------------

    const messages =
        await findPersonalChatMessages(
            currentUserOrganizationId,
        );


    // No conversations yet
    if (messages.length === 0) {
        return [];
    }


    // --------------------------------------------------
    // 2. Group messages by the other user
    // --------------------------------------------------

    const conversationMap = new Map<
        string,
        typeof messages
    >();


    for (const message of messages) {

        const otherUserOrganizationId =
            message.sender_user_organization_id ===
                currentUserOrganizationId
                ? message.receiver_user_organization_id
                : message.sender_user_organization_id;


        const key =
            otherUserOrganizationId.toString();


        if (!conversationMap.has(key)) {
            conversationMap.set(key, []);
        }


        conversationMap
            .get(key)!
            .push(message);
    }


    // --------------------------------------------------
    // 3. Get all other users
    // --------------------------------------------------

    const otherUserOrganizationIds = [
        ...conversationMap.keys(),
    ].map((id) => BigInt(id));


    const users =
        await findUsersByUserOrganizationIds(
            otherUserOrganizationIds,
        );


    // --------------------------------------------------
    // 4. Create user lookup
    // --------------------------------------------------

    const userMap = new Map(
        users.map((user) => [
            user.user_organization_id.toString(),
            user,
        ]),
    );


    // --------------------------------------------------
    // 5. Build response
    // --------------------------------------------------

    const conversations = [];


    for (const [
        userOrganizationId,
        chatMessages,
    ] of conversationMap.entries()) {

        const user =
            userMap.get(userOrganizationId);


        // Skip deleted/missing users
        if (!user) {
            continue;
        }


        const profile =
            user.user_master;


        // Messages were fetched DESC
        // therefore first message is latest
        const latestMessage =
            chatMessages[0];


        // ------------------------------------------------
        // 6. Unread messages
        // ------------------------------------------------

        const unreadCount =
            chatMessages.filter(
                (message) =>
                    message.receiver_user_organization_id ===
                    currentUserOrganizationId &&
                    message.status !== "SEEN",
            ).length;


        conversations.push({

            userOrganizationId:

                user.user_organization_id.toString(),


            userId:

                profile.user_id.toString(),


            name: [
                profile.first_name,
                profile.last_name,
            ]
                .filter(Boolean)
                .join(" "),


            firstName:
                profile.first_name,


            lastName:
                profile.last_name,


            mobileNo:
                profile.mobile_no,


            profilePhoto:
                profile.profile_photo,


            about:
                profile.about,


            lastSeen:
                profile.last_seen,


            lastMessage: {

                messageId:
                    latestMessage.chat_id.toString(),

                message:
                    latestMessage.message,

                media:
                    latestMessage.media,

                sendTime:
                    latestMessage.send_time,

                receiveTime:
                    latestMessage.receive_time,

                status:
                    latestMessage.status,

                isMine:
                    latestMessage.sender_user_organization_id ===
                    currentUserOrganizationId,
            },


            unreadCount,

        });
    }


    // --------------------------------------------------
    // 7. Newest conversation first
    // --------------------------------------------------

    conversations.sort(
        (a, b) =>
            new Date(
                b.lastMessage.sendTime,
            ).getTime() -
            new Date(
                a.lastMessage.sendTime,
            ).getTime(),
    );


    return conversations;
};