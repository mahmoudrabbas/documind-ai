import type { PricingProvider, PricingSnapshotData } from "../ports/pricingProvider.port.js";

export class FakePricingProvider implements PricingProvider {
  private snapshots: PricingSnapshotData[] = [
    {
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      inputPricePer1kTokens: 0.00059,
      outputPricePer1kTokens: 0.00079,
      embeddingPricePer1kTokens: 0,
      ocrPricePerPage: 0,
      currency: "USD",
      effectiveFrom: new Date("2025-01-01"),
      source: "manual",
    },
    {
      provider: "student-bedrock",
      model: "amazon.titan-text-express-v1",
      inputPricePer1kTokens: 0.0008,
      outputPricePer1kTokens: 0.0016,
      embeddingPricePer1kTokens: 0.0001,
      ocrPricePerPage: 0.0015,
      currency: "USD",
      effectiveFrom: new Date("2025-01-01"),
      source: "manual",
    },
    {
      provider: "fake",
      model: "fake-model",
      inputPricePer1kTokens: 0.001,
      outputPricePer1kTokens: 0.002,
      embeddingPricePer1kTokens: 0.0001,
      ocrPricePerPage: 0.002,
      currency: "USD",
      effectiveFrom: new Date("2025-01-01"),
      source: "manual",
    },
  ];

  async getPrice(provider: string, model: string, at: Date = new Date()): Promise<PricingSnapshotData | null> {
    const match = this.snapshots.find(
      (s) =>
        s.provider === provider &&
        s.model === model &&
        s.effectiveFrom <= at &&
        (!s.effectiveTo || s.effectiveTo > at)
    );
    return match ?? null;
  }

  async upsertPrice(data: PricingSnapshotData): Promise<PricingSnapshotData> {
    const idx = this.snapshots.findIndex(
      (s) => s.provider === data.provider && s.model === data.model
    );
    if (idx >= 0) {
      this.snapshots[idx] = data;
    } else {
      this.snapshots.push(data);
    }
    return data;
  }
}
