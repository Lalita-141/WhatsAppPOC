import { NextFunction, Response } from "express";
import { AuthRequest } from "../../../middleware/auth.middleware.js";
import { ApiError } from "../../../utils/api-error.js";
import { deliverNewMessage, emitMessageUpdated, emitToMember } from "../../../socket/delivery.js";
import {
    deleteMessage,
    editMessage,
    forwardableContent,
    getHistory,
    getPinned,
    getStarred,
    parseCursor,
    parseLimit,
    pinMessage,
    reactToMessage,
    search,
    sendMessage,
    starMessage,
    syncSince,
    toMessageDto,
} from "./message.service.js";
import { getConversations, updateConversation } from "../conversation/conversation.service.js";
import { forwardText } from "../forward.service.js";

type Handler = (req: AuthRequest) => Promise<{ status?: number; message: string; data?: unknown }>;

const handle = (handler: Handler) => async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { status = 200, message, data } = await handler(req);
        res.status(status).json({ success: true, message, ...(data !== undefined ? { data } : {}) });
    } catch (error) {
        next(error);
    }
};

const idParam = (value: unknown, name = "id") => {
    const text = Array.isArray(value) ? value[0] : value;
    if (typeof text !== "string" || !/^\d{1,20}$/.test(text)) {
        throw new ApiError(400, "INVALID_ID", `Invalid ${name}`);
    }
    return BigInt(text);
};

const me = (req: AuthRequest) => req.user!.userOrganizationId;

export const listConversations = handle(async (req) => ({
    message: "Conversations fetched successfully",
    data: await getConversations(me(req), req.query),
}));

export const patchConversation = handle(async (req) => {
    const owner = me(req);
    const conversation = await updateConversation(owner, idParam(req.params.peerId, "user"), req.body);
    emitToMember(owner, "conversation:updated", { peerUserOrganizationId: conversation.userOrganizationId });
    return { message: "Conversation updated", data: conversation };
});

export const history = handle(async (req) => ({
    message: "Chat history fetched successfully",
    data: await getHistory(
        me(req),
        idParam(req.params.userOrganizationId, "user"),
        parseLimit(req.query.limit),
        parseCursor(req.query.beforeChatId),
    ),
}));

export const pinned = handle(async (req) => ({
    message: "Pinned messages fetched successfully",
    data: await getPinned(me(req), idParam(req.params.userOrganizationId, "user")),
}));

export const send = handle(async (req) => {
    const sender = me(req);
    const { message, created } = await sendMessage({
        sender,
        receiver: idParam(req.body?.receiverUserOrganizationId, "receiver"),
        message: req.body?.message,
        clientMessageId: req.body?.clientMessageId,
        replyToMessageId: req.body?.replyToMessageId ? idParam(req.body.replyToMessageId, "reply") : null,
        mediaId: req.body?.mediaId ? idParam(req.body.mediaId, "media") : null,
    });

    if (created) {
        deliverNewMessage(message);
    }

    return {
        status: created ? 201 : 200,
        message: "Message sent successfully",
        data: toMessageDto(message, sender),
    };
});

export const edit = handle(async (req) => {
    const row = await editMessage(idParam(req.params.id), me(req), req.body?.message);
    emitMessageUpdated(row, "edited");
    return { message: "Message edited", data: toMessageDto(row, me(req)) };
});

export const remove = handle(async (req) => {
    const actor = me(req);
    const result = await deleteMessage(idParam(req.params.id), actor, req.query.scope);

    if (result.scope === "me") {
        emitToMember(actor, "message:removed", { messageId: result.row.chat_id.toString() });
    } else {
        emitMessageUpdated(result.row, "deleted");
    }

    return { message: "Message deleted", data: { scope: result.scope } };
});

export const react = (emojiFrom: (req: AuthRequest) => unknown) =>
    handle(async (req) => {
        const { row, reactions } = await reactToMessage(idParam(req.params.id), me(req), emojiFrom(req));
        emitMessageUpdated({ ...row, reactions: reactions.map((r) => ({ emoji: r.emoji, user_organization_id: BigInt(r.userOrganizationId) })) }, "reaction");
        return { message: "Reaction saved", data: { reactions } };
    });

export const star = (starred: boolean) =>
    handle(async (req) => {
        const dto = await starMessage(idParam(req.params.id), me(req), starred);
        emitToMember(me(req), "message:starred", { messageId: dto.messageId, isStarred: starred });
        return { message: starred ? "Message starred" : "Message unstarred", data: dto };
    });

export const pin = (pinnedState: boolean) =>
    handle(async (req) => {
        const row = await pinMessage(idParam(req.params.id), me(req), pinnedState);
        emitMessageUpdated(row, pinnedState ? "pinned" : "unpinned");
        return { message: pinnedState ? "Message pinned" : "Message unpinned", data: toMessageDto(row, me(req)) };
    });

export const forward = handle(async (req) => {
    const actor = me(req);
    const source = await forwardableContent(idParam(req.params.id), actor);
    return { status: 201, message: "Message forwarded", data: await forwardText(actor, source, req.body) };
});

export const starred = handle(async (req) => {
    const limit = parseLimit(req.query.limit);
    return { message: "Starred messages fetched", data: await getStarred(me(req), limit, parseCursor(req.query.cursor)) };
});

export const searchMessages = handle(async (req) => {
    const limit = parseLimit(req.query.limit);
    const peer = req.query.with ? idParam(req.query.with, "user") : undefined;
    return {
        message: "Search results",
        data: await search(me(req), req.query.q, limit, peer, parseCursor(req.query.cursor)),
    };
});

export const sync = handle(async (req) => ({
    message: "Messages since the given ID",
    data: await syncSince(me(req), parseCursor(req.query.after) ?? 0n, parseLimit(req.query.limit, 200)),
}));
