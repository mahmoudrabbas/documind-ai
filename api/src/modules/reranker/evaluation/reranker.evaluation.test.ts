import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeRerankerAdapter } from "../fakeReranker.adapter.js";
import { createRerankerService } from "../reranker.service.js";
import { EVALUATION_SCENARIOS } from "./evaluation.fixtures.js";
import {
  evaluateScenario,
  computeAggregateMetrics,
  type ScenarioResult,
} from "./evaluation.metrics.js";

// ---------------------------------------------------------------------------
// Evaluation — runs all scenarios against the FakeRerankerAdapter and
// verifies that the evidence bundles meet quality thresholds.
//
// These tests serve as a regression suite: if a future change to the
// reranker breaks deterministic behavior, these tests will catch it.
// ---------------------------------------------------------------------------

describe("Reranker Evaluation Suite", () => {
  const adapter = new FakeRerankerAdapter();
  const service = createRerankerService({ reranker: adapter });

  const results: ScenarioResult[] = [];

  for (const scenario of EVALUATION_SCENARIOS) {
    it(scenario.id, async () => {
      const bundle = await service.buildEvidenceBundle(
        scenario.candidates,
        scenario.queryText,
        `eval-${scenario.id}`,
      );

      const result = evaluateScenario(
        scenario.id,
        scenario.candidates.length,
        bundle,
        scenario.expectations,
      );

      results.push(result);

      // Detailed assertion messages for debugging
      const failures: string[] = [];
      if (!result.sufficiencyMatch) {
        failures.push(
          `sufficiency: expected=${scenario.expectations.sufficiencyLevel}, actual=${result.actualSufficiencyLevel}`,
        );
      }
      if (!result.conflictMatch) {
        failures.push(
          `conflicts: expected=${scenario.expectations.expectConflicts}, actual=${result.actualConflictGroupCount} groups`,
        );
      }
      if (!result.itemCountMatch) {
        failures.push(
          `itemCount: expected=[${scenario.expectations.minItemCount},${scenario.expectations.maxItemCount}], actual=${result.actualItemCount}`,
        );
      }
      if (!result.budgetMatch) {
        failures.push(
          `budget: expected<=${scenario.expectations.maxTotalTokens}, actual=${result.actualTokenCount}`,
        );
      }
      if (!result.deduplicationMatch) {
        failures.push(
          `deduplication: expected reduction, actual ratio=${result.reductionRatio.toFixed(2)}`,
        );
      }

      assert.ok(
        result.passed,
        `Scenario "${scenario.id}" failed:\n  ${failures.join("\n  ")}`,
      );
    });
  }

  it("aggregate metrics meet minimum thresholds", () => {
    const metrics = computeAggregateMetrics(results);

    // All scenarios should pass — 100% accuracy on all metrics
    assert.equal(
      metrics.scenarioCount,
      EVALUATION_SCENARIOS.length,
      `Expected ${EVALUATION_SCENARIOS.length} scenarios, got ${metrics.scenarioCount}`,
    );

    assert.equal(
      metrics.sufficiencyAccuracy,
      1.0,
      `Sufficiency accuracy ${(metrics.sufficiencyAccuracy * 100).toFixed(0)}% < 100%`,
    );

    assert.equal(
      metrics.conflictDetectionRate,
      1.0,
      `Conflict detection rate ${(metrics.conflictDetectionRate * 100).toFixed(0)}% < 100%`,
    );

    assert.equal(
      metrics.itemCountAccuracy,
      1.0,
      `Item count accuracy ${(metrics.itemCountAccuracy * 100).toFixed(0)}% < 100%`,
    );

    assert.equal(
      metrics.budgetAdherence,
      1.0,
      `Budget adherence ${(metrics.budgetAdherence * 100).toFixed(0)}% < 100%`,
    );

    assert.equal(
      metrics.deduplicationRate,
      1.0,
      `Deduplication rate ${(metrics.deduplicationRate * 100).toFixed(0)}% < 100%`,
    );

    // Reduction ratio should be reasonable (not removing everything, not keeping everything)
    assert.ok(
      metrics.averageReductionRatio > 0 && metrics.averageReductionRatio <= 1.0,
      `Average reduction ratio ${metrics.averageReductionRatio.toFixed(2)} out of expected range`,
    );
  });
});
