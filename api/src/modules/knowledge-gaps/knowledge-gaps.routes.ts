import { Router } from "express";
import { authenticate } from "../../common/middlewares/authenticate.middleware.js";
import { tenantScoping } from "../../common/middlewares/tenantScoping.middleware.js";
import { requirePermission } from "../permissions/permissions.middleware.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  reportGapCandidateController,
  listGapsController,
  getGapByIdController,
  assignGapController,
  resolveGapController,
  dismissGapController,
  reopenGapController,
  mergeGapsController,
  splitGapController,
  linkDocumentsController,
  triggerReevaluationController,
  getOccurrencesController,
  getReevaluationsController,
  getMetricsController,
} from "./knowledge-gaps.controller.js";
import {
  validateReportCandidate,
  validateListGapsQuery,
  validateAssignGap,
  validateResolveGap,
  validateDismissGap,
  validateMergeGaps,
  validateSplitGap,
  validateLinkDocuments,
  validateTriggerReevaluation,
} from "./knowledge-gaps.validator.js";

const router = Router();

router.use(authenticate, tenantScoping);

/**
 * @openapi
 * /knowledge-gaps/:
 *   get:
 *     summary: List knowledge gaps
 *     description: Returns a paginated list of knowledge gaps for the tenant.
 *       Supports filtering by status, severity, source, department and assignee,
 *       plus free-text search and sorting. Employee role users are automatically
 *       scoped to gaps assigned to them.
 *     tags: [Knowledge Gaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of records per page
 *       - in: query
 *         name: status
 *         schema:
 *           type: string
 *           enum: [open, triaged, assigned, resolved, dismissed, reopened]
 *         description: Filter by gap status
 *       - in: query
 *         name: severity
 *         schema:
 *           type: string
 *           enum: [low, medium, high, critical]
 *         description: Filter by gap severity
 *       - in: query
 *         name: source
 *         schema:
 *           type: string
 *           enum: [refusal, weak_answer, conflict, negative_feedback, manual]
 *         description: Filter by gap source
 *       - in: query
 *         name: department
 *         schema:
 *           type: string
 *         description: Filter by department name
 *       - in: query
 *         name: assigneeId
 *         schema:
 *           type: string
 *         description: Filter by assignee user id
 *       - in: query
 *         name: search
 *         schema:
 *           type: string
 *         description: Search against topic and representative question
 *       - in: query
 *         name: sortBy
 *         schema:
 *           type: string
 *           enum: [createdAt, updatedAt, occurrenceCount, severity]
 *           default: createdAt
 *         description: Sort field
 *       - in: query
 *         name: sortOrder
 *         schema:
 *           type: string
 *           enum: [asc, desc]
 *           default: desc
 *         description: Sort direction
 *     responses:
 *       200:
 *         description: Paginated list of knowledge gaps
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gaps:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       status:
 *                         type: string
 *                       severity:
 *                         type: string
 *                       topic:
 *                         type: string
 *                       representativeQuestion:
 *                         type: string
 *                       occurrenceCount:
 *                         type: integer
 *                       source:
 *                         type: string
 *                       linkedDocumentIds:
 *                         type: array
 *                         items:
 *                           type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                       updatedAt:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/", requirePermission(Permission.KNOWLEDGE_GAPS_READ), validateListGapsQuery, listGapsController);
/**
 * @openapi
 * /knowledge-gaps/metrics:
 *   get:
 *     summary: Get knowledge gap metrics
 *     description: Returns aggregate metrics for the tenant covering total gap
 *       counts, breakdowns by status, severity, source and department, the top
 *       unresolved gaps and the resolution rate.
 *     tags: [Knowledge Gaps]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Knowledge gap metrics
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 metrics:
 *                   type: object
 *                   properties:
 *                     totalGaps:
 *                       type: integer
 *                     byStatus:
 *                       type: object
 *                     bySeverity:
 *                       type: object
 *                     bySource:
 *                       type: object
 *                     byDepartment:
 *                       type: object
 *                     topUnresolved:
 *                       type: array
 *                       items:
 *                         type: object
 *                     resolutionRate:
 *                       type: number
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.get("/metrics", requirePermission(Permission.KNOWLEDGE_GAPS_READ), getMetricsController);
/**
 * @openapi
 * /knowledge-gaps/candidates:
 *   post:
 *     summary: Report a gap candidate
 *     description: Reports a knowledge gap candidate, typically triggered from
 *       a chat conversation. If a matching gap already exists it increments the
 *       occurrence count, otherwise it creates a new gap with an agent proposed
 *       analysis.
 *     tags: [Knowledge Gaps]
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
 *                 description: The question that exposed the gap
 *               normalizedIntent:
 *                 type: string
 *                 description: Normalized form of the question
 *               outcome:
 *                 type: string
 *                 enum: [refused, weak, conflict, negative_feedback]
 *                 default: refused
 *                 description: Outcome of the answer that exposed the gap
 *               category:
 *                 type: string
 *               evidenceSummaryIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               confidence:
 *                 type: number
 *                 default: 1
 *                 description: Confidence in the candidate, 0 to 1
 *               conflictType:
 *                 type: string
 *               actorDepartment:
 *                 type: string
 *                 description: Department of the actor who reported the gap
 *               conversationId:
 *                 type: string
 *               messageId:
 *                 type: string
 *               traceId:
 *                 type: string
 *     responses:
 *       201:
 *         description: Gap candidate reported
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gap:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     severity:
 *                       type: string
 *                     topic:
 *                       type: string
 *                     representativeQuestion:
 *                       type: string
 *                     occurrenceCount:
 *                       type: integer
 *                     source:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 */
