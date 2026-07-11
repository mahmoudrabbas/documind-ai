import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import {
  createRoleController,
  deleteRoleController,
  listRolesController,
  updateRoleController,
} from "./roles.controller.js";

const router = Router();

router.get(
  "/",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN"),
  listRolesController,
);

router.post(
  "/",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN"),
  createRoleController,
);

router.patch(
  "/:id",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN"),
  updateRoleController,
);

router.delete(
  "/:id",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN"),
  deleteRoleController,
);

export default router;
