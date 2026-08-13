import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { config } from "../../config/index.js";
import { createEntitlementGuard, createEntitlementCheckGuard } from "../entitlement/middlewares/entitlement.middleware.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";
import {
  uploadDocumentController,
  listDocumentsController,
  getDocumentController,
  updateDocumentMetadataController,
  downloadDocumentController,
  previewDocumentController,
  replaceDocumentController,
  archiveDocumentController,
  restoreDocumentController,
  softDeleteDocumentController,
  permanentDeleteDocumentController,
  listDocumentVersionsController,
} from "./documents.controller.js";

const allowedMimeTypes = config.ALLOWED_MIME_TYPES.split(",").map((t) => t.trim());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_FILE_SIZE_BYTES },
  fileFilter: (_req, file, callback) => {
    if (allowedMimeTypes.includes(file.mimetype)) {
      callback(null, true);
    } else {
      callback(
        Object.assign(new Error(`File type ${file.mimetype} is not supported`), {
          code: "UNSUPPORTED_FILE_TYPE",
        }) as Error & { code: string },
      );
    }
  },
});

import {
  getDocumentExtractionStatusController,
  retriggerDocumentExtractionController,
} from "../extraction/extraction.controller.js";
import {
  applyPolicyController, batchApplyPolicyController, batchPreviewPolicyController, effectivePolicyAccessController,
  getActivePolicyController, getPolicyAssignmentsController, getPolicyHistoryController, getPolicyPropagationStatusController, policyEditorOptionsController, previewPolicyController,
} from "../document-access/documentPolicyManagement.controller.js";

const router = Router();
const requirePolicyManagement = requirePermission(Permission.DOCUMENTS_MANAGE_ACCESS, { allowScoped: true, resourceType: "Document" });

// ── Entitlement guards ─────────────────────────────────────────────────────

const svc = getEntitlementService();

const documentCountGuard = createEntitlementGuard(svc, {
  dimension: "documents",
  amount: 1,
  failMode: "fail-closed",
});

const storageMbGuard = createEntitlementGuard(svc, {
  dimension: "storageMb",
  amount: (req) => Math.ceil((req.file?.size || 0) / (1024 * 1024)),
  failMode: "fail-closed",
});

const ocrRetriggerCheckGuard = createEntitlementCheckGuard(svc, {
  dimension: "ocrPagesPerMonth",
  failMode: "fail-closed",
});

