import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { reconciliationController } from "./reconciliation.controller.js";

const router = Router();
router.use(authenticate, authorize("SUPER_ADMIN"));
router.post("/reconciliation/subscriptions", reconciliationController);

export default router;
