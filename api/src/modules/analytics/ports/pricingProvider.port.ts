export interface PricingSnapshotData {
  provider: string;
  model: string;
  inputPricePer1kTokens: number;
  outputPricePer1kTokens: number;
  embeddingPricePer1kTokens: number;
  ocrPricePerPage: number;
  currency: string;
  effectiveFrom: Date;
  effectiveTo?: Date | null;
  source: "manual" | "api" | "reconciled";
}

export interface PricingProvider {
  getPrice(provider: string, model: string, at?: Date): Promise<PricingSnapshotData | null>;
  upsertPrice(data: PricingSnapshotData): Promise<PricingSnapshotData>;
}
