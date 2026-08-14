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
  triggerMetadataAnalysisController,
  getMetadataCandidatesController,
  reviewMetadataCandidateController,
  triggerVersionConflictAnalysisController,
  getDocumentRelationshipsController,
  approveDocumentRelationshipController,
  rejectDocumentRelationshipController,
  getConflictFindingsController,
  resolveConflictFindingController,
  dismissConflictFindingController,
  getPendingReviewItemsController,
} from "./processing.controller.js";
import { createEntitlementGuard } from "../entitlement/middlewares/entitlement.middleware.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";
import indexingRoutes from "./indexing/indexing.routes.js";

const router = Router();

router.use(indexingRoutes);

// ── Entitlement guards ─────────────────────────────────────────────────────

const svc = getEntitlementService();

const ocrGuard = createEntitlementGuard(svc, {
  dimension: "ocrPagesPerMonth",
  amount: (req) => req.body.pageCount || 1,
  failMode: "fail-closed",
});

const ocrRetryGuard = createEntitlementGuard(svc, {
  dimension: "ocrPagesPerMonth",
  amount: (req) => req.body?.pageCount ?? 1,
  failMode: "fail-closed",
});

router.post(
  "/:id/ocr/trigger",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS, { allowScoped: true }),
  ocrGuard,
  triggerOcrController,
);

router.get(
  "/:id/ocr/pages",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ, { allowScoped: true }),
  getOcrPageResultsController,
);

router.get(
  "/:id/quality",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ, { allowScoped: true }),
  getDocumentQualityController,
);

router.post(
  "/:id/quality/assess",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ, { allowScoped: true }),
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW, { allowScoped: true }),
  assessDocumentQualityController,
);

router.post(
  "/:id/quality/review",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ, { allowScoped: true }),
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW, { allowScoped: true }),
  reviewDocumentQualityController,
);

router.post(
  "/:id/ocr/retry",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS, { allowScoped: true }),
  ocrRetryGuard,
  retryOcrController,
);

router.get(
  "/ocr/usage",
  authenticate,
  tenantScoping,
  requirePermission(Permission.BILLING_READ),
  getOcrUsageSummaryController,
);

router.post(
  "/:id/metadata/analyze",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS, { allowScoped: true }),
  triggerMetadataAnalysisController,
);

router.get(
  "/:id/metadata/candidates",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ, { allowScoped: true }),
  getMetadataCandidatesController,
);

router.post(
  "/metadata/candidates/:candidateId/review",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  reviewMetadataCandidateController,
);

router.post(
  "/:id/version-conflict/analyze",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  triggerVersionConflictAnalysisController,
);

router.get(
  "/:id/relationships",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getDocumentRelationshipsController,
);

router.post(
  "/relationships/:relationshipId/approve",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  approveDocumentRelationshipController,
);

router.post(
  "/relationships/:relationshipId/reject",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  rejectDocumentRelationshipController,
);

router.get(
  "/:id/conflicts",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getConflictFindingsController,
);

router.post(
  "/conflicts/:conflictId/resolve",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  resolveConflictFindingController,
);

router.post(
  "/conflicts/:conflictId/dismiss",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  dismissConflictFindingController,
);

router.get(
  "/review/pending",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  getPendingReviewItemsController,
);

export default router;
