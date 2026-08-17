import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";

import {
  setupOrganizationController,
} from "./organization.controller.js";

const router = Router();

router.post(
  "/setup",
  authenticate,
  setupOrganizationController,
);

export default router;