import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { config } from "../../config/index.js";
import { createEntitlementGuard } from "../entitlement/middlewares/entitlement.middleware.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";
import {
  downloadTemplate,
  uploadAndPreview,
  updateMapping,
  confirmImport,
  getBatchStatus,
  listBatches,
  cancelBatch,
  retryFailedRows,
  exportResults,
} from "./imports.controller.js";

const allowedMimeTypes = config.IMPORT_ALLOWED_MIME_TYPES.split(",");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.IMPORT_MAX_FILE_SIZE_BYTES,
  },
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

const router = Router();

// ── Entitlement guards ─────────────────────────────────────────────────────

const svc = getEntitlementService();

const employeeGuard = createEntitlementGuard(svc, {
  dimension: "employees",
  amount: (req) => req.body.employeeCount || 1,
  failMode: "fail-closed",
});

const exportGuard = createEntitlementGuard(svc, {
  dimension: "documents",
  amount: 1,
  failMode: "fail-open",
});

// ── Static routes (MUST come before /:batchId) ──────────────────────────────

/**
 * @openapi
 * /imports/template:
 *   get:
 *     summary: Download import template
 *     description: Downloads a blank XLSX employee-import template with the
 *       expected column headers. The file is served as a downloadable attachment.
 *     tags: [Imports]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: XLSX template file
 *         content:
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       '401':
 *         description: Authentication required
 */
router.get(
  "/template",
  authenticate,
  tenantScoping,
  downloadTemplate,
);

/**
 * @openapi
 * /imports/upload:
 *   post:
 *     summary: Upload spreadsheet and preview
 *     description: Uploads an employee spreadsheet as multipart/form-data, parses
 *       the rows, resolves an initial column mapping, validates every row and
 *       creates an import batch. Returns a preview of the suggested mapping, row
 *       states and validation summary so the caller can confirm or remap before
 *       the import is executed.
 *     tags: [Imports]
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
 *                 description: Employee spreadsheet (XLSX or CSV)
 *     responses:
 *       '201':
 *         description: Batch created with parsed preview
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
 *                     batchId:
 *                       type: string
 *                     originalFileName:
 *                       type: string
 *                     totalRows:
 *                       type: integer
 *                     suggestedMapping:
 *                       type: object
 *                     columns:
 *                       type: array
 *                       items:
 *                         type: string
 *                     rows:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           rowNumber:
 *                             type: integer
 *                           state:
 *                             type: string
 *                           data:
 *                             type: object
 *                           errors:
 *                             type: array
 *                             items:
 *                               type: string
 *                           warnings:
 *                             type: array
 *                             items:
 *                               type: string
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalRows:
 *                           type: integer
 *                         validRows:
 *                           type: integer
 *                         warningRows:
 *                           type: integer
 *                         invalidRows:
 *                           type: integer
 *                         createdCount:
 *                           type: integer
 *                         failedCount:
 *                           type: integer
 *       '400':
 *         description: Validation error or unsupported file type
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions or employee limit reached
 *       '413':
 *         description: File too large
 */
router.post(
  "/upload",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_CREATE),
  employeeGuard,
  upload.single("file"),
  uploadAndPreview,
);

/**
 * @openapi
 * /imports/:
 *   get:
 *     summary: List import batches
 *     description: Returns a paginated list of employee-import batches for the
 *       tenant, optionally filtered by state or by a creation date range.
 *     tags: [Imports]
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
 *         name: state
 *         schema:
 *           type: string
 *           enum: [UPLOADED, PARSED, PREVIEW_READY, QUEUED, PROCESSING, COMPLETED, PARTIALLY_COMPLETED, FAILED, CANCELLED]
 *       - in: query
 *         name: fromDate
 *         schema:
 *           type: string
 *           format: date-time
 *       - in: query
 *         name: toDate
 *         schema:
 *           type: string
 *           format: date-time
 *     responses:
 *       '200':
 *         description: Paginated list of import batches
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
 *                     batches:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           status:
 *                             type: string
 *                           state:
 *                             type: string
 *                           originalFileName:
 *                             type: string
 *                           fileChecksum:
 *                             type: string
 *                           fileSizeBytes:
 *                             type: integer
 *                           totalRows:
 *                             type: integer
 *                           idempotencyKey:
 *                             type: string
 *                           columnMapping:
 *                             type: object
 *                           unmappedColumns:
 *                             type: array
 *                             items:
 *                               type: string
 *                           confidence:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                           summary:
 *                             type: object
 *                             properties:
 *                               totalRows:
 *                                 type: integer
 *                               validRows:
 *                                 type: integer
 *                               warningRows:
 *                                 type: integer
 *                               invalidRows:
 *                                 type: integer
 *                               createdCount:
 *                                 type: integer
 *                               failedCount:
 *                                 type: integer
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
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 */
router.get(
  "/",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_READ),
  listBatches,
);

// ── Parametric routes (/:batchId) ───────────────────────────────────────────

