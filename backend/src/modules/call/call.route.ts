import { NextFunction, Response, Router } from "express";
import { authenticate, AuthRequest } from "../../middleware/auth.middleware.js";
import { callHistory, iceServers } from "./call.service.js";

const router = Router();

router.get("/", authenticate, async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
        res.json({ success: true, message: "Call history", data: await callHistory(req.user!.userOrganizationId, req.query.cursor) });
    } catch (error) {
        next(error);
    }
});

router.get("/ice-servers", authenticate, (req: AuthRequest, res: Response) => {
    res.json({ success: true, message: "ICE servers", data: iceServers(req.user!.userOrganizationId) });
});

export default router;
