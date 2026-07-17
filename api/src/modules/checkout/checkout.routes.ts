import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import {
  createCheckoutController,
  checkoutStatusController,
  listCheckoutSessionsController,
  subscriptionStatusController,
} from "./checkout.controller.js";

const router = Router();

router.use(authenticate);

router.post(
  "/sessions",
  authorize("COMPANY_ADMIN"),
  tenantScoping,
  createCheckoutController,
);

router.get(
  "/sessions/:checkoutId",
  authorize("COMPANY_ADMIN", "EMPLOYEE"),
  tenantScoping,
  checkoutStatusController,
);

router.get(
  "/sessions",
  authorize("COMPANY_ADMIN", "EMPLOYEE"),
  tenantScoping,
  listCheckoutSessionsController,
);

router.get(
  "/subscription",
  authorize("COMPANY_ADMIN", "EMPLOYEE"),
  tenantScoping,
  subscriptionStatusController,
);

export default router;
