import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import {
  startRunController,
  getRunController,
  listRunsController,
  resumeApprovalController,
  listApprovalsController,
  expireApprovalsController,
  listRunsAdminController,
} from "./agents.controller.js";

const router = Router();

router.use(authenticate);
router.use(tenantScoping);

router.post("/runs", startRunController);
router.get("/runs", listRunsController);
router.get("/runs/:runId", getRunController);
router.post("/runs/:runId/approvals/:approvalId/resume", resumeApprovalController);
router.get("/approvals", listApprovalsController);
router.post("/approvals/expire", expireApprovalsController);

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(tenantScoping);
adminRouter.use(authorize("SUPER_ADMIN"));
adminRouter.use(requirePlatformTenant);
adminRouter.get("/runs", listRunsAdminController);
adminRouter.get("/runs/:runId", getRunController);

export { router as agentsRoutes, adminRouter as agentsAdminRoutes };
