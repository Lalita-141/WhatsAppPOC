import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";

import {
    checkContactsController,
    getChatContactsController,
    sendPersonalMessageController,
} from "./chat.controller.js";

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

export default router;