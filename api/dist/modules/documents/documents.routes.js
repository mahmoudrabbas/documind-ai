import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { config } from "../../config/index.js";
import { uploadDocumentController, listDocumentsController, getDocumentController, updateDocumentMetadataController, deleteDocumentController, } from "./documents.controller.js";
const allowedMimeTypes = config.ALLOWED_MIME_TYPES.split(",").map((t) => t.trim());
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: config.MAX_FILE_SIZE_BYTES,
    },
    fileFilter: (_req, file, callback) => {
        if (allowedMimeTypes.includes(file.mimetype)) {
            callback(null, true);
        }
        else {
            callback(Object.assign(new Error(`File type ${file.mimetype} is not supported`), {
                code: "UNSUPPORTED_FILE_TYPE",
            }));
        }
    },
});
const router = Router();
router.post("/", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_CREATE), upload.single("file"), uploadDocumentController);
router.get("/", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_READ), listDocumentsController);
router.get("/:id", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_READ), getDocumentController);
router.patch("/:id", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_UPDATE), updateDocumentMetadataController);
router.delete("/:id", authenticate, tenantScoping, requirePermission(Permission.DOCUMENTS_DELETE), deleteDocumentController);
export default router;
//# sourceMappingURL=documents.routes.js.map