import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  triggerOcrController,
  getOcrPageResultsController,
  getDocumentQualityController,
  assessDocumentQualityController,
  reviewDocumentQualityController,
  retryOcrController,
  getOcrUsageSummaryController,
} from "./processing.controller.js";

const router = Router();

router.post(
  "/:id/ocr/trigger",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  triggerOcrController,
);

router.get(
  "/:id/ocr/pages",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getOcrPageResultsController,
);

router.get(
  "/:id/quality",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getDocumentQualityController,
);

router.post(
  "/:id/quality/assess",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  assessDocumentQualityController,
);

router.post(
  "/:id/quality/review",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  reviewDocumentQualityController,
);

router.post(
  "/:id/ocr/retry",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  retryOcrController,
);

router.get(
  "/ocr/usage",
  authenticate,
  tenantScoping,
  requirePermission(Permission.BILLING_READ),
  getOcrUsageSummaryController,
);

export default router;
