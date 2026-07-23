import type { RetrievalCandidate } from "../../retrieval/retrieval.types.js";

// ---------------------------------------------------------------------------
// Evaluation fixtures — diverse scenarios for reranker quality assessment.
//
// Each scenario has a query, a set of candidates, and expected outcomes.
// These are used to verify that the reranker produces deterministic,
// high-quality evidence bundles across a range of realistic situations.
// ---------------------------------------------------------------------------

export interface EvaluationScenario {
  id: string;
  description: string;
  queryText: string;
  candidates: RetrievalCandidate[];
  expectations: {
    /** Minimum number of items expected in the evidence bundle. */
    minItemCount: number;
    /** Maximum number of items expected in the evidence bundle. */
    maxItemCount: number;
    /** Expected sufficiency level. */
    sufficiencyLevel: "SUFFICIENT" | "WEAK" | "CONFLICTING" | "NO_EVIDENCE";
    /** If true, expect at least one conflict group. */
    expectConflicts: boolean;
    /** If true, expect deduplication to have removed items. */
    expectDeduplication: boolean;
    /** Maximum allowed reduction ratio (output/input). 1.0 = no reduction. */
    maxReductionRatio: number;
    /** Maximum allowed total tokens. */
    maxTotalTokens: number;
  };
}

let _id = 0;
function makeCandidate(
  overrides: Partial<RetrievalCandidate> & { text: string },
): RetrievalCandidate {
  _id++;
  return {
    chunkId: overrides.chunkId ?? `eval-chunk-${_id}`,
    documentId: overrides.documentId ?? `doc-${Math.ceil(_id / 3)}`,
    documentVersionId: overrides.documentVersionId ?? "v1",
    tenantId: overrides.tenantId ?? "tenant-eval",
    text: overrides.text,
    score: overrides.score ?? 0.5,
    pageNumber: overrides.pageNumber,
    sectionTitle: overrides.sectionTitle,
    classification: overrides.classification,
    retrievalMethod: overrides.retrievalMethod ?? "hybrid",
    scoreBreakdown: overrides.scoreBreakdown ?? { fusionScore: overrides.score ?? 0.5 },
  };
}

