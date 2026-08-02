import { Router } from "express";
import multer from "multer";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { config } from "../../config/index.js";
import {
  uploadAndAnalyze,
  getCampaign,
  confirmCampaign,
  cancelCampaign,
  listCampaigns,
} from "./invitationCampaign.controller.js";

const allowedMimeTypes = config.IMPORT_ALLOWED_MIME_TYPES.split(",");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.IMPORT_MAX_FILE_SIZE_BYTES },
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
  requirePermission(Permission.IMPORTS_CREATE),
  upload.single("file"),
  uploadAndAnalyze,
);

router.get(
  "/",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_READ),
  listCampaigns,
);

router.get(
  "/:campaignId",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_READ),
  getCampaign,
);

router.post(
  "/:campaignId/confirm",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_CREATE),
  confirmCampaign,
);

router.post(
  "/:campaignId/cancel",
  authenticate,
  tenantScoping,
  requirePermission(Permission.IMPORTS_CREATE),
  cancelCampaign,
);

export default router;
