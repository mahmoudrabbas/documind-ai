import "dotenv/config";
import { connectDB, disconnectDB } from "../db/connection.js";
import PackageModel from "../db/models/package.model.js";

async function main() {
  await connectDB();

  const exists = await PackageModel.exists({ code: "free" });

  const result = await PackageModel.findOneAndUpdate(
    { code: "free" },
    {
      $set: {
        name: "Free",
        active: true,
        version: 1,
      },
      $setOnInsert: {
        description: "Get started with essential features for free",
        monthlyPrice: 0,
        annualPrice: 0,
        currency: "USD",
        trialDays: 0,
        visibility: "public" as const,
        supportedModels: ["basic"],
        analyticsLevel: "basic" as const,
        retentionDays: 90,
        supportLevel: "community" as const,
        entitlements: {
          employees: 3,
          admins: 1,
          documents: 50,
          storageMb: 100,
          fileSizeMb: 10,
          queriesPerMonth: 500,
          tokensPerMonth: 0,
          ocrPagesPerMonth: 0,
        },
        versions: [],
      },
    },
    { upsert: true, new: true, runValidators: true },
  );

  if (exists) {
    console.info("Default free package already exists, skipped.");
  } else {
    console.info(`Default free package seeded: ${result._id}`);
  }
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error
        ? error.message
        : "Default package seed failed",
    );
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
