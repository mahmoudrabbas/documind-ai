import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePlatformTenant } from "../../common/middlewares/platformTenant.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  startRunController,
  getRunController,
  listRunsController,
  resumeApprovalController,
  listApprovalsController,
  expireApprovalsController,
  listRunsAdminController,
  getRunAdminController,
} from "./agents.controller.js";
import { createEntitlementGuard, createEntitlementCheckGuard } from "../entitlement/middlewares/entitlement.middleware.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";

const router = Router();

router.use(authenticate);
router.use(tenantScoping);

// ── Entitlement guards ─────────────────────────────────────────────────────

const queryGuard = createEntitlementGuard(getEntitlementService(), {
  dimension: "queriesPerMonth",
  amount: 1,
  failMode: "fail-open",
});

const tokenCheckGuard = createEntitlementCheckGuard(getEntitlementService(), {
  dimension: "tokensPerMonth",
  failMode: "fail-closed",
});

/**
 * @openapi
 * /agents/runs:
 *   post:
 *     summary: Start an agent run
 *     description: Starts a new agent run for the authenticated tenant. The run
 *       is executed by the agent supervisor, which may require approval for
 *       sensitive tool calls. Monthly query and token entitlement limits are
 *       enforced before the run is started.
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [workflowName, agentName]
 *             properties:
 *               workflowName:
 *                 type: string
 *               agentName:
 *                 type: string
 *               input:
 *                 type: object
 *                 additionalProperties: true
 *               modelProvider:
 *                 type: string
 *                 default: fake
 *               modelName:
 *                 type: string
 *                 default: fake-default
 *               promptVersion:
 *                 type: string
 *               promptVersionId:
 *                 type: string
 *               toolVersionSnapshot:
 *                 type: string
 *               maxSteps:
 *                 type: integer
 *               maxToolCalls:
 *                 type: integer
 *               maxTokens:
 *                 type: integer
 *               budgetMs:
 *                 type: integer
 *     responses:
 *       '201':
 *         description: Run started
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
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                       enum: [pending, running, awaiting_approval, completed, failed, cancelled, expired]
 *                     workflowName:
 *                       type: string
 *                     agentName:
 *                       type: string
 *                     modelProvider:
 *                       type: string
 *                     modelName:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       '400':
 *         description: Validation error
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions or entitlement limit reached
 */
router.post("/runs", queryGuard, tokenCheckGuard, requirePermission(Permission.CHAT_CREATE), startRunController);
/**
 * @openapi
 * /agents/runs:
 *   get:
 *     summary: List agent runs
 *     description: Returns a paginated list of agent runs for the tenant,
 *       optionally filtered by status, agent name or trace id.
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, running, awaiting_approval, completed, failed, cancelled, expired]
 *       - in: query
 *         name: agentName
 *         schema:
 *           type: string
 *       - in: query
 *         name: traceId
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Paginated list of agent runs
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
 *                     runs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           status:
 *                             type: string
 *                           workflowName:
 *                             type: string
 *                           agentName:
 *                             type: string
 *                           modelProvider:
 *                             type: string
 *                           modelName:
 *                             type: string
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     totalRecords:
 *                       type: integer
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 */
router.get("/runs", requirePermission(Permission.CHAT_READ), listRunsController);
/**
 * @openapi
 * /agents/runs/{runId}:
 *   get:
 *     summary: Get an agent run
 *     description: Returns a single agent run for the tenant along with its steps,
 *       tool calls and any approval records. Runs belonging to other tenants are
 *       not exposed.
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Run details
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
 *                     run:
 *                       type: object
 *                     steps:
 *                       type: array
 *                       items:
 *                         type: object
 *                     toolCalls:
 *                       type: array
 *                       items:
 *                         type: object
 *                     approvals:
 *                       type: array
 *                       items:
 *                         type: object
 *       '400':
 *         description: Malformed runId
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 *       '404':
 *         description: Run not found
 */
