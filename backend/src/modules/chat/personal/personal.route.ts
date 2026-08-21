import { Router } from "express";

import { authenticate } from "../../../middleware/auth.middleware.js";

import {
    getPersonalChatHistoryController,
} from "./personal.controller.js";


const router = Router();


router.get(
    "/personal/:userOrganizationId/messages",
    authenticate,
    getPersonalChatHistoryController,
);


export default router;