/**
 * @openapi
 * /imports/{batchId}/mapping:
 *   put:
 *     summary: Update column mapping
 *     description: Replaces the column-to-field mapping for an import batch and
 *       revalidates all stored rows against the new mapping. The batch is moved
 *       back to the preview-ready state so the import can be confirmed again.
 *     tags: [Imports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             additionalProperties:
 *               type: string
 *               nullable: true
 *             example:
 *               Full Name: fullName
 *               Email: email
 *     responses:
 *       '200':
 *         description: Updated mapping preview
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
 *                     batchId:
 *                       type: string
 *                     originalFileName:
 *                       type: string
 *                     totalRows:
 *                       type: integer
 *                     suggestedMapping:
 *                       type: object
 *                     columns:
 *                       type: array
 *                       items:
 *                         type: string
 *                     rows:
 *                       type: array
 *                       items:
 *                         type: object
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalRows:
 *                           type: integer
 *                         validRows:
 *                           type: integer
 *                         warningRows:
 *                           type: integer
 *                         invalidRows:
 *                           type: integer
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 */
router.put(
  "/:batchId/mapping",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_CREATE),
  updateMapping,
);

/**
 * @openapi
 * /imports/{batchId}/confirm:
 *   post:
 *     summary: Confirm and execute import
 *     description: Confirms a preview-ready import batch and enqueues the import
 *       job that creates the employee records. Returns the updated batch state
 *       along with the job result. The idempotency key makes the confirm
 *       operation safe to retry.
 *     tags: [Imports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [idempotencyKey]
 *             properties:
 *               idempotencyKey:
 *                 type: string
 *                 description: Unique key to make the confirm operation idempotent
 *     responses:
 *       '200':
 *         description: Import job confirmed and enqueued
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
 *                     totalRows:
 *                       type: integer
 *                     summary:
 *                       type: object
 *                     jobResult:
 *                       type: object
 *       '400':
 *         description: Validation error or invalid batch state
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 *       '404':
 *         description: Batch not found
 */
router.post(
  "/:batchId/confirm",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_CREATE),
  employeeGuard,
  confirmImport,
);

/**
 * @openapi
 * /imports/{batchId}:
 *   get:
 *     summary: Get batch status
 *     description: Returns the current state, mapping and validation summary of a
 *       single employee-import batch.
 *     tags: [Imports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Batch details
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
 *                     originalFileName:
 *                       type: string
 *                     totalRows:
 *                       type: integer
 *                     state:
 *                       type: string
 *                     columnMapping:
 *                       type: object
 *                     summary:
 *                       type: object
 *                       properties:
 *                         totalRows:
 *                           type: integer
 *                         validRows:
 *                           type: integer
 *                         warningRows:
 *                           type: integer
 *                         invalidRows:
 *                           type: integer
 *                         createdCount:
 *                           type: integer
 *                         failedCount:
 *                           type: integer
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 *       '404':
 *         description: Batch not found
 */
router.get(
  "/:batchId",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_READ),
  getBatchStatus,
);

/**
 * @openapi
 * /imports/{batchId}/cancel:
 *   post:
 *     summary: Cancel import batch
 *     description: Cancels an employee-import batch. Only batches that have not
 *       reached a terminal state can be cancelled.
 *     tags: [Imports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Batch cancelled
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
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 *       '404':
 *         description: Batch not found
 */
router.post(
  "/:batchId/cancel",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_CREATE),
  cancelBatch,
);

/**
 * @openapi
 * /imports/{batchId}/retry:
 *   post:
 *     summary: Retry failed rows
 *     description: Resets failed rows of a batch back to pending and enqueues a
 *       new import job to retry them. Optional rowNumbers restricts the retry to
 *       specific rows instead of all failed rows.
 *     tags: [Imports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               rowNumbers:
 *                 type: array
 *                 items:
 *                   type: integer
 *                 description: Row numbers to retry. Omit to retry all failed rows.
 *     responses:
 *       '200':
 *         description: Batch requeued for retry
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
 *       '400':
 *         description: Invalid batch state or validation error
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 *       '404':
 *         description: Batch not found
 */
router.post(
  "/:batchId/retry",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_CREATE),
  retryFailedRows,
);

/**
 * @openapi
 * /imports/{batchId}/export:
 *   get:
 *     summary: Export import results
 *     description: Exports the rows of an import batch as a downloadable CSV or
 *       XLSX file, optionally filtered by row status.
 *     tags: [Imports]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: batchId
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: format
 *         schema:
 *           type: string
 *           enum: [csv, xlsx]
 *           default: xlsx
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [VALID, WARNING, INVALID, PENDING, CREATED, FAILED, SKIPPED]
 *     responses:
 *       '200':
 *         description: Exported results file
 *         content:
 *           text/csv:
 *             schema:
 *               type: string
 *               format: binary
 *           application/vnd.openxmlformats-officedocument.spreadsheetml.sheet:
 *             schema:
 *               type: string
 *               format: binary
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 */
router.get(
  "/:batchId/export",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_READ),
  exportGuard,
  exportResults,
);

export default router;