/**
 * @openapi
 * /documents:
 *   post:
 *     summary: Upload document
 *     description: Uploads a document as multipart/form-data. The file is
 *       scanned, stored, and queued for extraction, chunking, embedding and
 *       indexing.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Document file (PDF, DOCX, etc.)
 *               title:
 *                 type: string
 *                 description: Optional display title for the document
 *               description:
 *                 type: string
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       201:
 *         description: Document uploaded successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Document uploaded successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     document:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         fileName:
 *                           type: string
 *                         originalFileName:
 *                           type: string
 *                         fileSize:
 *                           type: integer
 *                         mimeType:
 *                           type: string
 *                         status:
 *                           type: string
 *                           example: processing
 *                         searchStatus:
 *                           type: string
 *                           example: STALE
 *                     duplicateWarning:
 *                       type: object
 *                       properties:
 *                         existingDocumentId:
 *                           type: string
 *                         existingTitle:
 *                           type: string
 *       400:
 *         description: Validation error or unsupported file type
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or entitlement limit reached
 *       413:
 *         description: File too large
 *   get:
 *     summary: List documents
 *     description: Returns a paginated list of documents for the tenant.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search by file name
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *         description: Filter by processing status
 *       - in: query
 *         name: category
 *         schema:
 *           type: string
 *       - in: query
 *         name: classification
 *         schema:
 *           type: string
 *           enum: [public, internal, confidential, restricted, highly_confidential]
 *       - in: query
 *         name: isArchived
 *         schema:
 *           type: boolean
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *     responses:
 *       200:
 *         description: Paginated list of documents
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
 *                     documents:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           fileName:
 *                             type: string
 *                           fileSize:
 *                             type: integer
 *                           mimeType:
 *                             type: string
 *                           status:
 *                             type: string
 *                           searchStatus:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     pagination:
 *                       type: object
 *                       properties:
 *                         page:
 *                           type: integer
 *                         pageSize:
 *                           type: integer
 *                         totalPages:
 *                           type: integer
 *                         totalRecords:
 *                           type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post("/", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_CREATE), upload.single("file"), documentCountGuard, storageMbGuard, uploadDocumentController);

router.get("/", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_READ), listDocumentsController);

/**
 * @openapi
 * /documents/access-policy/batch/preview:
 *   post:
 *     summary: Batch preview access policy changes
 *     description: Computes the access impact of a proposed policy draft across
 *       up to 50 documents without persisting any changes. Returns a preview token
 *       that must be supplied to the batch apply endpoint, along with per-document
 *       impact summaries and an aggregate view.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [documentIds, expectedPolicies, draft]
 *             properties:
 *               documentIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Document ids to include in the batch (max 50)
 *               expectedPolicies:
 *                 type: array
 *                 items:
 *                   type: object
 *                   required: [documentId, expectedPolicyId, expectedPolicyVersion]
 *                   properties:
 *                     documentId:
 *                       type: string
 *                     expectedPolicyId:
 *                       type: string
 *                     expectedPolicyVersion:
 *                       type: integer
 *               draft:
 *                 type: object
 *                 properties:
 *                   rules:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         ruleId:
 *                           type: string
 *                         effect:
 *                           type: string
 *                           enum: [allow, deny]
 *                         subject:
 *                           type: object
 *                           properties:
 *                             type:
 *                               type: string
 *                               enum: [user, custom_role, department, owner, tenant_member]
 *                             id:
 *                               type: string
 *                         actions:
 *                           type: array
 *                           items:
 *                             type: string
 *                             enum: [discover, read, download, update, delete, archive, restore, replace, reprocess, manage_access, use_in_ai]
 *                   inherits:
 *                     type: object
 *                     nullable: true
 *                     properties:
 *                       policyId:
 *                         type: string
 *                       policyVersion:
 *                         type: integer
 *                   effectiveFrom:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *                   effectiveUntil:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *                   reason:
 *                     type: string
 *                     nullable: true
 *     responses:
 *       200:
 *         description: Batch preview computed successfully
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
 *                     documentCount:
 *                       type: integer
 *                     aggregate:
 *                       type: object
 *                       properties:
 *                         broadeningCount:
 *                           type: integer
 *                         tighteningCount:
 *                           type: integer
 *                         mixedCount:
 *                           type: integer
 *                         noChangeCount:
 *                           type: integer
 *                         usersGainingAccess:
 *                           type: integer
 *                         usersLosingAccess:
 *                           type: integer
 *                         sensitiveConfirmationRequiredCount:
 *                           type: integer
 *                         byAction:
 *                           type: object
 *                           additionalProperties:
 *                             type: object
 *                             properties:
 *                               gained:
 *                                 type: integer
 *                               lost:
 *                                 type: integer
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           documentId:
 *                             type: string
 *                           direction:
 *                             type: string
 *                             enum: [broadening, tightening, mixed, no_change]
 *                           usersGainingAny:
 *                             type: integer
 *                           usersLosingAny:
 *                             type: integer
 *                           sensitiveConfirmationRequired:
 *                             type: boolean
 *                           byAction:
 *                             type: object
 *                     previewToken:
 *                       type: string
 *                     previewExpiresAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Invalid batch list, expected policies, or policy draft
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       409:
 *         description: Policy version conflict
 *       500:
 *         description: Internal server error
 */
