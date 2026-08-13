import { Router } from "express";
import { createRateLimiter } from "../../common/middlewares/rateLimit.middleware.js";
import { bootstrapSuperAdminController } from "./bootstrap.controller.js";
import { config } from "../../config/index.js";
const router = Router();
/**
 * @openapi
 * /internal/bootstrap/super-admin:
 *   post:
 *     summary: Bootstrap initial super admin
 *     description: Creates the platform super admin account during provisioning.
 *       Requires the X-Super-Admin-Bootstrap-Key header and is only available when
 *       super admin bootstrap is enabled. It is idempotent - an existing super
 *       admin account is returned as-is.
 *     tags: [Bootstrap]
 *     security: []
 *     parameters:
 *       - in: header
 *         name: X-Super-Admin-Bootstrap-Key
 *         required: true
 *         schema:
 *           type: string
 *         description: Shared bootstrap key
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [name, email, password]
 *             properties:
 *               name:
 *                 type: string
 *                 example: Super Admin
 *               email:
 *                 type: string
 *                 format: email
 *                 example: admin@documind.io
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "StrongPass123"
 *     responses:
 *       201:
 *         description: Initial super admin created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         email:
 *                           type: string
 *                         role:
 *                           type: string
 *                         status:
 *                           type: string
 *                         emailVerified:
 *                           type: boolean
 *                         createdAt:
 *                           type: string
 *                           format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Invalid bootstrap key
 *       404:
 *         description: Bootstrap disabled
 *       409:
 *         description: Super admin already configured
 */
router.post(
  "/super-admin",
  (_req, res, next) => {
    if (!config.ENABLE_SUPER_ADMIN_BOOTSTRAP) { res.status(404).json({ success: false, message: "Not found", error: "NOT_FOUND", details: null }); return; }
    next();
  },
  createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5, message: "Too many bootstrap attempts" }),
  bootstrapSuperAdminController,
);
export default router;
