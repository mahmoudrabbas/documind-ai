import { Router } from "express";
import { authenticate } from "../../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../../permissions/permissions.middleware.js";
import { Permission } from "../../permissions/permissions.catalog.js";
import {
  startIndexController,
  getIndexStatusController,
  retryIndexController,
  reindexController,
  getSearchStatusController,
} from "./indexing.controller.js";

const router = Router();

router.post(
  "/:id/index",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_UPDATE),
  startIndexController,
);

router.get(
  "/:id/index/status",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getIndexStatusController,
);

router.post(
  "/:id/index/retry",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_UPDATE),
  retryIndexController,
);

router.post(
  "/:id/index/reindex",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_UPDATE),
  reindexController,
);

router.get(
  "/:id/search-status",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getSearchStatusController,
);

export default router;
