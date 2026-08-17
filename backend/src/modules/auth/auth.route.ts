import { Router } from "express";
import { getMeController, sendOtpController , verifyOtpController} from "./auth.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = Router();

router.post("/send-otp", sendOtpController);
router.post("/verify-otp", verifyOtpController);
router.get(
  "/me",
  authenticate,
  getMeController,
);


export default router;