router.post("/candidates", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateReportCandidate, reportGapCandidateController);
/**
 * @openapi
 * /knowledge-gaps/{id}:
 *   get:
 *     summary: Get knowledge gap by id
 *     description: Returns a single knowledge gap for the tenant identified by
 *       its id. Employee role users can only read gaps assigned to them.
 *     tags: [Knowledge Gaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge gap id
 *     responses:
 *       200:
 *         description: Knowledge gap details
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gap:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     severity:
 *                       type: string
 *                     topic:
 *                       type: string
 *                     representativeQuestion:
 *                       type: string
 *                     department:
 *                       type: string
 *                     occurrenceCount:
 *                       type: integer
 *                     source:
 *                       type: string
 *                     assigneeId:
 *                       type: string
 *                     dueDate:
 *                       type: string
 *                       format: date-time
 *                     linkedDocumentIds:
 *                       type: array
 *                       items:
 *                         type: string
 *                     resolutionNotes:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions or gap not assigned to the user
 *       404:
 *         description: Knowledge gap not found
 */
router.get("/:id", requirePermission(Permission.KNOWLEDGE_GAPS_READ), getGapByIdController);
/**
 * @openapi
 * /knowledge-gaps/{id}/assign:
 *   patch:
 *     summary: Assign knowledge gap
 *     description: Assigns a knowledge gap to a user and optionally sets a due
 *       date. A gap in the open state transitions to assigned.
 *     tags: [Knowledge Gaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge gap id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [assigneeId]
 *             properties:
 *               assigneeId:
 *                 type: string
 *                 description: User id of the assignee
 *               dueDate:
 *                 type: string
 *                 format: date-time
 *                 nullable: true
 *                 description: Optional due date
 *     responses:
 *       200:
 *         description: Knowledge gap assigned
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gap:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     assigneeId:
 *                       type: string
 *                     dueDate:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Knowledge gap not found
 */
router.patch("/:id/assign", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateAssignGap, assignGapController);
/**
 * @openapi
 * /knowledge-gaps/{id}/resolve:
 *   patch:
 *     summary: Resolve knowledge gap
 *     description: Marks a knowledge gap as resolved with resolution notes and
 *       an optional list of linked document ids. Already resolved gaps are
 *       rejected.
 *     tags: [Knowledge Gaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge gap id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [resolutionNotes]
 *             properties:
 *               resolutionNotes:
 *                 type: string
 *                 description: Notes describing how the gap was resolved
 *               linkedDocumentIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Document ids linked to the resolution
 *     responses:
 *       200:
 *         description: Knowledge gap resolved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gap:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     resolutionNotes:
 *                       type: string
 *                     linkedDocumentIds:
 *                       type: array
 *                       items:
 *                         type: string
 *                     resolvedAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error or gap already resolved
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Knowledge gap not found
 */
router.patch("/:id/resolve", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateResolveGap, resolveGapController);
/**
 * @openapi
 * /knowledge-gaps/{id}/dismiss:
 *   patch:
 *     summary: Dismiss knowledge gap
 *     description: Dismisses a knowledge gap as not actionable, recording the
 *       reason for dismissal.
 *     tags: [Knowledge Gaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge gap id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 description: Reason for dismissing the gap
 *     responses:
 *       200:
 *         description: Knowledge gap dismissed
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gap:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     dismissalReason:
 *                       type: string
 *                     dismissedAt:
 *                       type: string
 *                       format: date-time
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Knowledge gap not found
 */
router.patch("/:id/dismiss", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateDismissGap, dismissGapController);
/**
 * @openapi
 * /knowledge-gaps/{id}/reopen:
 *   patch:
 *     summary: Reopen knowledge gap
 *     description: Reopens a resolved or dismissed knowledge gap, clearing its
 *       resolution and dismissal state so it can be worked on again.
 *     tags: [Knowledge Gaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge gap id
 *     responses:
 *       200:
 *         description: Knowledge gap reopened
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gap:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Knowledge gap not found
 */
