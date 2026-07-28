import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import {
  getUsageController,
  getLimitsController,
} from "./entitlement.controller.js";

const router = Router();

// All entitlement routes require authentication + tenant context
router.use(authenticate, tenantScoping);

router.get("/usage", getUsageController);
router.get("/limits", getLimitsController);

export default router;
