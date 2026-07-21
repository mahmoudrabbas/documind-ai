import test from "node:test";
import assert from "node:assert/strict";
import { EVALUATION_DATASET } from "./intentQuery.evaluationDataset.js";
import { FakeIntentQueryAdapter } from "../adapters/intentQuery.fakeAdapter.js";

test("Bilingual Query Plan Evaluation Regression Tests", async (t) => {
  const adapter = new FakeIntentQueryAdapter();

  for (const [index, entry] of EVALUATION_DATASET.entries()) {
    await t.test(`Evaluation case #${index + 1}: [${entry.expectedLanguage}] "${entry.question}"`, async () => {
      const plan = await adapter.analyze({
        question: entry.question,
        conversationId: entry.isFollowUp ? "6688c211849f5116340bd78a" : undefined,
      });

      // 1. Language validation
      assert.equal(
        plan.language,
        entry.expectedLanguage,
        `Expected language "${entry.expectedLanguage}" but got "${plan.language}"`
      );

      // 2. Intent validation
      assert.equal(
        plan.detectedIntent,
        entry.expectedIntent,
        `Expected intent "${entry.expectedIntent}" but got "${plan.detectedIntent}"`
      );

      // 3. Clarification expectation validation
      assert.equal(
        plan.clarificationNeeded,
        entry.shouldClarify,
        `Expected clarificationNeeded to be ${entry.shouldClarify} but got ${plan.clarificationNeeded}`
      );

      // 4. Exact terms checking if specified in the fixture
      if (entry.exactTerms && entry.exactTerms.length > 0) {
        for (const term of entry.exactTerms) {
          const hasTerm = plan.entities.some(e => e.text.toLowerCase().includes(term.toLowerCase()) || term.toLowerCase().includes(e.text.toLowerCase()));
          assert.ok(
            hasTerm || plan.exactTerms.includes(term),
            `Expected query plan to extract/preserve term "${term}"`
          );
        }
      }
    });
  }
});