router.post("/access-policy/batch/preview", authenticate, tenantScoping, requirePolicyManagement, batchPreviewPolicyController);
/**
 * @openapi
 * /documents/access-policy/batch/apply:
 *   post:
 *     summary: Apply access policy to multiple documents
 *     description: Applies a previously previewed policy draft to the documents in
 *       the batch. Requires the preview token returned by the batch preview endpoint
 *       and an Idempotency-Key header so the operation can be replayed safely.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *         description: Client-generated idempotency key for replay protection
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [previewToken, draft]
 *             properties:
 *               previewToken:
 *                 type: string
 *               draft:
 *                 type: object
 *                 properties:
 *                   rules:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         ruleId:
 *                           type: string
 *                         effect:
 *                           type: string
 *                           enum: [allow, deny]
 *                         subject:
 *                           type: object
 *                           properties:
 *                             type:
 *                               type: string
 *                               enum: [user, custom_role, department, owner, tenant_member]
 *                             id:
 *                               type: string
 *                         actions:
 *                           type: array
 *                           items:
 *                             type: string
 *                             enum: [discover, read, download, update, delete, archive, restore, replace, reprocess, manage_access, use_in_ai]
 *                   inherits:
 *                     type: object
 *                     nullable: true
 *                     properties:
 *                       policyId:
 *                         type: string
 *                       policyVersion:
 *                         type: integer
 *                   effectiveFrom:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *                   effectiveUntil:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *                   reason:
 *                     type: string
 *                     nullable: true
 *               confirmSensitiveBroadening:
 *                 type: boolean
 *                 description: Required when the batch broadens access on sensitive documents
 *     responses:
 *       200:
 *         description: Batch apply completed
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
 *                     status:
 *                       type: string
 *                       enum: [complete, partial, idempotent_replay]
 *                     results:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           documentId:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [applied, no_change, version_conflict, failed, idempotent_replay]
 *                           policyVersion:
 *                             type: integer
 *       400:
 *         description: Missing Idempotency-Key or invalid preview/draft
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       409:
 *         description: Preview mismatch, sensitive confirmation required, or idempotency conflict
 *       500:
 *         description: Internal server error
 */
