import { Router } from "express";

import {
  profileSetupController,
  getMyProfileController,
  updateProfileController
} from "./user.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = Router();

router.post(
  "/profile",
  profileSetupController,
);

router.get('/getProfile', authenticate, getMyProfileController);

router.put('/updateProfile', authenticate, updateProfileController);

export default router