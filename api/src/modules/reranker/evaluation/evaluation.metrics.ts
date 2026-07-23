import type { EvidenceBundle } from "../reranker.types.js";

// ---------------------------------------------------------------------------
// Evaluation metrics — compare reranker output against expected outcomes.
// ---------------------------------------------------------------------------

export interface EvaluationMetrics {
  /** Fraction of scenarios where sufficiency level matched expectations. */
  sufficiencyAccuracy: number;
  /** Fraction of scenarios where conflict detection matched expectations. */
  conflictDetectionRate: number;
  /** Fraction of scenarios where deduplication was correctly applied. */
  deduplicationRate: number;
  /** Average reduction ratio across scenarios (lower = more aggressive filtering). */
  averageReductionRatio: number;
  /** Fraction of scenarios where item count was within expected bounds. */
  itemCountAccuracy: number;
  /** Fraction of scenarios where token budget was respected. */
  budgetAdherence: number;
  /** Number of scenarios evaluated. */
  scenarioCount: number;
  /** Per-scenario results. */
  scenarioResults: ScenarioResult[];
}

export interface ScenarioResult {
  scenarioId: string;
  passed: boolean;
  sufficiencyMatch: boolean;
  conflictMatch: boolean;
  itemCountMatch: boolean;
  budgetMatch: boolean;
  deduplicationMatch: boolean;
  reductionRatio: number;
  actualItemCount: number;
  actualTokenCount: number;
  actualSufficiencyLevel: string;
  actualConflictGroupCount: number;
}

// ---------------------------------------------------------------------------
// Metric computation
// ---------------------------------------------------------------------------

export interface ScenarioExpectations {
  minItemCount: number;
  maxItemCount: number;
  sufficiencyLevel: string;
  expectConflicts: boolean;
  expectDeduplication: boolean;
  maxReductionRatio: number;
  maxTotalTokens: number;
}

export function evaluateScenario(
  scenarioId: string,
  inputCandidateCount: number,
  bundle: EvidenceBundle,
  expectations: ScenarioExpectations,
): ScenarioResult {
  const sufficiencyMatch = bundle.sufficiency.level === expectations.sufficiencyLevel;
  const conflictMatch =
    (bundle.conflictGroups.length > 0) === expectations.expectConflicts;
  const itemCountMatch =
    bundle.items.length >= expectations.minItemCount &&
    bundle.items.length <= expectations.maxItemCount;
  const budgetMatch = bundle.totalTokenCount <= expectations.maxTotalTokens;

  const reductionRatio =
    inputCandidateCount > 0
      ? bundle.items.length / inputCandidateCount
      : 0;
  const deduplicationMatch = expectations.expectDeduplication
    ? reductionRatio < 1.0
    : true;

  const passed =
    sufficiencyMatch &&
    conflictMatch &&
    itemCountMatch &&
    budgetMatch &&
    deduplicationMatch;

  return {
    scenarioId,
    passed,
    sufficiencyMatch,
    conflictMatch,
    itemCountMatch,
    budgetMatch,
    deduplicationMatch,
    reductionRatio,
    actualItemCount: bundle.items.length,
    actualTokenCount: bundle.totalTokenCount,
    actualSufficiencyLevel: bundle.sufficiency.level,
    actualConflictGroupCount: bundle.conflictGroups.length,
  };
}

export function computeAggregateMetrics(
  results: ScenarioResult[],
): EvaluationMetrics {
  if (results.length === 0) {
    return {
      sufficiencyAccuracy: 0,
      conflictDetectionRate: 0,
      deduplicationRate: 0,
      averageReductionRatio: 0,
      itemCountAccuracy: 0,
      budgetAdherence: 0,
      scenarioCount: 0,
      scenarioResults: [],
    };
  }

  const sufficiencyCorrect = results.filter((r) => r.sufficiencyMatch).length;
  const conflictsCorrect = results.filter((r) => r.conflictMatch).length;
  const dedupCorrect = results.filter((r) => r.deduplicationMatch).length;
  const itemCountCorrect = results.filter((r) => r.itemCountMatch).length;
  const budgetCorrect = results.filter((r) => r.budgetMatch).length;

  const totalReduction = results.reduce((sum, r) => sum + r.reductionRatio, 0);

  return {
    sufficiencyAccuracy: sufficiencyCorrect / results.length,
    conflictDetectionRate: conflictsCorrect / results.length,
    deduplicationRate: dedupCorrect / results.length,
    averageReductionRatio: totalReduction / results.length,
    itemCountAccuracy: itemCountCorrect / results.length,
    budgetAdherence: budgetCorrect / results.length,
    scenarioCount: results.length,
    scenarioResults: results,
  };
}
