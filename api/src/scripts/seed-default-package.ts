import "dotenv/config";
import { connectDB, disconnectDB } from "../db/connection.js";
import PackageModel from "../db/models/package.model.js";

async function main(): Promise<void> {
  await connectDB();

  const existing = await PackageModel.findOne({ code: "free" }).lean();
  if (existing) {
    console.info(
      `Free package already exists (id=${existing._id}), skipping.`,
    );
    return;
  }

  await PackageModel.create({
    name: "Free",
    code: "free",
    description: "Get started with basic document management",
    active: true,
    version: 1,
    monthlyPrice: 0,
    annualPrice: 0,
    currency: "USD",
    trialDays: 0,
    visibility: "public",
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
    supportedModels: ["basic"],
    analyticsLevel: "basic",
    retentionDays: 90,
    supportLevel: "community",
  });

  console.info("Free package created successfully.");
}

main()
  .catch((error: unknown) => {
    console.error(
      error instanceof Error ? error.message : "Seed default package failed",
    );
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