router.post("/access-policy/batch/apply", authenticate, tenantScoping, requirePolicyManagement, batchApplyPolicyController);
/**
 * @openapi
 * /documents/{id}/policy-editor/options:
 *   get:
 *     summary: Get access policy editor options
 *     description: Returns the lookup data needed to build the policy editor UI for
 *       a document, including active users, roles, classifications, categories and
 *       departments. Also reports the document owner and whether the taxonomy is
 *       editable by the caller.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Policy editor options
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
 *                     documentOwnerId:
 *                       type: string
 *                       nullable: true
 *                     taxonomyEditable:
 *                       type: boolean
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                     roles:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                     classifications:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                           level:
 *                             type: string
 *                     categories:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *                     departments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           name:
 *                             type: string
 *       400:
 *         description: Invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id/policy-editor/options", authenticate, tenantScoping, requirePolicyManagement, policyEditorOptionsController);
/**
 * @openapi
 * /documents/{id}/access-policy:
 *   get:
 *     summary: Get active access policy
 *     description: Returns the active access policy for a document together with its
 *       resolved taxonomy selection, the document owner id, and whether the caller
 *       may manage the policy.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Active access policy
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
 *                     policy:
 *                       type: object
 *                       properties:
 *                         policyId:
 *                           type: string
 *                         policyVersion:
 *                           type: integer
 *                         status:
 *                           type: string
 *                         effectiveFrom:
 *                           type: string
 *                           format: date-time
 *                         effectiveUntil:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                         inherits:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             policyId:
 *                               type: string
 *                             policyVersion:
 *                               type: integer
 *                         rules:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               ruleId:
 *                                 type: string
 *                               effect:
 *                                 type: string
 *                                 enum: [allow, deny]
 *                               subject:
 *                                 type: object
 *                                 properties:
 *                                   type:
 *                                     type: string
 *                                     enum: [user, custom_role, department, owner, tenant_member]
 *                                   id:
 *                                     type: string
 *                               actions:
 *                                 type: array
 *                                 items:
 *                                   type: string
 *                     taxonomy:
 *                       type: object
 *                       properties:
 *                         classificationId:
 *                           type: string
 *                         classificationName:
 *                           type: string
 *                         classificationLevel:
 *                           type: string
 *                         categoryId:
 *                           type: string
 *                           nullable: true
 *                         categoryName:
 *                           type: string
 *                           nullable: true
 *                         departmentId:
 *                           type: string
 *                           nullable: true
 *                         departmentName:
 *                           type: string
 *                           nullable: true
 *                     mayManage:
 *                       type: boolean
 *                     documentOwnerId:
 *                       type: string
 *                       nullable: true
 *       400:
 *         description: Invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id/access-policy", authenticate, tenantScoping, requirePolicyManagement, getActivePolicyController);
/**
 * @openapi
 * /documents/{id}/access-policy/history:
 *   get:
 *     summary: List access policy history
 *     description: Returns the version history of the access policy family for a
 *       document, ordered newest first. Supports cursor-based pagination via the
 *       limit and cursor query parameters.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Maximum number of history entries to return (1-100)
 *       - in: query
 *         name: cursor
 *         schema:
 *           type: integer
 *         description: Cursor for the next page of history
 *     responses:
 *       200:
 *         description: Access policy history
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
 *                     policies:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           policyId:
 *                             type: string
 *                           policyVersion:
 *                             type: integer
 *                           status:
 *                             type: string
 *                           effectiveFrom:
 *                             type: string
 *                             format: date-time
 *                           effectiveUntil:
 *                             type: string
 *                             format: date-time
 *                             nullable: true
 *                           reason:
 *                             type: string
 *                             nullable: true
 *                           createdBy:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     nextCursor:
 *                       type: integer
 *                       nullable: true
 *                     activeVersion:
 *                       type: integer
 *       400:
 *         description: Invalid document id or pagination parameters
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id/access-policy/history", authenticate, tenantScoping, requirePolicyManagement, getPolicyHistoryController);
/**
 * @openapi
 * /documents/{id}/access-policy/assignments:
 *   get:
 *     summary: List access policy assignments
 *     description: Resolves every rule in the active access policy and any inherited
 *       policy into human-readable assignments. Each entry includes the subject
 *       label, effect, permitted actions, and whether the rule is inherited.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Access policy assignments
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
 *                     assignments:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           subjectType:
 *                             type: string
 *                             enum: [user, custom_role, department, owner, tenant_member]
 *                           subjectId:
 *                             type: string
 *                             nullable: true
 *                           displayLabel:
 *                             type: string
 *                           effect:
 *                             type: string
 *                             enum: [allow, deny]
 *                           actions:
 *                             type: array
 *                             items:
 *                               type: string
 *                           inherited:
 *                             type: boolean
 *                           stale:
 *                             type: boolean
 *       400:
 *         description: Invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id/access-policy/assignments", authenticate, tenantScoping, requirePolicyManagement, getPolicyAssignmentsController);
/**
 * @openapi
 * /documents/{id}/access-policy/propagation-status:
 *   get:
 *     summary: Get access policy propagation status
 *     description: Returns the status of propagating the document's active access
 *       policy to derived indexes. Reports the desired and applied policy versions,
 *       propagation status, retry attempts, and whether a retry is available.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Access policy propagation status
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
 *                     desiredPolicyVersion:
 *                       type: integer
 *                     appliedPolicyVersion:
 *                       type: integer
 *                       nullable: true
 *                     status:
 *                       type: string
 *                     reindexRequired:
 *                       type: boolean
 *                     attempts:
 *                       type: integer
 *                     requestedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     completedAt:
 *                       type: string
 *                       format: date-time
 *                       nullable: true
 *                     failureCode:
 *                       type: string
 *                       nullable: true
 *                     retryAvailable:
 *                       type: boolean
 *       400:
 *         description: Invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id/access-policy/propagation-status", authenticate, tenantScoping, requirePolicyManagement, getPolicyPropagationStatusController);
/**
 * @openapi
 * /documents/{id}/access-policy/effective-access:
 *   post:
 *     summary: Evaluate effective access for users
 *     description: Evaluates the effective access granted to a list of active users
 *       on a document under the current policy and any inherited policy. Returns
 *       per-user booleans for each document action.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [userIds]
 *             properties:
 *               userIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: User ids to evaluate (max 100)
 *     responses:
 *       200:
 *         description: Effective access for each user
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
 *                     users:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           userId:
 *                             type: string
 *                           displayName:
 *                             type: string
 *                           actions:
 *                             type: object
 *                             additionalProperties:
 *                               type: boolean
 *       400:
 *         description: Invalid user list or document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.post("/:id/access-policy/effective-access", authenticate, tenantScoping, requirePolicyManagement, effectivePolicyAccessController);
/**
 * @openapi
 * /documents/{id}/access-policy/preview:
 *   post:
 *     summary: Preview access policy changes
 *     description: Computes the impact of a proposed policy draft and optional
 *       taxonomy selection on a single document without applying any changes.
 *       Returns a preview token used by the apply endpoint and flags whether
 *       sensitive access broadening confirmation is required.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expectedPolicyId, expectedPolicyVersion, draft]
 *             properties:
 *               expectedPolicyId:
 *                 type: string
 *               expectedPolicyVersion:
 *                 type: integer
 *               draft:
 *                 type: object
 *                 properties:
 *                   rules:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         ruleId:
 *                           type: string
 *                         effect:
 *                           type: string
 *                           enum: [allow, deny]
 *                         subject:
 *                           type: object
 *                           properties:
 *                             type:
 *                               type: string
 *                               enum: [user, custom_role, department, owner, tenant_member]
 *                             id:
 *                               type: string
 *                         actions:
 *                           type: array
 *                           items:
 *                             type: string
 *                             enum: [discover, read, download, update, delete, archive, restore, replace, reprocess, manage_access, use_in_ai]
 *                   inherits:
 *                     type: object
 *                     nullable: true
 *                     properties:
 *                       policyId:
 *                         type: string
 *                       policyVersion:
 *                         type: integer
 *                   effectiveFrom:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *                   effectiveUntil:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *                   reason:
 *                     type: string
 *                     nullable: true
 *               taxonomy:
 *                 type: object
 *                 properties:
 *                   classificationId:
 *                     type: string
 *                   categoryId:
 *                     type: string
 *                     nullable: true
 *                   departmentId:
 *                     type: string
 *                     nullable: true
 *     responses:
 *       200:
 *         description: Access policy preview
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
 *                     documentId:
 *                       type: string
 *                     currentPolicyId:
 *                       type: string
 *                     currentPolicyVersion:
 *                       type: integer
 *                     proposedPolicyVersion:
 *                       type: integer
 *                     normalizedSummary:
 *                       type: object
 *                       properties:
 *                         ruleCount:
 *                           type: integer
 *                         allowRuleCount:
 *                           type: integer
 *                         denyRuleCount:
 *                           type: integer
 *                         inherits:
 *                           type: object
 *                           nullable: true
 *                         effectiveFrom:
 *                           type: string
 *                           format: date-time
 *                         effectiveUntil:
 *                           type: string
 *                           format: date-time
 *                           nullable: true
 *                         reason:
 *                           type: string
 *                           nullable: true
 *                     impact:
 *                       type: object
 *                       properties:
 *                         direction:
 *                           type: string
 *                           enum: [broadening, tightening, mixed, no_change]
 *                         byAction:
 *                           type: object
 *                           additionalProperties:
 *                             type: object
 *                             properties:
 *                               gained:
 *                                 type: integer
 *                               lost:
 *                                 type: integer
 *                         usersGainingAny:
 *                           type: integer
 *                         usersLosingAny:
 *                           type: integer
 *                         ruleDelta:
 *                           type: object
 *                           properties:
 *                             added:
 *                               type: integer
 *                             removed:
 *                               type: integer
 *                         sensitiveBroadening:
 *                           type: boolean
 *                     taxonomyChanged:
 *                       type: boolean
 *                     taxonomy:
 *                       type: object
 *                       properties:
 *                         classificationId:
 *                           type: string
 *                         classificationName:
 *                           type: string
 *                         classificationLevel:
 *                           type: string
 *                         categoryId:
 *                           type: string
 *                           nullable: true
 *                         categoryName:
 *                           type: string
 *                           nullable: true
 *                         departmentId:
 *                           type: string
 *                           nullable: true
 *                         departmentName:
 *                           type: string
 *                           nullable: true
 *                     sensitiveConfirmationRequired:
 *                       type: boolean
 *                     previewToken:
 *                       type: string
 *                     previewExpiresAt:
 *                       type: string
 *                       format: date-time
 *                     previewFingerprint:
 *                       type: string
 *       400:
 *         description: Invalid draft or taxonomy
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       409:
 *         description: Policy version conflict
 *       500:
 *         description: Internal server error
 */
