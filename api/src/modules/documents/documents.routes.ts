import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { config } from "../../config/index.js";
import {
  uploadDocumentController,
  listDocumentsController,
  getDocumentController,
  updateDocumentMetadataController,
  deleteDocumentController,
} from "./documents.controller.js";

const allowedMimeTypes = config.ALLOWED_MIME_TYPES.split(",").map((t) => t.trim());

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: config.MAX_FILE_SIZE_BYTES,
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

router.post(
  "/",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN", "EMPLOYEE"),
  upload.single("file"),
  uploadDocumentController,
);

router.get(
  "/",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN", "EMPLOYEE"),
  listDocumentsController,
);

router.get(
  "/:id",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN", "EMPLOYEE"),
  getDocumentController,
);

router.patch(
  "/:id",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN", "EMPLOYEE"),
  updateDocumentMetadataController,
);

router.delete(
  "/:id",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN", "EMPLOYEE"),
  deleteDocumentController,
);

export default router;
