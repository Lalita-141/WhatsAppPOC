import { Router } from "express";
import { authenticate } from "../../../middleware/auth.middleware.js";
import {
    edit,
    forward,
    history,
    listConversations,
    patchConversation,
    pin,
    pinned,
    react,
    remove,
    searchMessages,
    send,
    star,
    starred,
    sync,
} from "./message.controller.js";

const router = Router();

router.get("/conversations", authenticate, listConversations);
router.patch("/conversations/:peerId", authenticate, patchConversation);

router.get("/personal/:userOrganizationId/messages", authenticate, history);
router.get("/personal/:userOrganizationId/pinned", authenticate, pinned);
router.post("/personal-chat/send", authenticate, send);

router.patch("/messages/:id", authenticate, edit);
router.delete("/messages/:id", authenticate, remove);
router.put("/messages/:id/reaction", authenticate, react((req) => req.body?.emoji));
router.delete("/messages/:id/reaction", authenticate, react(() => null));
router.put("/messages/:id/star", authenticate, star(true));
router.delete("/messages/:id/star", authenticate, star(false));
router.put("/messages/:id/pin", authenticate, pin(true));
router.delete("/messages/:id/pin", authenticate, pin(false));
router.post("/messages/:id/forward", authenticate, forward);

router.get("/starred", authenticate, starred);
router.get("/search", authenticate, searchMessages);
router.get("/sync", authenticate, sync);

export default router;
