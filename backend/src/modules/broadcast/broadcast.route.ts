import { NextFunction, Response, Router } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth.middleware.js";
import { ApiError } from "../../utils/api-error.js";
import { toMessageDto } from "../chat/messages/message.service.js";
import * as broadcasts from "./broadcast.service.js";

const router = Router();

type Handler = (req: AuthRequest) => Promise<{ status?: number; message: string; data?: unknown }>;
const handle = (handler: Handler) => async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        const { status = 200, message, data } = await handler(req);
        res.status(status).json({ success: true, message, ...(data !== undefined ? { data } : {}) });
    } catch (error) {
        next(error);
    }
};

const id = (value: unknown) => {
    const text = Array.isArray(value) ? value[0] : value;
    if (typeof text !== "string" || !/^\d{1,20}$/.test(text)) throw new ApiError(400, "INVALID_ID", "Invalid ID");
    return BigInt(text);
};

const sender = (req: AuthRequest) => ({
    userOrganizationId: req.user!.userOrganizationId,
    organizationId: req.user!.organizationId,
});

router.get("/targets", authenticate, handle(async (req) => ({ message: "Broadcast targets", data: await broadcasts.broadcastTargets(sender(req)) })));
router.get("/inbox", authenticate, handle(async (req) => ({ message: "Announcements", data: await broadcasts.inbox(req.user!.userOrganizationId, req.query.cursor) })));
router.get("/", authenticate, handle(async (req) => ({ message: "Sent broadcasts", data: await broadcasts.sentBroadcasts(sender(req), req.query.cursor) })));
router.post("/", authenticate, handle(async (req) => ({ status: 201, message: "Broadcast sent", data: await broadcasts.createBroadcast(sender(req), req.body) })));
router.get("/:id/stats", authenticate, handle(async (req) => ({ message: "Broadcast statistics", data: await broadcasts.stats(sender(req), id(req.params.id)) })));
router.post("/:id/read", authenticate, handle(async (req) => {
    await broadcasts.markRead(req.user!.userOrganizationId, id(req.params.id));
    return { message: "Marked as read" };
}));
router.post("/:id/reply", authenticate, handle(async (req) => {
    const message = await broadcasts.reply(req.user!.userOrganizationId, id(req.params.id), req.body?.message);
    return { status: 201, message: "Reply sent", data: toMessageDto(message, req.user!.userOrganizationId) };
}));

export default router;
