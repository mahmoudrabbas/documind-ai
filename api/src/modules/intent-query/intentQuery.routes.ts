import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  analyzeQueryController,
  getQueryPlanDebugController,
} from "./intentQuery.controller.js";
import { createEntitlementGuard } from "../entitlement/middlewares/entitlement.middleware.js";
import { getEntitlementService } from "../entitlement/entitlement.service.js";

const router = Router();

// Standard middlewares for authentication and tenant isolation
router.use(authenticate);
router.use(tenantScoping);

// ── Entitlement guards ─────────────────────────────────────────────────────

const svc = getEntitlementService();

const queryGuard = createEntitlementGuard(svc, {
  dimension: "queriesPerMonth",
  amount: 1,
  failMode: "fail-closed",
});

/**
 * @openapi
 * /intent-query/analyze:
 *   post:
 *     summary: Analyze a query into a structured plan
 *     description: Runs the intent-query agent over a user question and returns
 *       a structured query plan with the detected intent, route, extracted
 *       entities and generated search queries. May return a clarification
 *       request when the intent is ambiguous. Consumes a query entitlement.
 *     tags: [Intent Query]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [question]
 *             properties:
 *               question:
 *                 type: string
 *                 minLength: 1
 *                 maxLength: 2000
 *                 example: What is the remote work policy?
 *               conversationId:
 *                 type: string
 *                 description: 24-hex conversation id for follow-up context
 *               referencedDocumentIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 maxItems: 20
 *                 description: Document id hints for the query
 *               maxContext:
 *                 type: integer
 *                 minimum: 1
 *                 maximum: 50
 *                 default: 10
 *     responses:
 *       200:
 *         description: Structured query plan
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
 *                     traceId:
 *                       type: string
 *                     queryPlan:
 *                       type: object
 *                       properties:
 *                         schemaVersion:
 *                           type: string
 *                         normalizedQuestion:
 *                           type: string
 *                         originalQuestion:
 *                           type: string
 *                         language:
 *                           type: string
 *                           enum: [ar, en, mixed]
 *                         detectedIntent:
 *                           type: string
 *                           enum: [knowledge_question, follow_up, document_specific, comparison, summarization, navigation, administrative_action, social, unsupported, unsafe]
 *                         intentConfidence:
 *                           type: number
 *                         route:
 *                           type: string
 *                           enum: [social, rag, clarification, unsupported, unsafe]
 *                         entities:
 *                           type: array
 *                           items:
 *                             type: object
 *                         temporalConstraints:
 *                           type: array
 *                           items:
 *                             type: object
 *                         referencedDocumentIds:
 *                           type: array
 *                           items:
 *                             type: string
 *                         referencedDocumentTitles:
 *                           type: array
 *                           items:
 *                             type: string
 *                         departments:
 *                           type: array
 *                           items:
 *                             type: string
 *                         categories:
 *                           type: array
 *                           items:
 *                             type: string
 *                         exactTerms:
 *                           type: array
 *                           items:
 *                             type: string
 *                         semanticQueries:
 *                           type: array
 *                           items:
 *                             type: object
 *                         keywordQueries:
 *                           type: array
 *                           items:
 *                             type: object
 *                         clarificationNeeded:
 *                           type: boolean
 *                         clarification:
 *                           type: object
 *                         isFollowUp:
 *                           type: boolean
 *                         conversationContextUsed:
 *                           type: boolean
 *                         promptVersion:
 *                           type: string
 *                         modelVersion:
 *                           type: string
 *                         processingMetadata:
 *                           type: object
 *                           properties:
 *                             tokensUsed:
 *                               type: integer
 *                             latencyMs:
 *                               type: integer
 *                             estimatedCost:
 *                               type: number
 *                             fallbackUsed:
 *                               type: boolean
 *       400:
 *         description: Validation failed
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or entitlement limit reached
 */
// POST /intent-query/analyze — requires chat:create permission
router.post(
  "/analyze",
  requirePermission(Permission.CHAT_CREATE),
  queryGuard,
  analyzeQueryController
);

/**
 * @openapi
 * /intent-query/debug/{traceId}:
 *   get:
 *     summary: Get a query plan debug trace
 *     description: Returns the stored debug trace for a previously analyzed
 *       query, including the raw query plan, timing and extracted entities.
 *       Restricted to COMPANY_ADMIN and SUPER_ADMIN roles and scoped to the
 *       caller's tenant.
 *     tags: [Intent Query]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: traceId
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Debug trace
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
 *                     traceId:
 *                       type: string
 *                     tenantId:
 *                       type: string
 *                     queryPlan:
 *                       type: object
 *                     timing:
 *                       type: object
 *                     promptVersion:
 *                       type: string
 *                     modelVersion:
 *                       type: string
 *                     rawEntities:
 *                       type: array
 *                       items:
 *                         type: object
 *                     fallbackUsed:
 *                       type: boolean
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Admin role required
 *       404:
 *         description: Trace not found
 */
// GET /intent-query/debug/:traceId — requires chat:read permission (controller also rechecks for admins and tenant)
router.get(
  "/debug/:traceId",
  requirePermission(Permission.CHAT_READ),
  getQueryPlanDebugController
);

export default router;
