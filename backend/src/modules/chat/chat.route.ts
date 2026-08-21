import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";

import {
    checkContactsController,
    getChatContactsController,
    sendPersonalMessageController,
} from "./chat.controller.js";
import conversationRoutes from "./conversation/conversation.route.js";
import personalRoutes from "./personal/personal.route.js";

const router = Router();

router.post(
    "/personal-chat/send",
    authenticate,
    sendPersonalMessageController,
);


router.post(
    "/contacts/check",
    authenticate,
    checkContactsController,
);

router.get(
    "/contacts",
    authenticate,
    getChatContactsController,
);

router.use("/", conversationRoutes);

router.use(
    "/",
    personalRoutes,
);
export default router;