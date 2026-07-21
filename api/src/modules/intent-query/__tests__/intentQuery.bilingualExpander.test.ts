import test from "node:test";
import assert from "node:assert/strict";
import { expandBilingual, getExpansions } from "../intentQuery.bilingualExpander.js";

test("Bilingual Expander utility", async (t) => {
  await t.test("should fetch dictionary expansions for a term", () => {
    const expansions = getExpansions("policy");
    assert.ok(expansions.ar.includes("سياسة") || expansions.ar.includes("سياسات") || expansions.ar.includes("لوائح"));
  });

  await t.test("should expand English queries into Arabic counterparts", () => {
    const originalQuestion = "What is the policy for vacation leave?";
    const entities = [
      { text: "vacation leave", type: "policy_name" as const, language: "en" as const, preserveExact: false }
    ];

    const result = expandBilingual(originalQuestion, "en", entities);
    
    // Original semantic query must be present
    assert.equal(result.semanticQueries[0].text, originalQuestion);
    assert.equal(result.semanticQueries[0].weight, 1.0);

    // Expanded queries should have been added
    assert.ok(result.semanticQueries.length > 1);
    assert.equal(result.semanticQueries[1].language, "ar");
    assert.equal(result.semanticQueries[1].weight, 0.7);
  });

  await t.test("should expand Arabic queries into English counterparts", () => {
    const originalQuestion = "سياسة الرواتب والأجور";
    const result = expandBilingual(originalQuestion, "ar", []);

    assert.equal(result.semanticQueries[0].text, originalQuestion);
    assert.equal(result.semanticQueries[0].weight, 1.0);

    assert.ok(result.semanticQueries.length > 1);
    assert.equal(result.semanticQueries[1].language, "en");
    assert.equal(result.semanticQueries[1].weight, 0.7);
  });
});
