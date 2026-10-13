import { Router } from "express";

import {
  profileSetupController,
  getMyProfileController,
  updateProfileController
} from "./user.controller.js";
import {
  registerDeviceController,
  unregisterDeviceController
} from "../device/device.controller.js";
import { authenticate } from "../../middleware/auth.middleware.js";

const router = Router();

router.post(
  "/profile",
  profileSetupController,
);

router.get('/getProfile', authenticate, getMyProfileController);

router.put('/updateProfile', authenticate, updateProfileController);

router.post('/device', authenticate, registerDeviceController);
router.delete('/device', authenticate, unregisterDeviceController);

export default router;