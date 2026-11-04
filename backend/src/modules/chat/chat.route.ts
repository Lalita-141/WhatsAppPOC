import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";

import {
    checkContactsController,
    getChatContactsController,
} from "./chat.controller.js";
import messageRoutes from "./messages/message.route.js";

const router = Router();

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

router.use("/", messageRoutes);

export default router;
