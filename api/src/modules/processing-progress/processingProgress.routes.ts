import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  getProcessingStatusController,
  getProcessingHistoryController,
  initiateProcessingController,
  retryProcessingStageController,
  reprocessDocumentController,
  cancelProcessingController,
  getFailedProcessingDashboardController,
  getAllFailedProcessingDashboardController,
} from "./processingProgress.controller.js";

const router = Router();

router.get(
  "/:id/processing/status",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getProcessingStatusController,
);

router.get(
  "/:id/processing/history",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getProcessingHistoryController,
);

router.post(
  "/:id/processing/initiate",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  initiateProcessingController,
);

router.post(
  "/:id/processing/retry",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  retryProcessingStageController,
);

router.post(
  "/:id/processing/reprocess",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  reprocessDocumentController,
);

router.post(
  "/:id/processing/cancel",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  cancelProcessingController,
);

router.get(
  "/processing/failed",
  authenticate,
  tenantScoping,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  getFailedProcessingDashboardController,
);

router.get(
  "/processing/failed/all",
  authenticate,
  tenantScoping,
  requirePermission(Permission.COMPANY_SETTINGS_READ),
  getAllFailedProcessingDashboardController,
);

export default router;
