import dotenv from "dotenv";
import { connectDB, disconnectDB } from "../db/connection.js";
import { MongoPricingProvider } from "../modules/analytics/adapters/mongo-pricing-provider.js";

dotenv.config();

async function main() {
  console.log("[SeedPricing] Seeding initial provider pricing snapshots...");
  await connectDB();

  const provider = new MongoPricingProvider();

  const snapshots = [
    {
      provider: "groq",
      model: "llama-3.3-70b-versatile",
      inputPricePer1kTokens: 0.00059,
      outputPricePer1kTokens: 0.00079,
      embeddingPricePer1kTokens: 0,
      ocrPricePerPage: 0,
      currency: "USD",
      effectiveFrom: new Date("2025-01-01"),
      source: "manual" as const,
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
      source: "manual" as const,
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
      source: "manual" as const,
    },
  ];

  for (const s of snapshots) {
    await provider.upsertPrice(s);
    console.log(`[SeedPricing] Upserted pricing for ${s.provider}/${s.model}`);
  }

  console.log("[SeedPricing] Successfully seeded pricing snapshots.");
  await disconnectDB();
}

main().catch((err) => {
  console.error("[SeedPricing] Failed:", err);
  process.exit(1);
});
