import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  createCheckoutController,
  checkoutStatusController,
  listCheckoutSessionsController,
  subscriptionStatusController,
  createBillingPortalController,
  synchronizeCheckoutSessionController,
} from "./checkout.controller.js";

const router = Router();

router.use(authenticate, tenantScoping);

router.post(
  "/sessions",
  requirePermission(Permission.BILLING_MANAGE),
  createCheckoutController,
);

router.post(
  "/sessions/:sessionId/sync",
  requirePermission(Permission.BILLING_MANAGE),
  synchronizeCheckoutSessionController,
);

router.get(
  "/sessions/:checkoutId",
  requirePermission(Permission.BILLING_READ),
  checkoutStatusController,
);

router.get(
  "/sessions",
  requirePermission(Permission.BILLING_READ),
  listCheckoutSessionsController,
);

router.get(
  "/subscription",
  requirePermission(Permission.BILLING_READ),
  subscriptionStatusController,
);

router.post(
  "/billing-portal",
  requirePermission(Permission.BILLING_MANAGE),
  createBillingPortalController,
);

export default router;
