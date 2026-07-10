import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { listTenantsController } from "./admin.controller.js";
const router = Router();
/**
 * GET /platform/tenants
 * List all tenants with optional filters (status, plan) and pagination
 * Requires SUPER_ADMIN role
 */
router.get("/tenants", authenticate, authorize("SUPER_ADMIN"), listTenantsController);
export default router;
//# sourceMappingURL=admin.routes.js.map