router.post("/:id/access-policy/preview", authenticate, tenantScoping, requirePolicyManagement, previewPolicyController);
/**
 * @openapi
 * /documents/{id}/access-policy/apply:
 *   post:
 *     summary: Apply access policy changes
 *     description: Persists a previously previewed policy draft for a document and
 *       schedules propagation to derived indexes. Requires the preview token from
 *       the preview endpoint and an Idempotency-Key header for replay protection.
 *       Sensitive access broadening requires explicit confirmation.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: header
 *         name: Idempotency-Key
 *         required: true
 *         schema:
 *           type: string
 *         description: Client-generated idempotency key for replay protection
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [previewToken, draft]
 *             properties:
 *               previewToken:
 *                 type: string
 *               draft:
 *                 type: object
 *                 properties:
 *                   rules:
 *                     type: array
 *                     items:
 *                       type: object
 *                       properties:
 *                         ruleId:
 *                           type: string
 *                         effect:
 *                           type: string
 *                           enum: [allow, deny]
 *                         subject:
 *                           type: object
 *                           properties:
 *                             type:
 *                               type: string
 *                               enum: [user, custom_role, department, owner, tenant_member]
 *                             id:
 *                               type: string
 *                         actions:
 *                           type: array
 *                           items:
 *                             type: string
 *                             enum: [discover, read, download, update, delete, archive, restore, replace, reprocess, manage_access, use_in_ai]
 *                   inherits:
 *                     type: object
 *                     nullable: true
 *                     properties:
 *                       policyId:
 *                         type: string
 *                       policyVersion:
 *                         type: integer
 *                   effectiveFrom:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *                   effectiveUntil:
 *                     type: string
 *                     format: date-time
 *                     nullable: true
 *                   reason:
 *                     type: string
 *                     nullable: true
 *               taxonomy:
 *                 type: object
 *                 properties:
 *                   classificationId:
 *                     type: string
 *                   categoryId:
 *                     type: string
 *                     nullable: true
 *                   departmentId:
 *                     type: string
 *                     nullable: true
 *               confirmSensitiveBroadening:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Access policy applied
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
 *                     status:
 *                       type: string
 *                       enum: [applied, no_change, idempotent_replay]
 *                     policyId:
 *                       type: string
 *                     policyVersion:
 *                       type: integer
 *                     propagationEventId:
 *                       type: string
 *                       nullable: true
 *                     taxonomy:
 *                       type: object
 *                       properties:
 *                         classificationId:
 *                           type: string
 *                         classificationName:
 *                           type: string
 *                         classificationLevel:
 *                           type: string
 *                         categoryId:
 *                           type: string
 *                           nullable: true
 *                         categoryName:
 *                           type: string
 *                           nullable: true
 *                         departmentId:
 *                           type: string
 *                           nullable: true
 *                         departmentName:
 *                           type: string
 *                           nullable: true
 *       400:
 *         description: Missing Idempotency-Key or invalid preview/draft
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       409:
 *         description: Preview mismatch, sensitive confirmation required, version or idempotency conflict
 *       500:
 *         description: Internal server error
 */
