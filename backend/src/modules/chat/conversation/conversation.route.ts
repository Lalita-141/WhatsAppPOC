import { Router } from "express";
import { authenticate } from "../../../middleware/auth.middleware.js";
import { getConversationsController } from "./conversation.controller.js";

const router = Router();

router.get(
    "/conversations",
    authenticate,
    getConversationsController,
);

export default router;