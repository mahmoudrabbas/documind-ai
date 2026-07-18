import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { config } from "../../config/index.js";
import {
  uploadDocumentController,
  listDocumentsController,
  getDocumentController,
  updateDocumentMetadataController,
  downloadDocumentController,
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

const router = Router();

router.post("/", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_CREATE), upload.single("file"), uploadDocumentController);

router.get("/", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_READ), listDocumentsController);

router.get("/:id/extraction", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_READ), getDocumentExtractionStatusController);

router.post("/:id/extraction/retrigger", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_UPDATE), retriggerDocumentExtractionController);

router.get("/:id", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_READ), getDocumentController);

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

router.get("/:id/versions", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_READ), listDocumentVersionsController);

router.put("/:id/replace", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_UPDATE), upload.single("file"), replaceDocumentController);

router.patch("/:id", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_UPDATE), updateDocumentMetadataController);

router.post("/:id/archive", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_ARCHIVE), archiveDocumentController);

router.post("/:id/restore", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_ARCHIVE), restoreDocumentController);

router.delete("/:id/permanent", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_DELETE), permanentDeleteDocumentController);

router.delete("/:id", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_DELETE), softDeleteDocumentController);

export default router;
