import type { PricingProvider } from "./ports/pricingProvider.port.js";
import { MongoPricingProvider } from "./adapters/mongo-pricing-provider.js";
import type { CostType } from "../../db/models/usageEvent.model.js";

export interface CostCalculationResult {
  costUsd: number;
  costMinorUnits: number; // USD cents * 100 or micro-cents for precision
  costType: CostType;
  currency: string;
}

export class CostService {
  constructor(private readonly pricingProvider: PricingProvider = new MongoPricingProvider()) {}

  async calculateLlmCost(
    provider: string,
    model: string,
    inputTokens: number,
    outputTokens: number,
    at: Date = new Date()
  ): Promise<CostCalculationResult> {
    const snapshot = await this.pricingProvider.getPrice(provider, model, at);

    if (snapshot) {
      const inputCost = (inputTokens / 1000) * snapshot.inputPricePer1kTokens;
      const outputCost = (outputTokens / 1000) * snapshot.outputPricePer1kTokens;
      const totalUsd = inputCost + outputCost;

      return {
        costUsd: Number(totalUsd.toFixed(6)),
        costMinorUnits: Math.round(totalUsd * 10000), // stored in 1/100th cents for exact precision
        costType: "calculated",
        currency: snapshot.currency || "USD",
      };
    }

    // Fallback estimation when snapshot not found: $0.002 per 1k tokens combined
    const estimatedUsd = ((inputTokens + outputTokens) / 1000) * 0.002;
    return {
      costUsd: Number(estimatedUsd.toFixed(6)),
      costMinorUnits: Math.round(estimatedUsd * 10000),
      costType: "estimated",
      currency: "USD",
    };
  }

  async calculateOcrCost(
    provider: string,
    model: string,
    pageCount: number,
    at: Date = new Date()
  ): Promise<CostCalculationResult> {
    const snapshot = await this.pricingProvider.getPrice(provider, model, at);

    if (snapshot && snapshot.ocrPricePerPage > 0) {
      const totalUsd = pageCount * snapshot.ocrPricePerPage;
      return {
        costUsd: Number(totalUsd.toFixed(6)),
        costMinorUnits: Math.round(totalUsd * 10000),
        costType: "calculated",
        currency: snapshot.currency || "USD",
      };
    }

    // Default fallback: $0.0015 per page
    const estimatedUsd = pageCount * 0.0015;
    return {
      costUsd: Number(estimatedUsd.toFixed(6)),
      costMinorUnits: Math.round(estimatedUsd * 10000),
      costType: "estimated",
      currency: "USD",
    };
  }
}
