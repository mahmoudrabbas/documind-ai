import { Router } from "express";
import { createRateLimiter } from "../../common/middlewares/rateLimit.middleware.js";
import { bootstrapSuperAdminController } from "./bootstrap.controller.js";
import { config } from "../../config/index.js";
const router = Router();
router.post("/super-admin", (_req, res, next) => {
    if (!config.ENABLE_SUPER_ADMIN_BOOTSTRAP) {
        res.status(404).json({ success: false, message: "Not found", error: "NOT_FOUND", details: null });
        return;
    }
    next();
}, createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5, message: "Too many bootstrap attempts" }), bootstrapSuperAdminController);
export default router;
//# sourceMappingURL=bootstrap.routes.js.map