router.post("/:id/access-policy/apply", authenticate, tenantScoping, requirePolicyManagement, applyPolicyController);

/**
 * @openapi
 * /documents/{id}/extraction:
 *   get:
 *     summary: Get document extraction status
 *     description: Returns the OCR and text extraction status for a document version.
 *       A version query parameter can select a specific version; the latest version
 *       is used when omitted. Returns a pending view when extraction has not started.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: version
 *         schema:
 *           type: integer
 *         description: Document version to inspect
 *     responses:
 *       200:
 *         description: Extraction status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 documentId:
 *                   type: string
 *                 tenantId:
 *                   type: string
 *                 documentVersion:
 *                   type: integer
 *                 status:
 *                   type: string
 *                   enum: [pending, extracting, completed, failed]
 *                 pagesCount:
 *                   type: integer
 *                 charactersCount:
 *                   type: integer
 *                 warnings:
 *                   type: array
 *                   items:
 *                     type: string
 *                 hasImageOnlyPages:
 *                   type: boolean
 *                 failureReason:
 *                   type: string
 *                   nullable: true
 *                 failureCode:
 *                   type: string
 *                   nullable: true
 *                 durationMs:
 *                   type: integer
 *                   nullable: true
 *                 createdAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *                 updatedAt:
 *                   type: string
 *                   format: date-time
 *                   nullable: true
 *       400:
 *         description: Invalid document id or version parameter
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id/extraction", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_READ), getDocumentExtractionStatusController);

/**
 * @openapi
 * /documents/{id}/extraction/retrigger:
 *   post:
 *     summary: Retrigger document extraction
 *     description: Queues a new extraction job for a document version. The version
 *       defaults to the latest when not supplied in the request body or query.
 *       Returns a 202 with the queued job id and idempotency key.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: version
 *         schema:
 *           type: integer
 *         description: Document version to process
 *     requestBody:
 *       required: false
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               version:
 *                 type: integer
 *                 description: Document version to process
 *     responses:
 *       202:
 *         description: Extraction job queued
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Document extraction job queued successfully
 *                 jobId:
 *                   type: string
 *                 idempotencyKey:
 *                   type: string
 *       400:
 *         description: Invalid document id or version parameter
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document or version not found
 *       500:
 *         description: Internal server error
 */
