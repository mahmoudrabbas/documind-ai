import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { authorize } from "../../common/middlewares/authorize.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { createRetrievalController } from "./retrieval.controller.js";
import type { HybridRetrievalService } from "./retrieval.service.js";

/**
 * Creates retrieval routes bound to a HybridRetrievalService instance.
 *
 * Routes:
 *   GET  /retrieval/debug   — SUPER_ADMIN-only debug endpoint
 *   POST /retrieval/search  — Authenticated hybrid search
 */
export function createRetrievalRoutes(
  service: HybridRetrievalService,
): Router {
  const router = Router();
  const controller = createRetrievalController(service);

  // Debug endpoint — SUPER_ADMIN only
  /**
   * @openapi
   * /retrieval/debug:
   *   get:
   *     summary: Run a debug hybrid search
   *     description: Runs a hybrid vector and keyword retrieval search with
   *       full diagnostics including filter summary, latency breakdowns and
   *       candidate scores. Restricted to SUPER_ADMIN users.
   *     tags: [Retrieval]
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: q
   *         required: true
   *         schema:
   *           type: string
   *         description: Query text
   *       - in: query
   *         name: topK
   *         schema:
   *           type: integer
   *           default: 10
   *           maximum: 100
   *       - in: query
   *         name: documentIds
   *         schema:
   *           type: string
   *         description: Comma-separated document ids to restrict results to
   *       - in: query
   *         name: categories
   *         schema:
   *           type: string
   *         description: Comma-separated categories to restrict results to
   *       - in: query
   *         name: departments
   *         schema:
   *           type: string
   *         description: Comma-separated departments to restrict results to
   *       - in: query
   *         name: classifications
   *         schema:
   *           type: string
   *         description: Comma-separated classifications to restrict results to
   *       - in: query
   *         name: dateFrom
   *         schema:
   *           type: string
   *         description: Inclusive start date filter
   *       - in: query
   *         name: dateTo
   *         schema:
   *           type: string
   *         description: Inclusive end date filter
   *       - in: query
   *         name: versionIds
   *         schema:
   *           type: string
   *         description: Comma-separated document version ids to restrict results to
   *     responses:
   *       200:
   *         description: Debug retrieval results with diagnostics
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
   *                     query:
   *                       type: string
   *                     candidates:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           chunkId:
   *                             type: string
   *                           documentId:
   *                             type: string
   *                           documentVersionId:
   *                             type: string
   *                           text:
   *                             type: string
   *                           score:
   *                             type: number
   *                           retrievalMethod:
   *                             type: string
   *                             enum: [vector, keyword, hybrid]
   *                     totalCandidates:
   *                       type: integer
   *                     filterSummary:
   *                       type: object
   *                     diagnostics:
   *                       type: object
   *                       properties:
   *                         totalLatencyMs:
   *                           type: number
   *                         vectorCandidateCount:
   *                           type: integer
   *                         keywordCandidateCount:
   *                           type: integer
   *                         traceId:
   *                           type: string
   *                     evidenceBundle:
   *                       type: object
   *                 trace:
   *                   type: object
   *                   properties:
   *                     requestId:
   *                       type: string
   *                     tenantId:
   *                       type: string
   *                     resultCount:
   *                       type: integer
   *                     query:
   *                       type: string
   *       400:
   *         description: Validation failed
   *       401:
   *         description: Authentication required
   *       403:
   *         description: SUPER_ADMIN role required
   */
  router.get(
    "/debug",
    authenticate,
    tenantScoping,
    authorize("SUPER_ADMIN"),
    controller.debugSearch,
  );

  // Hybrid search — any authenticated user with DOCUMENTS_READ
  /**
   * @openapi
   * /retrieval/search:
   *   post:
   *     summary: Run a hybrid search
   *     description: Performs hybrid vector and keyword retrieval over the
   *       tenant's documents for any authenticated user with the DOCUMENTS_READ
   *       permission. Supports optional filters to narrow the search.
   *     tags: [Retrieval]
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [queryText]
   *             properties:
   *               queryText:
   *                 type: string
   *                 minLength: 1
   *                 example: remote work policy
   *               topK:
   *                 type: integer
   *                 minimum: 1
   *                 maximum: 100
   *                 default: 10
   *               filter:
   *                 type: object
   *                 properties:
   *                   documentIds:
   *                     type: array
   *                     items:
   *                       type: string
   *                   categories:
   *                     type: array
   *                     items:
   *                       type: string
   *                   departments:
   *                     type: array
   *                     items:
   *                       type: string
   *                   classifications:
   *                     type: array
   *                     items:
   *                       type: string
   *                   dateFrom:
   *                     type: string
   *                   dateTo:
   *                     type: string
   *                   versionIds:
   *                     type: array
   *                     items:
   *                       type: string
   *     responses:
   *       200:
   *         description: Retrieval results
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
   *                     query:
   *                       type: string
   *                     candidates:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           chunkId:
   *                             type: string
   *                           documentId:
   *                             type: string
   *                           documentVersionId:
   *                             type: string
   *                           text:
   *                             type: string
   *                           score:
   *                             type: number
   *                           retrievalMethod:
   *                             type: string
   *                             enum: [vector, keyword, hybrid]
   *                     totalCandidates:
   *                       type: integer
   *                     filterSummary:
   *                       type: object
   *                     diagnostics:
   *                       type: object
   *                     evidenceBundle:
   *                       type: object
   *       400:
   *         description: Validation failed
   *       401:
   *         description: Authentication required
   *       403:
   *         description: Insufficient permissions
   */
  router.post(
    "/search",
    authenticate,
    tenantScoping,
    requirePermission(Permission.DOCUMENTS_READ),
    controller.hybridSearch,
  );

  return router;
}
