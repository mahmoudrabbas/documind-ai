import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  normalizeQuestion,
  generateClusterKey,
  calculateSimilarity,
  extractSignificantTokens,
} from "../knowledge-gaps.clustering.js";

describe("Knowledge Gaps Clustering", () => {
  it("normalizes text by lowercasing and removing punctuation", () => {
    const input = "What is the COMPANY'S vacation policy???";
    const expected = "what is the company s vacation policy";
    assert.equal(normalizeQuestion(input), expected);
  });

  it("extracts significant tokens excluding stop words", () => {
    const text = "What is the policy for annual leave and vacation days?";
    const tokens = extractSignificantTokens(text);
    assert.deepEqual(tokens, ["policy", "annual", "leave", "vacation", "days"]);
  });

  it("generates deterministic cluster key for identical intents", () => {
    const textA = "What is the vacation policy?";
    const textB = "vacation policy?";
    const keyA = generateClusterKey(normalizeQuestion(textA));
    const keyB = generateClusterKey(normalizeQuestion(textB));

    assert.equal(keyA, keyB);
  });

  it("calculates Jaccard similarity accurately", () => {
    const textA = "vacation policy for employees";
    const textB = "vacation policy for team";
    const similarity = calculateSimilarity(textA, textB);

    assert.ok(similarity >= 0.5, `Expected similarity >= 0.5, got ${similarity}`);
  });

  it("returns 0 similarity for completely disjoint questions", () => {
    const textA = "how to reset wifi password";
    const textB = "maternity leave policy details";
    const similarity = calculateSimilarity(textA, textB);

    assert.equal(similarity, 0.0);
  });
});
