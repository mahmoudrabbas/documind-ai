import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import {
  inviteUserController,
  listUsersController,
  updateUserController,
} from "./users.controller.js";

const router = Router();

router.get(
  "/",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN", "EMPLOYEE"),
  listUsersController,
);

router.patch(
  "/:id",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN"),
  updateUserController,
);

router.post(
  "/",
  authenticate,
  tenantScoping,
  authorize("COMPANY_ADMIN"),
  inviteUserController,
);

export default router;
