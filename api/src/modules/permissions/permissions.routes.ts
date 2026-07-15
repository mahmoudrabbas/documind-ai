import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import {
  getPermissionCatalogController,
  getMyPermissionsController,
} from "./permissions.controller.js";

const router = Router();

router.get(
  "/",
  authenticate,
  tenantScoping,
  getPermissionCatalogController,
);

router.get(
  "/me",
  authenticate,
  tenantScoping,
  getMyPermissionsController,
);

export default router;