router.get("/runs/:runId", requirePermission(Permission.CHAT_READ), getRunController);
/**
 * @openapi
 * /agents/runs/{runId}/approvals/{approvalId}/resume:
 *   post:
 *     summary: Resume an awaiting run with an approval decision
 *     description: Resolves a pending approval for an agent run and resumes the
 *       run with the decision. Approving allows the sensitive tool call to
 *       proceed while rejecting cancels it. A decision note may be recorded.
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *       - in: path
 *         name: approvalId
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [decision]
 *             properties:
 *               decision:
 *                 type: string
 *                 enum: [approve, reject]
 *               decisionNote:
 *                 type: string
 *                 maxLength: 500
 *     responses:
 *       '200':
 *         description: Run resumed with the approval decision
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
 *       '400':
 *         description: Validation error or malformed id
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 *       '404':
 *         description: Run or approval not found
 *       '409':
 *         description: Invalid state transition
 */
router.post(
  "/runs/:runId/approvals/:approvalId/resume",
  requirePermission(Permission.CHAT_READ),
  requirePermission(Permission.CHAT_CREATE),
  resumeApprovalController,
);
/**
 * @openapi
 * /agents/approvals:
 *   get:
 *     summary: List approvals
 *     description: Returns a paginated list of approval requests for the tenant's
 *       agent runs, optionally filtered by status.
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 50
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, approved, rejected, expired]
 *     responses:
 *       '200':
 *         description: Paginated list of approvals
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
 *                     approvals:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           runId:
 *                             type: string
 *                           status:
 *                             type: string
 *                             enum: [pending, approved, rejected, expired]
 *                           requestedBy:
 *                             type: string
 *                           expiresAt:
 *                             type: string
 *                             format: date-time
 *                           createdAt:
 *                             type: string
 *                             format: date-time
 *                     totalRecords:
 *                       type: integer
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 */
router.get("/approvals", requirePermission(Permission.CHAT_READ), listApprovalsController);
/**
 * @openapi
 * /agents/approvals/expire:
 *   post:
 *     summary: Expire stale approvals
 *     description: Marks all pending approvals that have passed their expiry time
 *       as expired for the tenant. Returns the number of approvals expired.
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       '200':
 *         description: Stale approvals expired
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
 *                     expired:
 *                       type: integer
 *                       description: Number of approvals marked as expired
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Insufficient permissions
 */
router.post("/approvals/expire", requirePermission(Permission.CHAT_DELETE), expireApprovalsController);

const adminRouter = Router();
adminRouter.use(authenticate);
adminRouter.use(requirePlatformTenant);
adminRouter.use(requirePermission(Permission.CHAT_READ));
/**
 * @openapi
 * /super-admin/agents/runs:
 *   get:
 *     summary: List agent runs across all tenants
 *     description: Platform-only endpoint that returns a paginated list of agent
 *       runs across all tenants, optionally filtered by status, agent name or
 *       trace id. Requires a super-admin platform tenant context.
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [pending, running, awaiting_approval, completed, failed, cancelled, expired]
 *       - in: query
 *         name: agentName
 *         schema:
 *           type: string
 *       - in: query
 *         name: traceId
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Paginated list of agent runs
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
 *                     runs:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           tenantId:
 *                             type: string
 *                           status:
 *                             type: string
 *                           workflowName:
 *                             type: string
 *                           agentName:
 *                             type: string
 *                     totalRecords:
 *                       type: integer
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Platform tenant or permission required
 */
adminRouter.get("/runs", listRunsAdminController);
/**
 * @openapi
 * /super-admin/agents/runs/{runId}:
 *   get:
 *     summary: Get an agent run across tenants
 *     description: Platform-only endpoint that returns a single agent run by id
 *       from any tenant, along with its steps, tool calls and approvals. Requires
 *       a super-admin platform tenant context.
 *     tags: [Agents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: runId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       '200':
 *         description: Run details
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
 *                     run:
 *                       type: object
 *                     steps:
 *                       type: array
 *                       items:
 *                         type: object
 *                     toolCalls:
 *                       type: array
 *                       items:
 *                         type: object
 *                     approvals:
 *                       type: array
 *                       items:
 *                         type: object
 *       '400':
 *         description: Malformed runId
 *       '401':
 *         description: Authentication required
 *       '403':
 *         description: Platform tenant or permission required
 *       '404':
 *         description: Run not found
 */
adminRouter.get("/runs/:runId", getRunAdminController);

export { router as agentsRoutes, adminRouter as agentsAdminRoutes };
