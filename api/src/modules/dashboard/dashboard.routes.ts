import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { getSummary } from "./dashboard.controller.js";

const router = Router();

router.use(authenticate, tenantScoping);
/**
 * @openapi
 * /dashboard/summary:
 *   get:
 *     summary: Dashboard summary
 *     description: Returns aggregate counters for the authenticated tenant's
 *       dashboard, including user, document, usage and knowledge gap counts plus
 *       recent activity and subscription plan info.
 *     tags: [Dashboard]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Dashboard summary
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 success:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     tenant:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                         name:
 *                           type: string
 *                         slug:
 *                           type: string
 *                         plan:
 *                           type: string
 *                         status:
 *                           type: string
 *                     users:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         active:
 *                           type: number
 *                         pendingInvitations:
 *                           type: number
 *                         disabled:
 *                           type: number
 *                     documents:
 *                       type: object
 *                       properties:
 *                         total:
 *                           type: number
 *                         processed:
 *                           type: number
 *                         processing:
 *                           type: number
 *                         failed:
 *                           type: number
 *                     usage:
 *                       type: object
 *                       properties:
 *                         questionsAsked7d:
 *                           type: number
 *                         questionsAsked30d:
 *                           type: number
 *                     knowledgeGaps:
 *                       type: object
 *                       properties:
 *                         open:
 *                           type: number
 *                         total:
 *                           type: number
 *                     recentActivity:
 *                       type: array
 *                       items:
 *                         type: object
 *                     generatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get(
  "/summary",
  requirePermission(Permission.ANALYTICS_READ),
  getSummary,
);

export default router;