router.post("/:id/extraction/retrigger", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_OCR_PROCESS), ocrRetriggerCheckGuard, retriggerDocumentExtractionController);

/**
 * @openapi
 * /documents/{id}:
 *   get:
 *     summary: Get document
 *     description: Returns the full public view of a single document, including
 *       metadata, lifecycle status, classification, scan results and search index
 *       status. The caller must have read access on the document.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document details
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
 *                     document:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         fileName:
 *                           type: string
 *                         originalFileName:
 *                           type: string
 *                         fileSize:
 *                           type: integer
 *                         mimeType:
 *                           type: string
 *                         status:
 *                           type: string
 *                         metadata:
 *                           type: object
 *                           properties:
 *                             title:
 *                               type: string
 *                               nullable: true
 *                             description:
 *                               type: string
 *                               nullable: true
 *                             tags:
 *                               type: array
 *                               items:
 *                                 type: string
 *                         category:
 *                           type: string
 *                           nullable: true
 *                         department:
 *                           type: string
 *                           nullable: true
 *                         classification:
 *                           type: string
 *                           enum: [public, internal, confidential, restricted, highly_confidential]
 *                         owner:
 *                           type: string
 *                           nullable: true
 *                         version:
 *                           type: integer
 *                         versionLabel:
 *                           type: string
 *                         isArchived:
 *                           type: boolean
 *                         quarantineStatus:
 *                           type: string
 *                           enum: [none, quarantined, cleared]
 *                         scanResult:
 *                           type: object
 *                           nullable: true
 *                           properties:
 *                             scanner:
 *                               type: string
 *                             scannedAt:
 *                               type: string
 *                               format: date-time
 *                             result:
 *                               type: string
 *                               enum: [clean, infected, error]
 *                         searchStatus:
 *                           type: string
 *                           enum: [STALE, INDEXING, READY, FAILED]
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Missing or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_READ), getDocumentController);

/**
 * @openapi
 * /documents/{id}/download:
 *   get:
 *     summary: Download document
 *     description: Streams the document file as a binary attachment. The response
 *       is the raw file with its original content type and a Content-Disposition
 *       attachment header. The caller must have download access on the document.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document file stream
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Missing or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.get(
  "/:id/download",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_DOWNLOAD, {
    allowScoped: true,
    resourceType: "Document",
    resourceId: (request) =>
      Array.isArray(request.params.id) ? request.params.id[0] : request.params.id,
  }),
  downloadDocumentController,
);

/**
 * @openapi
 * /documents/{id}/preview:
 *   get:
 *     summary: Preview document
 *     description: Streams the document file for inline preview with a
 *       Content-Disposition of inline and short-lived private caching.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document file stream for inline preview
 *         content:
 *           application/octet-stream:
 *             schema:
 *               type: string
 *               format: binary
 *       400:
 *         description: Missing or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.get(
  "/:id/preview",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  previewDocumentController,
);

/**
 * @openapi
 * /documents/{id}/versions:
 *   get:
 *     summary: List document versions
 *     description: Returns the version history of a document, including file name,
 *       size, checksum, upload reason and change description for each version.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document versions
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
 *                     versions:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           documentId:
 *                             type: string
 *                           version:
 *                             type: integer
 *                           versionLabel:
 *                             type: string
 *                           fileName:
 *                             type: string
 *                           fileSize:
 *                             type: integer
 *                           mimeType:
 *                             type: string
 *                           checksum:
 *                             type: string
 *                           uploadedBy:
 *                             type: string
 *                           uploadReason:
 *                             type: string
 *                             enum: [initial, replace, restore]
 *                           changeDescription:
 *                             type: string
 *                             nullable: true
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *       400:
 *         description: Missing or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.get("/:id/versions", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_READ), listDocumentVersionsController);

/**
 * @openapi
 * /documents/{id}/replace:
 *   put:
 *     summary: Replace document file
 *     description: Replaces the file of an existing document with a new upload,
 *       creating a new version and re-queuing processing. The file is uploaded as
 *       multipart/form-data with the field name file.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required: [file]
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Replacement document file (PDF, DOCX, etc.)
 *               changeDescription:
 *                 type: string
 *                 description: Description of the change for the new version
 *     responses:
 *       200:
 *         description: Document replaced successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Document replaced successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     document:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         fileName:
 *                           type: string
 *                         originalFileName:
 *                           type: string
 *                         fileSize:
 *                           type: integer
 *                         mimeType:
 *                           type: string
 *                         status:
 *                           type: string
 *                         version:
 *                           type: integer
 *                         versionLabel:
 *                           type: string
 *                         isArchived:
 *                           type: boolean
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error, unsupported file type, or empty file
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       413:
 *         description: File too large
 *       500:
 *         description: Internal server error
 */
