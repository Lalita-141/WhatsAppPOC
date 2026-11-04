import { Router } from "express";

import { authenticate } from "../../middleware/auth.middleware.js";
import { authenticateOrganizationSetup } from "../../middleware/organization-setup.middleware.js";
import { setupLimiter } from "../../middleware/rate-limit.middleware.js";

import {
  setupOrganizationController,
} from "./organization.controller.js";
import * as admin from "./admin.controller.js";

const router = Router();

router.post(
  "/setup",
  setupLimiter,
  authenticateOrganizationSetup,
  setupOrganizationController,
);

// Any member can read the settings (the app needs to know what is allowed).
// Every change below checks for the ADMIN role on the server.
router.get("/settings", authenticate, admin.getSettings);
router.put("/settings", authenticate, admin.putSettings);

router.get("/members", authenticate, admin.members);
router.patch("/members/:memberId", authenticate, admin.patchMember);
router.delete("/members/:memberId", authenticate, admin.deleteMember);

router.get("/departments", authenticate, admin.departments);
router.post("/departments", authenticate, admin.postDepartment);
router.delete("/departments/:departmentId", authenticate, admin.deleteDepartment);

router.get("/invites", authenticate, admin.invites);
router.post("/invites", setupLimiter, authenticate, admin.postInvite);
router.delete("/invites/:inviteId", authenticate, admin.deleteInvite);

router.get("/join-requests", authenticate, admin.joinRequests);
router.post("/join-requests/:requestId/approve", authenticate, admin.approveJoin);
router.post("/join-requests/:requestId/reject", authenticate, admin.rejectJoin);

router.get("/directory", authenticate, admin.directory);
router.get("/relationships", authenticate, admin.relationships);
router.post("/relationships", authenticate, admin.postRelationship);
router.post("/relationships/:relationshipId/approve", authenticate, admin.relationshipAction("approve"));
router.post("/relationships/:relationshipId/reject", authenticate, admin.relationshipAction("reject"));
router.post("/relationships/:relationshipId/revoke", authenticate, admin.relationshipAction("revoke"));

router.get("/audit-log", authenticate, admin.audit);

export default router;
