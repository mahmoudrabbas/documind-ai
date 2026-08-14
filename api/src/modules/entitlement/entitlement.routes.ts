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

/**
 * @openapi
 * /entitlement/usage:
 *   get:
 *     summary: Get current usage and limits
 *     description: Returns the authenticated tenant's current usage versus plan
 *       limits for the current billing period, along with period boundaries and
 *       actual dashboard projections for documents, storage and questions.
 *     tags: [Entitlement]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Usage and limits for the current period
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
 *                     current:
 *                       type: object
 *                       description: Quota counter usage keyed by dimension
 *                     limit:
 *                       type: object
 *                       description: Plan limits keyed by dimension
 *                     actual:
 *                       type: object
 *                       properties:
 *                         documents:
 *                           type: integer
 *                         storageBytes:
 *                           type: integer
 *                         questions:
 *                           type: integer
 *                     periodStart:
 *                       type: string
 *                       format: date-time
 *                     periodEnd:
 *                       type: string
 *                       format: date-time
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Missing tenant context or inactive subscription
 */
router.get("/usage", getUsageController);
/**
 * @openapi
 * /entitlement/limits:
 *   get:
 *     summary: Get plan limits
 *     description: Returns the full entitlement snapshot for the authenticated
 *       tenant, containing plan-configured limits and capabilities. Usage
 *       counters are not included.
 *     tags: [Entitlement]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Plan limits snapshot
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
 *                   description: Entitlement snapshot keyed by dimension
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Missing tenant context or inactive subscription
 */
router.get("/limits", getLimitsController);

export default router;
