import PricingSnapshotModel from "../../../db/models/pricingSnapshot.model.js";
import type { PricingProvider, PricingSnapshotData } from "../ports/pricingProvider.port.js";

export class MongoPricingProvider implements PricingProvider {
  async getPrice(provider: string, model: string, at: Date = new Date()): Promise<PricingSnapshotData | null> {
    const snapshot = await PricingSnapshotModel.findOne({
      provider,
      modelName: model,
      effectiveFrom: { $lte: at },
      $or: [{ effectiveTo: null }, { effectiveTo: { $gt: at } }],
    })
      .sort({ effectiveFrom: -1 })
      .lean()
      .exec();

    if (!snapshot) return null;

    return {
      provider: snapshot.provider,
      model: snapshot.modelName,
      inputPricePer1kTokens: snapshot.inputPricePer1kTokens,
      outputPricePer1kTokens: snapshot.outputPricePer1kTokens,
      embeddingPricePer1kTokens: snapshot.embeddingPricePer1kTokens,
      ocrPricePerPage: snapshot.ocrPricePerPage,
      currency: snapshot.currency,
      effectiveFrom: snapshot.effectiveFrom,
      effectiveTo: snapshot.effectiveTo,
      source: snapshot.source,
    };
  }

  async upsertPrice(data: PricingSnapshotData): Promise<PricingSnapshotData> {
    const updated = await PricingSnapshotModel.findOneAndUpdate(
      {
        provider: data.provider,
        modelName: data.model,
        effectiveFrom: data.effectiveFrom,
      },
      {
        $set: {
          inputPricePer1kTokens: data.inputPricePer1kTokens,
          outputPricePer1kTokens: data.outputPricePer1kTokens,
          embeddingPricePer1kTokens: data.embeddingPricePer1kTokens,
          ocrPricePerPage: data.ocrPricePerPage,
          currency: data.currency,
          effectiveTo: data.effectiveTo ?? null,
          source: data.source,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
      .lean()
      .exec();

    return {
      provider: updated.provider,
      model: updated.modelName,
      inputPricePer1kTokens: updated.inputPricePer1kTokens,
      outputPricePer1kTokens: updated.outputPricePer1kTokens,
      embeddingPricePer1kTokens: updated.embeddingPricePer1kTokens,
      ocrPricePerPage: updated.ocrPricePerPage,
      currency: updated.currency,
      effectiveFrom: updated.effectiveFrom,
      effectiveTo: updated.effectiveTo,
      source: updated.source,
    };
  }
}
