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
  requirePermission(Permission.DOCUMENTS_READ, { allowScoped: true }),
  getProcessingStatusController,
);

router.get(
  "/:id/processing/history",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ, { allowScoped: true }),
  getProcessingHistoryController,
);

router.post(
  "/:id/processing/initiate",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS, { allowScoped: true }),
  initiateProcessingController,
);

router.post(
  "/:id/processing/retry",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS, { allowScoped: true }),
  retryProcessingStageController,
);

router.post(
  "/:id/processing/reprocess",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS, { allowScoped: true }),
  reprocessDocumentController,
);

router.post(
  "/:id/processing/cancel",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS, { allowScoped: true }),
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