export const EVALUATION_SCENARIOS: EvaluationScenario[] = [
  // ── Scenario 1: Simple ranking ─────────────────────────────────────
  {
    id: "simple-ranking",
    description: "Query matches one candidate strongly, others weakly",
    queryText: "salary structure allowances",
    candidates: [
      makeCandidate({
        text: "The salary structure includes base pay, housing allowance, and transportation allowance for all employees",
        documentId: "doc-salary",
        score: 0.95,
        sectionTitle: "Compensation",
      }),
      makeCandidate({
        text: "Company vehicles are available for senior management",
        documentId: "doc-vehicles",
        score: 0.15,
      }),
      makeCandidate({
        text: "Annual leave policy covers vacation and sick leave",
        documentId: "doc-leave",
        score: 0.1,
      }),
    ],
    expectations: {
      minItemCount: 1,
      maxItemCount: 3,
      sufficiencyLevel: "WEAK",
      expectConflicts: false,
      expectDeduplication: false,
      maxReductionRatio: 1.0,
      maxTotalTokens: 500,
    },
  },

  // ── Scenario 2: Deduplication ──────────────────────────────────────
  {
    id: "deduplication",
    description: "Near-duplicate chunks from the same document should be reduced",
    queryText: "overtime pay policy",
    candidates: [
      makeCandidate({
        text: "Overtime is paid at 1.5x rate for all employees working extra hours beyond regular schedule",
        documentId: "doc-overtime",
        documentVersionId: "v1",
        score: 0.8,
        sectionTitle: "Overtime Policy",
      }),
      makeCandidate({
        text: "Overtime is paid at 1.5x rate for all employees working extra hours beyond regular work schedule",
        documentId: "doc-overtime",
        documentVersionId: "v1",
        score: 0.75,
        sectionTitle: "Overtime Policy",
      }),
      makeCandidate({
        text: "Night shift differential is 25% additional pay",
        documentId: "doc-shifts",
        score: 0.4,
      }),
    ],
    expectations: {
      minItemCount: 2,
      maxItemCount: 2,
      sufficiencyLevel: "SUFFICIENT",
      expectConflicts: false,
      expectDeduplication: true,
      maxReductionRatio: 0.8,
      maxTotalTokens: 400,
    },
  },

  // ── Scenario 3: Conflict detection ─────────────────────────────────
  {
    id: "conflict-negation",
    description: "Conflicting statements about the same topic within a document",
    queryText: "overtime compensation",
    candidates: [
      makeCandidate({
        text: "Overtime is paid at 1.5x rate for all employees",
        documentId: "doc-hr",
        documentVersionId: "v1",
        score: 0.7,
        sectionTitle: "Overtime",
      }),
      makeCandidate({
        text: "Overtime is not paid at any rate for employees",
        documentId: "doc-hr",
        documentVersionId: "v1",
        score: 0.65,
        sectionTitle: "Overtime",
      }),
    ],
    expectations: {
      minItemCount: 2,
      maxItemCount: 2,
      sufficiencyLevel: "CONFLICTING",
      expectConflicts: true,
      expectDeduplication: false,
      maxReductionRatio: 1.0,
      maxTotalTokens: 300,
    },
  },

  // ── Scenario 4: Value contradiction ────────────────────────────────
  {
    id: "conflict-value",
    description: "Different numeric values for the same metric across versions",
    queryText: "annual leave days",
    candidates: [
      makeCandidate({
        text: "Annual leave is 30 days per year for all employees",
        documentId: "doc-leave",
        documentVersionId: "v1",
        score: 0.8,
      }),
      makeCandidate({
        text: "Annual leave is 21 days per year for all employees",
        documentId: "doc-leave",
        documentVersionId: "v2",
        score: 0.75,
      }),
    ],
    expectations: {
      minItemCount: 2,
      maxItemCount: 2,
      sufficiencyLevel: "CONFLICTING",
      expectConflicts: true,
      expectDeduplication: false,
      maxReductionRatio: 1.0,
      maxTotalTokens: 200,
    },
  },

  // ── Scenario 5: Empty input ────────────────────────────────────────
  {
    id: "empty-input",
    description: "No candidates provided",
    queryText: "anything",
    candidates: [],
    expectations: {
      minItemCount: 0,
      maxItemCount: 0,
      sufficiencyLevel: "NO_EVIDENCE",
      expectConflicts: false,
      expectDeduplication: false,
      maxReductionRatio: 0,
      maxTotalTokens: 0,
    },
  },

  // ── Scenario 6: Large candidate set with budget constraint ──────────
  {
    id: "budget-constraint",
    description: "Many candidates should be truncated to fit token budget",
    queryText: "employee benefits",
    candidates: Array.from({ length: 15 }, (_, i) =>
      makeCandidate({
        text: `Benefit ${i}: ${"word ".repeat(60)} description of benefit ${i} for employees`,
        documentId: `doc-benefits-${i % 3}`,
        score: 0.3 + (i * 0.04),
      }),
    ),
    expectations: {
      minItemCount: 1,
      maxItemCount: 10,
      sufficiencyLevel: "WEAK",
      expectConflicts: false,
      expectDeduplication: false,
      maxReductionRatio: 0.8,
      maxTotalTokens: 4500,
    },
  },

  // ── Scenario 7: Cross-document (no conflicts) ──────────────────────
  {
    id: "cross-document",
    description: "Different documents with similar but non-conflicting content",
    queryText: "work schedule hours",
    candidates: [
      makeCandidate({
        text: "Standard work hours are 8 hours per day, Sunday to Thursday",
        documentId: "doc-policy-a",
        score: 0.7,
        sectionTitle: "Working Hours",
      }),
      makeCandidate({
        text: "Standard work hours are 8 hours per day, Sunday to Thursday",
        documentId: "doc-policy-b",
        score: 0.65,
        sectionTitle: "Schedule",
      }),
    ],
    expectations: {
      minItemCount: 1,
      maxItemCount: 2,
      sufficiencyLevel: "SUFFICIENT",
      expectConflicts: false,
      expectDeduplication: false,
      maxReductionRatio: 1.0,
      maxTotalTokens: 200,
    },
  },

  // ── Scenario 8: Arabic text ────────────────────────────────────────
  {
    id: "arabic-text",
    description: "Arabic language candidates with relevant matches",
    queryText: "راتب الموظفين",
    candidates: [
      makeCandidate({
        text: "راتب الموظفين يشمل الراتب الأساسي والمزايا الاجتماعية",
        documentId: "doc-salary-ar",
        score: 0.8,
        sectionTitle: "الراتب",
      }),
      makeCandidate({
        text: "ساعات العمل من 8 صباحاً الى 5 مساءً",
        documentId: "doc-hours-ar",
        score: 0.3,
      }),
    ],
    expectations: {
      minItemCount: 1,
      maxItemCount: 2,
      sufficiencyLevel: "SUFFICIENT",
      expectConflicts: false,
      expectDeduplication: false,
      maxReductionRatio: 1.0,
      maxTotalTokens: 200,
    },
  },
];