router.patch("/:id/reopen", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), reopenGapController);
/**
 * @openapi
 * /knowledge-gaps/merge:
 *   post:
 *     summary: Merge knowledge gaps
 *     description: Merges one or more source gaps into a target gap. Source gaps
 *       are dismissed and their occurrences are added to the target gap.
 *     tags: [Knowledge Gaps]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [sourceGapIds, targetGapId]
 *             properties:
 *               sourceGapIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Ids of the gaps to merge into the target
 *               targetGapId:
 *                 type: string
 *                 description: Id of the gap that receives the merged occurrences
 *     responses:
 *       200:
 *         description: Knowledge gaps merged
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gap:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     status:
 *                       type: string
 *                     occurrenceCount:
 *                       type: integer
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Target gap not found
 */
router.post("/merge", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateMergeGaps, mergeGapsController);
/**
 * @openapi
 * /knowledge-gaps/{id}/split:
 *   post:
 *     summary: Split knowledge gap
 *     description: Splits a knowledge gap into two or more new gaps based on the
 *       provided topics. The original gap is dismissed and the new gaps inherit
 *       its department and severity.
 *     tags: [Knowledge Gaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge gap id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [newTopics]
 *             properties:
 *               newTopics:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Topics for the new gaps, at least two
 *     responses:
 *       200:
 *         description: Knowledge gap split into new gaps
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gaps:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       status:
 *                         type: string
 *                       topic:
 *                         type: string
 *                       severity:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Knowledge gap not found
 */
router.post("/:id/split", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateSplitGap, splitGapController);
/**
 * @openapi
 * /knowledge-gaps/{id}/documents:
 *   patch:
 *     summary: Link documents to knowledge gap
 *     description: Links one or more documents to a knowledge gap. Document ids
 *       are merged with any already linked documents, avoiding duplicates.
 *     tags: [Knowledge Gaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge gap id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [documentIds]
 *             properties:
 *               documentIds:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Document ids to link to the gap
 *     responses:
 *       200:
 *         description: Documents linked to the knowledge gap
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 gap:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     linkedDocumentIds:
 *                       type: array
 *                       items:
 *                         type: string
 *                     updatedAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Knowledge gap not found
 */
router.patch("/:id/documents", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateLinkDocuments, linkDocumentsController);
/**
 * @openapi
 * /knowledge-gaps/{id}/reevaluate:
 *   post:
 *     summary: Trigger gap reevaluation
 *     description: Triggers a reevaluation of a knowledge gap against a
 *       specific document and records the outcome. Returns the created
 *       reevaluation record.
 *     tags: [Knowledge Gaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge gap id
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [documentId]
 *             properties:
 *               documentId:
 *                 type: string
 *                 description: Id of the document used for the reevaluation
 *     responses:
 *       201:
 *         description: Reevaluation recorded
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reevaluation:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     gapId:
 *                       type: string
 *                     documentId:
 *                       type: string
 *                     result:
 *                       type: string
 *                       enum: [improved, not_improved, error]
 *                     notes:
 *                       type: string
 *                     createdAt:
 *                       type: string
 *                       format: date-time
 *       400:
 *         description: Validation error
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Knowledge gap not found
 */
router.post("/:id/reevaluate", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateTriggerReevaluation, triggerReevaluationController);
/**
 * @openapi
 * /knowledge-gaps/{id}/occurrences:
 *   get:
 *     summary: List gap occurrences
 *     description: Returns a paginated list of occurrences for a knowledge gap,
 *       each capturing a question that contributed to the gap.
 *     tags: [Knowledge Gaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge gap id
 *       - in: query
 *         name: page
 *         schema:
 *           type: integer
 *           default: 1
 *         description: Page number
 *       - in: query
 *         name: pageSize
 *         schema:
 *           type: integer
 *           default: 20
 *         description: Number of records per page
 *     responses:
 *       200:
 *         description: Paginated list of occurrences
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 occurrences:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       gapId:
 *                         type: string
 *                       question:
 *                         type: string
 *                       outcome:
 *                         type: string
 *                         enum: [refused, weak, conflict, negative_feedback]
 *                       category:
 *                         type: string
 *                       confidence:
 *                         type: number
 *                       actorDepartment:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *                 total:
 *                   type: integer
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Knowledge gap not found
 */
router.get("/:id/occurrences", requirePermission(Permission.KNOWLEDGE_GAPS_READ), getOccurrencesController);
/**
 * @openapi
 * /knowledge-gaps/{id}/reevaluations:
 *   get:
 *     summary: List gap reevaluations
 *     description: Returns the reevaluation records for a knowledge gap, newest
 *       first. Each record captures the outcome of an automated reevaluation
 *       against a document.
 *     tags: [Knowledge Gaps]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: Knowledge gap id
 *     responses:
 *       200:
 *         description: List of reevaluations
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 reevaluations:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       gapId:
 *                         type: string
 *                       documentId:
 *                         type: string
 *                       result:
 *                         type: string
 *                         enum: [improved, not_improved, error]
 *                       notes:
 *                         type: string
 *                       createdAt:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Authentication required
 *       403:
 *         description: Insufficient permissions
 *       404:
 *         description: Knowledge gap not found
 */
router.get("/:id/reevaluations", requirePermission(Permission.KNOWLEDGE_GAPS_READ), getReevaluationsController);

export default router;
