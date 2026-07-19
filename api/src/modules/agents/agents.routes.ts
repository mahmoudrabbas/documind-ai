import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  startRunController,
  getRunController,
  listRunsController,
  resumeApprovalController,
  listApprovalsController,
  expireApprovalsController,
  listRunsAdminController,
  getRunAdminController,
} from "./agents.controller.js";

const router = Router();

router.use(authenticate);
router.use(tenantScoping);

router.post("/runs", requirePermission(Permission.CHAT_CREATE), startRunController);
router.get("/runs", requirePermission(Permission.CHAT_READ), listRunsController);
router.get("/runs/:runId", requirePermission(Permission.CHAT_READ), getRunController);
router.post(
  "/runs/:runId/approvals/:approvalId/resume",
  requirePermission(Permission.CHAT_READ),
  requirePermission(Permission.CHAT_CREATE),
  resumeApprovalController,
);
router.get("/approvals", requirePermission(Permission.CHAT_READ), listApprovalsController);
router.post("/approvals/expire", requirePermission(Permission.CHAT_DELETE), expireApprovalsController);

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(requirePlatformTenant);
adminRouter.use(requirePermission(Permission.CHAT_READ));
adminRouter.get("/runs", listRunsAdminController);
adminRouter.get("/runs/:runId", getRunAdminController);

export { router as agentsRoutes, adminRouter as agentsAdminRoutes };
