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

router.get("/", requirePermission(Permission.KNOWLEDGE_GAPS_READ), validateListGapsQuery, listGapsController);
router.get("/metrics", requirePermission(Permission.KNOWLEDGE_GAPS_READ), getMetricsController);
router.post("/candidates", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateReportCandidate, reportGapCandidateController);
router.get("/:id", requirePermission(Permission.KNOWLEDGE_GAPS_READ), getGapByIdController);
router.patch("/:id/assign", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateAssignGap, assignGapController);
router.patch("/:id/resolve", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateResolveGap, resolveGapController);
router.patch("/:id/dismiss", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateDismissGap, dismissGapController);
router.patch("/:id/reopen", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), reopenGapController);
router.post("/merge", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateMergeGaps, mergeGapsController);
router.post("/:id/split", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateSplitGap, splitGapController);
router.patch("/:id/documents", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateLinkDocuments, linkDocumentsController);
router.post("/:id/reevaluate", requirePermission(Permission.KNOWLEDGE_GAPS_UPDATE), validateTriggerReevaluation, triggerReevaluationController);
router.get("/:id/occurrences", requirePermission(Permission.KNOWLEDGE_GAPS_READ), getOccurrencesController);
router.get("/:id/reevaluations", requirePermission(Permission.KNOWLEDGE_GAPS_READ), getReevaluationsController);

export default router;
