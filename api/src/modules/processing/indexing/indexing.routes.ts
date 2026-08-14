import { Router } from "express";
import { authenticate } from "../../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../../permissions/permissions.middleware.js";
import { Permission } from "../../permissions/permissions.catalog.js";
import {
  startIndexController,
  getIndexStatusController,
  retryIndexController,
  reindexController,
  getSearchStatusController,
} from "./indexing.controller.js";

const router = Router();

/**
 * @openapi
 * /documents/{id}/index:
 *   post:
 *     summary: Start index generation
 *     description: Starts a new index generation for a document. Chunking,
 *       embedding and indexing jobs are enqueued asynchronously, and the
 *       generation is tracked until the document becomes searchable.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               triggeredBy:
 *                 type: string
 *                 enum: [INITIAL, REINDEX, ACCESS_POLICY_CHANGE, MODEL_UPGRADE]
 *                 default: INITIAL
 *               chunkingConfig:
 *                 type: object
 *                 properties:
 *                   targetTokens:
 *                     type: integer
 *                   hardCeiling:
 *                     type: integer
 *                   overlap:
 *                     type: integer
 *               department:
 *                 type: string
 *                 nullable: true
 *               classification:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       202:
 *         description: Index generation started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Index generation started
 *                 generationId:
 *                   type: string
 *                 generationNumber:
 *                   type: integer
 *                 status:
 *                   type: string
 *       400:
 *         description: Validation error or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/index",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_UPDATE),
  startIndexController,
);

/**
 * @openapi
 * /documents/{id}/index/status:
 *   get:
 *     summary: Get index generation status
 *     description: Returns the status of the latest index generation for a
 *       document, including chunk and embedding counts, Atlas index state and
 *       any failure reason.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     responses:
 *       200:
 *         description: Index generation status
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
 *                     generationId:
 *                       type: string
 *                     documentId:
 *                       type: string
 *                     documentVersion:
 *                       type: integer
 *                     generationNumber:
 *                       type: integer
 *                     status:
 *                       type: string
 *                     expectedChunkCount:
 *                       type: integer
 *                     actualChunkCount:
 *                       type: integer
 *                     expectedEmbeddingCount:
 *                       type: integer
 *                     actualEmbeddingCount:
 *                       type: integer
 *                     atlasIndexName:
 *                       type: string
 *                     atlasIndexStatus:
 *                       type: string
 *                     triggeredBy:
 *                       type: string
 *                     failureReason:
 *                       type: string
 *       400:
 *         description: Invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document or index generation not found
 *       500:
 *         description: Internal server error
 */
router.get(
  "/:id/index/status",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getIndexStatusController,
);

/**
 * @openapi
 * /documents/{id}/index/retry:
 *   post:
 *     summary: Retry index generation
 *     description: Retries a failed or verifying index generation for a
 *       document. Orphaned chunks and embeddings from the previous attempt
 *       are cleaned up before the pipeline is re-enqueued.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     responses:
 *       202:
 *         description: Index generation retry started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Index generation retry started
 *                 generationId:
 *                   type: string
 *                 generationNumber:
 *                   type: integer
 *                 status:
 *                   type: string
 *       400:
 *         description: Invalid document id or generation not retryable
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document or index generation not found
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/index/retry",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_UPDATE),
  retryIndexController,
);

/**
 * @openapi
 * /documents/{id}/index/reindex:
 *   post:
 *     summary: Reindex document
 *     description: Starts a new index generation for a document triggered by
 *       a reindex. Optional chunking configuration, department and
 *       classification can be supplied.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               chunkingConfig:
 *                 type: object
 *                 properties:
 *                   targetTokens:
 *                     type: integer
 *                   hardCeiling:
 *                     type: integer
 *                   overlap:
 *                     type: integer
 *               department:
 *                 type: string
 *                 nullable: true
 *               classification:
 *                 type: string
 *                 nullable: true
 *     responses:
 *       202:
 *         description: Reindex generation started
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Reindex generation started
 *                 generationId:
 *                   type: string
 *                 generationNumber:
 *                   type: integer
 *                 status:
 *                   type: string
 *       400:
 *         description: Validation error or invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.post(
  "/:id/index/reindex",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_UPDATE),
  reindexController,
);

/**
 * @openapi
 * /documents/{id}/search-status:
 *   get:
 *     summary: Get search status
 *     description: Returns whether a document is searchable, the active chunk
 *       generation and the latest index generation details if one exists.
 *     tags: [Documents]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Document id
 *     responses:
 *       200:
 *         description: Search status
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
 *                     searchStatus:
 *                       type: string
 *                     activeChunkGeneration:
 *                       type: string
 *                     latestGeneration:
 *                       type: object
 *                       nullable: true
 *       400:
 *         description: Invalid document id
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Document not found or access denied
 *       500:
 *         description: Internal server error
 */
router.get(
  "/:id/search-status",
  authenticate,
  tenantScoping,
  requirePermission(Permission.DOCUMENTS_READ),
  getSearchStatusController,
);

export default router;
