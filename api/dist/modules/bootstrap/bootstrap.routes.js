import { Router } from "express";
import { createRateLimiter } from "../../common/middlewares/rateLimit.middleware.js";
import { bootstrapSuperAdminController } from "./bootstrap.controller.js";
const router = Router();
router.post("/super-admin", createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5, message: "Too many bootstrap attempts" }), bootstrapSuperAdminController);
export default router;
//# sourceMappingURL=bootstrap.routes.js.map