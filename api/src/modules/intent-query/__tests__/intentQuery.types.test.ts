import test from "node:test";
import assert from "node:assert/strict";
import { QueryPlanSchema } from "../intentQuery.types.js";

test("QueryPlanSchema validation", async (t) => {
  await t.test("should validate a valid QueryPlan structure", () => {
    const validPlan = {
      schemaVersion: "1.0.0",
      normalizedQuestion: "What is the policy for maternal leave?",
      originalQuestion: "What is the policy for maternal leave?",
      language: "en",
      detectedIntent: "knowledge_question",
      intentConfidence: 0.95,
      entities: [
        {
          text: "maternal leave",
          type: "policy_name",
          language: "en",
          preserveExact: false,
        },
      ],
      temporalConstraints: [],
      referencedDocumentIds: [],
      departments: [],
      categories: [],
      exactTerms: [],
      semanticQueries: [
        {
          text: "What is the policy for maternal leave?",
          language: "en",
          weight: 1.0,
        },
      ],
      keywordQueries: [],
      clarificationNeeded: false,
      clarification: null,
      isFollowUp: false,
      conversationContextUsed: false,
      promptVersion: "1.0.0",
      modelVersion: "fake-default",
      processingMetadata: {
        tokensUsed: 50,
        latencyMs: 120,
        estimatedCost: 0.0001,
        fallbackUsed: false,
      },
    };

    const result = QueryPlanSchema.safeParse(validPlan);
    assert.equal(result.success, true);
  });

  await t.test("should reject missing required properties", () => {
    const invalidPlan = {
      schemaVersion: "1.0.0",
      normalizedQuestion: "Invalid question",
      // missing language, detectedIntent, etc.
    };

    const result = QueryPlanSchema.safeParse(invalidPlan);
    assert.equal(result.success, false);
  });

  await t.test("should reject invalid intent class types", () => {
    const invalidIntentPlan = {
      schemaVersion: "1.0.0",
      normalizedQuestion: "Hi",
      originalQuestion: "Hi",
      language: "en",
      detectedIntent: "non_existent_intent_class", // invalid enum value
      intentConfidence: 0.8,
      entities: [],
      temporalConstraints: [],
      referencedDocumentIds: [],
      departments: [],
      categories: [],
      exactTerms: [],
      semanticQueries: [],
      keywordQueries: [],
      clarificationNeeded: false,
      clarification: null,
      isFollowUp: false,
      conversationContextUsed: false,
      promptVersion: "1.0.0",
      modelVersion: "fake",
      processingMetadata: {
        tokensUsed: 10,
        latencyMs: 10,
        estimatedCost: 0,
        fallbackUsed: false,
      },
    };

    const result = QueryPlanSchema.safeParse(invalidIntentPlan);
    assert.equal(result.success, false);
  });
});