router.put("/:id/replace", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_UPDATE), upload.single("file"), documentCountGuard, storageMbGuard, replaceDocumentController);

/**
 * @openapi
 * /documents/{id}:
 *   patch:
 *     summary: Update document metadata
 *     description: Updates metadata of an existing document, such as title,
 *       description, tags, category, department, classification, owner, effective
 *       and expiry dates, and version label. At least one field must be provided.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Display title (2-200 characters)
 *               description:
 *                 type: string
 *                 description: Document description (max 1000 characters)
 *               tags:
 *                 type: array
 *                 items:
 *                   type: string
 *               category:
 *                 type: string
 *               department:
 *                 type: string
 *               classification:
 *                 type: string
 *                 enum: [public, internal, confidential, restricted, highly_confidential]
 *               owner:
 *                 type: string
 *                 description: Owner user id
 *               effectiveDate:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               expiryDate:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *               versionLabel:
 *                 type: string
 *     responses:
 *       200:
 *         description: Document metadata updated
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
 *                     document:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         fileName:
 *                           type: string
 *                         fileSize:
 *                           type: integer
 *                         mimeType:
 *                           type: string
 *                         status:
 *                           type: string
 *                         metadata:
 *                           type: object
 *                           properties:
 *                             title:
 *                               type: string
 *                               nullable: true
 *                             description:
 *                               type: string
 *                               nullable: true
 *                             tags:
 *                               type: array
 *                               items:
 *                                 type: string
 *                         category:
 *                           type: string
 *                           nullable: true
 *                         department:
 *                           type: string
 *                           nullable: true
 *                         classification:
 *                           type: string
 *                         version:
 *                           type: integer
 *                         versionLabel:
 *                           type: string
 *                         isArchived:
 *                           type: boolean
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error or missing update fields
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.patch("/:id", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_UPDATE), updateDocumentMetadataController);

/**
 * @openapi
 * /documents/{id}/archive:
 *   post:
 *     summary: Archive document
 *     description: Marks a document as archived. Archived documents are excluded
 *       from the default list view until restored.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document archived
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Document archived successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     document:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         isArchived:
 *                           type: boolean
 *                         archivedAt:
 *                           type: string
 *                           format: date-time
 *                         archivedBy:
 *                           type: string
 *                           nullable: true
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Missing or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       409:
 *         description: Document is already archived
 *       500:
 *         description: Internal server error
 */
router.post("/:id/archive", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_ARCHIVE), archiveDocumentController);

/**
 * @openapi
 * /documents/{id}/restore:
 *   post:
 *     summary: Restore archived document
 *     description: Removes the archived flag from a previously archived document so
 *       it appears in the default list view again.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document restored
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Document restored successfully
 *                 data:
 *                   type: object
 *                   properties:
 *                     document:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         isArchived:
 *                           type: boolean
 *                         updatedAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Missing or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       409:
 *         description: Document is not archived
 *       500:
 *         description: Internal server error
 */
router.post("/:id/restore", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_ARCHIVE), restoreDocumentController);

/**
 * @openapi
 * /documents/{id}/permanent:
 *   delete:
 *     summary: Permanently delete document
 *     description: Permanently removes a soft-deleted document and all of its
 *       versions from storage. The document must be soft-deleted first.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document permanently deleted
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Document permanently deleted
 *       400:
 *         description: Document must be soft-deleted first
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.delete("/:id/permanent", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_DELETE), permanentDeleteDocumentController);

/**
 * @openapi
 * /documents/{id}:
 *   delete:
 *     summary: Soft delete document
 *     description: Moves a document to the trash by setting a deleted timestamp.
 *       The document and its versions remain in storage until permanently deleted.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Document moved to trash
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: Document moved to trash
 *       400:
 *         description: Missing or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found
 *       500:
 *         description: Internal server error
 */
router.delete("/:id", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_DELETE), softDeleteDocumentController);

export default router;
