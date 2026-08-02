import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { CostService } from "../cost.service.js";
import { FakePricingProvider } from "../adapters/fake-pricing-provider.js";

describe("Analytics Cost Calculation", () => {
  it("calculates exact LLM cost using pricing snapshot", async () => {
    const fakePricing = new FakePricingProvider();
    const costService = new CostService(fakePricing);

    // groq llama-3.3-70b-versatile: 0.00059 / 1k input, 0.00079 / 1k output
    const res = await costService.calculateLlmCost(
      "groq",
      "llama-3.3-70b-versatile",
      10000, // 10k input -> $0.0059
      10000  // 10k output -> $0.0079
    );

    assert.equal(res.costType, "calculated");
    assert.equal(res.costUsd, 0.0138);
    assert.equal(res.currency, "USD");
  });

  it("uses estimated cost fallback when snapshot is missing", async () => {
    const fakePricing = new FakePricingProvider();
    const costService = new CostService(fakePricing);

    const res = await costService.calculateLlmCost(
      "unknown-provider",
      "unknown-model",
      5000,
      5000
    );

    assert.equal(res.costType, "estimated");
    assert(res.costUsd > 0);
  });

  it("calculates OCR page processing cost correctly", async () => {
    const fakePricing = new FakePricingProvider();
    const costService = new CostService(fakePricing);

    const res = await costService.calculateOcrCost(
      "student-bedrock",
      "amazon.titan-text-express-v1",
      20
    );

    assert.equal(res.costType, "calculated");
    assert.equal(res.costUsd, 0.03); // 20 * 0.0015
  });
});
