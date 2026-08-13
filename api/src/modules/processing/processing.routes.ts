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

/**
 * @openapi
 * /documents/{id}/ocr/trigger:
 *   post:
 *     summary: Trigger OCR processing
 *     description: Queues an OCR processing job for a document's pages. The
 *       document must belong to the requesting tenant. The job is processed
 *       asynchronously and entitlement usage is checked against the tenant's
 *       monthly OCR page quota before enqueueing.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [documentId]
 *             properties:
 *               documentId:
 *                 type: string
 *                 description: Id of the document to run OCR on
 *               version:
 *                 type: integer
 *                 description: Document version (defaults to the latest version)
 *               language:
 *                 type: string
 *                 enum: [ar, en, ar+en]
 *                 default: ar+en
 *               pageNumbers:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Pages to process (defaults to all pages)
 *     responses:
 *       202:
 *         description: OCR processing job queued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OCR processing job queued successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobId:
 *                       type: string
 *                     idempotencyKey:
 *                       type: string
 *       400:
 *         description: Validation error or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or entitlement limit reached
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/ocr/trigger",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  ocrGuard,
  triggerOcrController,
);

/**
 * @openapi
 * /documents/{id}/ocr/pages:
 *   get:
 *     summary: Get OCR page results
 *     description: Returns the OCR page results for a document. Each page
 *       includes the extracted text, confidence score, detected language,
 *       provider and processing status. An optional version query parameter
 *       selects a specific document version.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *       - in: query
 *         name: version
 *         schema:
 *           type: integer
 *         description: Document version (defaults to the latest version)
 *     responses:
 *       200:
 *         description: OCR page results
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     pages:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           pageNumber:
 *                             type: integer
 *                           text:
 *                             type: string
 *                           confidence:
 *                             type: number
 *                           status:
 *                             type: string
 *       400:
 *         description: Invalid document id or version parameter
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.get(
  "/:id/ocr/pages",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getOcrPageResultsController,
);

/**
 * @openapi
 * /documents/{id}/quality:
 *   get:
 *     summary: Get document quality assessment
 *     description: Returns the quality assessment for a document, including
 *       overall confidence, quality status, detected issues and per-page
 *       confidence values. An optional version query parameter selects a
 *       specific document version.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *       - in: query
 *         name: version
 *         schema:
 *           type: integer
 *         description: Document version (defaults to the latest version)
 *     responses:
 *       200:
 *         description: Document quality assessment
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     overallConfidence:
 *                       type: number
 *                     qualityStatus:
 *                       type: string
 *                     issues:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                           severity:
 *                             type: string
 *                           message:
 *                             type: string
 *                           pageNumber:
 *                             type: integer
 *                     requiresReview:
 *                       type: boolean
 *       400:
 *         description: Invalid document id or version parameter
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.get(
  "/:id/quality",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getDocumentQualityController,
);

/**
 * @openapi
 * /documents/{id}/quality/assess:
 *   post:
 *     summary: Assess document quality
 *     description: Runs a quality assessment over the document's OCR output
 *       and returns the computed quality metrics. Pages are evaluated for
 *       issues such as blank pages, garbled text, low confidence and broken
 *       tables, producing an overall quality status.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *       - in: query
 *         name: version
 *         schema:
 *           type: integer
 *         description: Document version (defaults to the latest version)
 *     responses:
 *       200:
 *         description: Quality assessment completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     overallConfidence:
 *                       type: number
 *                     qualityStatus:
 *                       type: string
 *                     summary:
 *                       type: string
 *                     requiresReview:
 *                       type: boolean
 *       400:
 *         description: Invalid document id or version parameter
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/quality/assess",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  assessDocumentQualityController,
);

/**
 * @openapi
 * /documents/{id}/quality/review:
 *   post:
 *     summary: Review document quality
 *     description: Records a human review decision on a document's quality
 *       assessment. The decision can approve, reject or request a retry of
 *       the OCR output, with optional notes and affected page numbers.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *       - in: query
 *         name: version
 *         schema:
 *           type: integer
 *         description: Document version (defaults to the latest version)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision]
 *             properties:
 *               decision:
 *                 type: string
 *                 enum: [approved, rejected, retry]
 *               notes:
 *                 type: string
 *                 description: Review notes (max 2000 characters)
 *               pageNumbers:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Page numbers covered by the review
 *     responses:
 *       200:
 *         description: Quality review recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     qualityStatus:
 *                       type: string
 *                     reviewDecision:
 *                       type: string
 *                     reviewedBy:
 *                       type: string
 *       400:
 *         description: Validation error or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/quality/review",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  reviewDocumentQualityController,
);

/**
 * @openapi
 * /documents/{id}/ocr/retry:
 *   post:
 *     summary: Retry OCR processing
 *     description: Queues a retry job for failed OCR pages of a document.
 *       Only the specified page numbers are reprocessed, with an optional
 *       version override. Entitlement usage is checked against the tenant's
 *       monthly OCR page quota before enqueueing.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               pageNumbers:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Pages to retry
 *               version:
 *                 type: integer
 *                 description: Document version (defaults to the latest version)
 *     responses:
 *       202:
 *         description: OCR retry job queued successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: OCR retry job queued successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     jobId:
 *                       type: string
 *                     idempotencyKey:
 *                       type: string
 *       400:
 *         description: Validation error or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or entitlement limit reached
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/ocr/retry",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  ocrRetryGuard,
  retryOcrController,
);

/**
 * @openapi
 * /documents/ocr/usage:
 *   get:
 *     summary: Get OCR usage summary
 *     description: Returns the tenant's OCR usage summary for the current
 *       monthly period, including the number of pages used and the period
 *       window. Requires billing read permission.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: OCR usage summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     pagesUsed:
 *                       type: integer
 *                     periodStart:
 *                       type: string
 *                       format: date-time
 *                     periodEnd:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get(
  "/ocr/usage",
  authenticate,
  tenantScoping,
  requirePermission(Permission.BILLING_READ),
  getOcrUsageSummaryController,
);

/**
 * @openapi
 * /documents/{id}/metadata/analyze:
 *   post:
 *     summary: Trigger metadata analysis
 *     description: Queues a metadata analysis for a document. The analysis
 *       proposes values for metadata fields such as title, document type,
 *       department and classification, saving them as reviewable candidates.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Document version (defaults to the latest version)
 *     responses:
 *       200:
 *         description: Metadata analysis completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: string
 *                     candidates:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           fieldType:
 *                             type: string
 *                           proposedValue:
 *                             type: object
 *                           confidence:
 *                             type: number
 *                           status:
 *                             type: string
 *       400:
 *         description: Validation error or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document or version not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/metadata/analyze",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  triggerMetadataAnalysisController,
);

/**
 * @openapi
 * /documents/{id}/metadata/candidates:
 *   get:
 *     summary: Get metadata candidates
 *     description: Returns the metadata candidates proposed for a document.
 *       Each candidate includes the field type, proposed value, confidence,
 *       supporting evidence and current review status.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     responses:
 *       200:
 *         description: Metadata candidates for the document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       fieldType:
 *                         type: string
 *                       proposedValue:
 *                         type: object
 *                       confidence:
 *                         type: number
 *                       status:
 *                         type: string
 *                       agentName:
 *                         type: string
 *       400:
 *         description: Invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.get(
  "/:id/metadata/candidates",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getMetadataCandidatesController,
);

/**
 * @openapi
 * /documents/metadata/candidates/{candidateId}/review:
 *   post:
 *     summary: Review metadata candidate
 *     description: Records a reviewer decision on a metadata candidate. The
 *       reviewer can approve or reject the proposed value, optionally
 *       supplying an applied value and notes.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: candidateId
 *         required: true
 *         schema:
 *           type: string
 *         description: Metadata candidate id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision]
 *             properties:
 *               decision:
 *                 type: string
 *                 enum: [approved, rejected]
 *               appliedValue:
 *                 type: object
 *                 description: Value to apply when approving
 *               notes:
 *                 type: string
 *                 description: Review notes (max 2000 characters)
 *     responses:
 *       200:
 *         description: Metadata candidate reviewed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     appliedValue:
 *                       type: object
 *                     reviewedBy:
 *                       type: string
 *       400:
 *         description: Validation error or invalid candidate id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Candidate not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/metadata/candidates/:candidateId/review",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  reviewMetadataCandidateController,
);

/**
 * @openapi
 * /documents/{id}/version-conflict/analyze:
 *   post:
 *     summary: Trigger version conflict analysis
 *     description: Queues an analysis comparing a document against candidate
 *       documents to detect version conflicts. The analysis produces document
 *       relationships and conflict findings that can be reviewed later.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               candidateDocumentIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Ids of candidate documents to compare against
 *     responses:
 *       200:
 *         description: Version conflict analysis completed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     summary:
 *                       type: string
 *                     relationships:
 *                       type: array
 *                       items:
 *                         type: object
 *                     conflicts:
 *                       type: array
 *                       items:
 *                         type: object
 *       400:
 *         description: Validation error or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/version-conflict/analyze",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_OCR_PROCESS),
  triggerVersionConflictAnalysisController,
);

/**
 * @openapi
 * /documents/{id}/relationships:
 *   get:
 *     summary: Get document relationships
 *     description: Returns the detected relationships for a document, such as
 *       version of, supersedes, duplicate of and related to. Each
 *       relationship includes the source and target documents, confidence,
 *       evidence and status.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     responses:
 *       200:
 *         description: Document relationships
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       relationshipType:
 *                         type: string
 *                       confidence:
 *                         type: number
 *                       status:
 *                         type: string
 *                       sourceDocumentId:
 *                         type: string
 *                       targetDocumentId:
 *                         type: string
 *       400:
 *         description: Invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.get(
  "/:id/relationships",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getDocumentRelationshipsController,
);

/**
 * @openapi
 * /documents/relationships/{relationshipId}/approve:
 *   post:
 *     summary: Approve document relationship
 *     description: Approves a pending document relationship so it becomes
 *       active. The relationship must belong to the requesting tenant.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: relationshipId
 *         required: true
 *         schema:
 *           type: string
 *         description: Document relationship id
 *     responses:
 *       200:
 *         description: Relationship approved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     approvedBy:
 *                       type: string
 *       400:
 *         description: Invalid relationship id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Relationship not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/relationships/:relationshipId/approve",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  approveDocumentRelationshipController,
);

/**
 * @openapi
 * /documents/relationships/{relationshipId}/reject:
 *   post:
 *     summary: Reject document relationship
 *     description: Rejects a document relationship so it does not become
 *       active. An optional rejection reason may be supplied.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: relationshipId
 *         required: true
 *         schema:
 *           type: string
 *         description: Document relationship id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Rejection reason
 *     responses:
 *       200:
 *         description: Relationship rejected
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     rejectionReason:
 *                       type: string
 *       400:
 *         description: Invalid relationship id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Relationship not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/relationships/:relationshipId/reject",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  rejectDocumentRelationshipController,
);

/**
 * @openapi
 * /documents/{id}/conflicts:
 *   get:
 *     summary: Get conflict findings
 *     description: Returns the conflict findings detected for a document.
 *       Findings describe contradictions, overlapping dates, inconsistent
 *       values or duplicated content with severity, confidence and evidence.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     responses:
 *       200:
 *         description: Conflict findings for the document
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       conflictType:
 *                         type: string
 *                       severity:
 *                         type: string
 *                       status:
 *                         type: string
 *                       confidence:
 *                         type: number
 *                       description:
 *                         type: string
 *       400:
 *         description: Invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.get(
  "/:id/conflicts",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getConflictFindingsController,
);

/**
 * @openapi
 * /documents/conflicts/{conflictId}/resolve:
 *   post:
 *     summary: Resolve conflict finding
 *     description: Resolves a conflict finding using the given resolution
 *       strategy. Supported strategies include keeping the source or target
 *       document, merging, archiving both or escalating the conflict.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conflictId
 *         required: true
 *         schema:
 *           type: string
 *         description: Conflict finding id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resolution]
 *             properties:
 *               resolution:
 *                 type: string
 *                 enum: [keep_source, keep_target, merge, archive_both, escalate]
 *               notes:
 *                 type: string
 *                 description: Resolution notes (max 2000 characters)
 *     responses:
 *       200:
 *         description: Conflict finding resolved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     resolution:
 *                       type: string
 *                     resolvedBy:
 *                       type: string
 *       400:
 *         description: Validation error or invalid conflict id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Conflict not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/conflicts/:conflictId/resolve",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  resolveConflictFindingController,
);

/**
 * @openapi
 * /documents/conflicts/{conflictId}/dismiss:
 *   post:
 *     summary: Dismiss conflict finding
 *     description: Dismisses a conflict finding so it is no longer reported
 *       as outstanding. An optional dismissal reason may be supplied.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: conflictId
 *         required: true
 *         schema:
 *           type: string
 *         description: Conflict finding id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Dismissal reason
 *     responses:
 *       200:
 *         description: Conflict finding dismissed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     resolutionNotes:
 *                       type: string
 *       400:
 *         description: Invalid conflict id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Conflict not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/conflicts/:conflictId/dismiss",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  dismissConflictFindingController,
);

/**
 * @openapi
 * /documents/review/pending:
 *   get:
 *     summary: Get pending review items
 *     description: Returns a list of pending review items for the tenant.
 *       Items span metadata candidates, document relationships and conflict
 *       findings that await reviewer action.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Pending review items
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     metadataCandidates:
 *                       type: array
 *                       items:
 *                         type: object
 *                     relationships:
 *                       type: array
 *                       items:
 *                         type: object
 *                     conflicts:
 *                       type: array
 *                       items:
 *                         type: object
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       500:
 *         description: Internal server error
 */
router.get(
  "/review/pending",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_QUALITY_REVIEW),
  getPendingReviewItemsController,
);

export default router;
