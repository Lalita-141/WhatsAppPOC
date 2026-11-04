import { Router } from "express";
import {
  getMeController,
  listSessionsController,
  logoutAllController,
  logoutController,
  refreshController,
  revokeRefreshTokenController,
  revokeSessionController,
  sendOtpController,
  verifyOtpController,
} from "./auth.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";
import {
  listOrganizationsController,
  switchOrganizationController,
} from "../account/account.controller.js";
import {
  refreshLimiter,
  sendOtpLimiter,
  verifyOtpLimiter,
} from "../../middleware/rate-limit.middleware.js";

const router = Router();

router.post("/send-otp", sendOtpLimiter, sendOtpController);
router.post("/verify-otp", verifyOtpLimiter, verifyOtpController);
router.post("/refresh", refreshLimiter, refreshController);
router.get(
  "/me",
  authenticate,
  getMeController,
);
router.post("/revoke", refreshLimiter, revokeRefreshTokenController);
router.post("/logout", authenticate, logoutController);
router.post("/logout-all", authenticate, logoutAllController);
router.get("/sessions", authenticate, listSessionsController);
router.delete("/sessions/:sessionId", authenticate, revokeSessionController);
router.get("/organizations", authenticate, listOrganizationsController);
router.post(
  "/switch-organization",
  refreshLimiter,
  authenticate,
  switchOrganizationController,
);


export default router;
