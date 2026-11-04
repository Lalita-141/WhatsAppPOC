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
import {
  deleteAccountController,
  profilePhotoController,
  notificationSettingsController,
  getPrivacyController,
  updatePrivacyController,
} from "../account/account.controller.js";
import {
  blockController,
  listBlockedController,
  reportController,
  unblockController,
} from "../safety/safety.controller.js";
import { authenticateProfileSetup } from "../../middleware/profileSetup.middleware.js";
import { setupLimiter } from "../../middleware/rate-limit.middleware.js";

const router = Router();

router.post(
  "/profile",
  setupLimiter,
  authenticateProfileSetup,
  profileSetupController,
);

router.get('/getProfile', authenticate, getMyProfileController);

router.put('/updateProfile', authenticate, updateProfileController);

router.put('/photo', authenticate, profilePhotoController(false));
router.delete('/photo', authenticate, profilePhotoController(true));
router.get('/settings/notifications', authenticate, notificationSettingsController(false));
router.put('/settings/notifications', authenticate, notificationSettingsController(true));
router.get('/settings/privacy', authenticate, getPrivacyController);
router.put('/settings/privacy', authenticate, updatePrivacyController);
router.delete('/account', setupLimiter, authenticate, deleteAccountController);

router.get('/blocks', authenticate, listBlockedController);
router.post('/blocks', authenticate, blockController);
router.delete('/blocks/:userOrganizationId', authenticate, unblockController);
router.post('/reports', setupLimiter, authenticate, reportController);

router.post('/device', authenticate, registerDeviceController);
router.delete('/device', authenticate, unregisterDeviceController);

export default router;