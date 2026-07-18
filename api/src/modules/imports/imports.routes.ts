import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
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

const IMPORT_ALLOWED_MIME_TYPES = [
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", // .xlsx
  "application/vnd.ms-excel", // .xls
  "text/csv", // .csv
];

const IMPORT_MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB default

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: IMPORT_MAX_FILE_SIZE,
  },
  fileFilter: (_req, file, callback) => {
    if (IMPORT_ALLOWED_MIME_TYPES.includes(file.mimetype)) {
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

// ── Static routes (MUST come before /:batchId) ──────────────────────────────

router.get(
  "/template",
  authenticate,
  tenantScoping,
  downloadTemplate,
);

router.post(
  "/upload",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_CREATE),
  upload.single("file"),
  uploadAndPreview,
);

router.get(
  "/",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_READ),
  listBatches,
);

// ── Parametric routes (/:batchId) ───────────────────────────────────────────

router.put(
  "/:batchId/mapping",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_CREATE),
  updateMapping,
);

router.post(
  "/:batchId/confirm",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_CREATE),
  confirmImport,
);

router.get(
  "/:batchId",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_READ),
  getBatchStatus,
);

router.post(
  "/:batchId/cancel",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_CREATE),
  cancelBatch,
);

router.post(
  "/:batchId/retry",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_CREATE),
  retryFailedRows,
);

router.get(
  "/:batchId/export",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_READ),
  exportResults,
);

export default router;
