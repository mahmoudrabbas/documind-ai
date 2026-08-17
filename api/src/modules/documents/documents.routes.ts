import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { config } from "../../config/index.js";
import { createEntitlementCheckGuard, createEntitlementReserveGuard } from "../entitlement/middlewares/entitlement.middleware.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";
import {
  uploadDocumentController,
  uploadOptionsController,
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

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.MAX_FILE_SIZE_BYTES },
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

const documentCountGuard = createEntitlementReserveGuard(svc, {
  dimension: "documents",
  amount: 1,
  failMode: "fail-closed",
});

const storageMbGuard = createEntitlementReserveGuard(svc, {
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
router.post("/", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_CREATE, { allowScoped: true }), upload.single("file"), documentCountGuard, storageMbGuard, uploadDocumentController);

router.get("/", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_READ, { allowScoped: true }), listDocumentsController);

/**
 * @openapi
 * /documents/upload-options:
 *   get:
 *     summary: Get upload form options
 *     description: Returns the active taxonomy options (classifications,
 *       categories, departments) and the upload limits for the upload form.
 *       Requires only DOCUMENTS_CREATE; it intentionally does not require
 *       COMPANY_SETTINGS_READ.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Upload form options
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     taxonomy:
 *                       type: object
 *                       properties:
 *                         classifications:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id: { type: string }
 *                               name: { type: string }
 *                               level: { type: string }
 *                         categories:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id: { type: string }
 *                               name: { type: string }
 *                         departments:
 *                           type: array
 *                           items:
 *                             type: object
 *                             properties:
 *                               id: { type: string }
 *                               name: { type: string }
 *                     upload:
 *                       type: object
 *                       properties:
 *                         maxFileSizeBytes:
 *                           type: integer
 *                         allowedMimeTypes:
 *                           type: array
 *                           items: { type: string }
 *                         fileExtensions:
 *                           type: array
 *                           items: { type: string }
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/upload-options", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_CREATE, { allowScoped: true }), uploadOptionsController);

router.post("/access-policy/batch/preview", authenticate, tenantScoping, requirePolicyManagement, batchPreviewPolicyController);
router.post("/access-policy/batch/apply", authenticate, tenantScoping, requirePolicyManagement, batchApplyPolicyController);
router.get("/:id/policy-editor/options", authenticate, tenantScoping, requirePolicyManagement, policyEditorOptionsController);
router.get("/:id/access-policy", authenticate, tenantScoping, requirePolicyManagement, getActivePolicyController);
router.get("/:id/access-policy/history", authenticate, tenantScoping, requirePolicyManagement, getPolicyHistoryController);
router.get("/:id/access-policy/assignments", authenticate, tenantScoping, requirePolicyManagement, getPolicyAssignmentsController);
router.get("/:id/access-policy/propagation-status", authenticate, tenantScoping, requirePolicyManagement, getPolicyPropagationStatusController);
router.post("/:id/access-policy/effective-access", authenticate, tenantScoping, requirePolicyManagement, effectivePolicyAccessController);
router.post("/:id/access-policy/preview", authenticate, tenantScoping, requirePolicyManagement, previewPolicyController);
router.post("/:id/access-policy/apply", authenticate, tenantScoping, requirePolicyManagement, applyPolicyController);

router.get("/:id/extraction", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_READ, { allowScoped: true }), getDocumentExtractionStatusController);

router.post("/:id/extraction/retrigger", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_OCR_PROCESS, { allowScoped: true }), ocrRetriggerCheckGuard, retriggerDocumentExtractionController);

router.get("/:id", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_READ, { allowScoped: true }), getDocumentController);

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

router.get(
  "/:id/preview",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ, { allowScoped: true }),
  previewDocumentController,
);

router.get("/:id/versions", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_READ, { allowScoped: true }), listDocumentVersionsController);

router.put("/:id/replace", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_UPDATE, { allowScoped: true }), upload.single("file"), documentCountGuard, storageMbGuard, replaceDocumentController);

router.patch("/:id", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_UPDATE, { allowScoped: true }), updateDocumentMetadataController);

router.post("/:id/archive", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_ARCHIVE, { allowScoped: true }), archiveDocumentController);

router.post("/:id/restore", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_ARCHIVE, { allowScoped: true }), restoreDocumentController);

router.delete("/:id/permanent", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_DELETE, { allowScoped: true }), permanentDeleteDocumentController);

router.delete("/:id", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_DELETE, { allowScoped: true }), softDeleteDocumentController);

export default router;
