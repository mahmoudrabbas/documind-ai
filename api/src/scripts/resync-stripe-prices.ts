import "dotenv/config";
import { connectDB, disconnectDB } from "../db/connection.js";
import PackageModel from "../db/models/package.model.js";
import { getPaymentProvider } from "../modules/checkout/payment-provider-loader.js";

async function main() {
  const apply = process.argv.includes("--apply");
  await connectDB();
  const provider = await getPaymentProvider();
  const packages = await PackageModel.find({});

  if (packages.length === 0) {
    console.info("No packages found; nothing to sync.");
    return;
  }

  for (const pkg of packages) {
    const billable = pkg.monthlyPrice > 0 || pkg.annualPrice > 0;
    if (!billable) {
      console.info(`[skip] ${pkg.code}: free package`);
      continue;
    }

    const parts = [
      pkg.monthlyPrice > 0 ? `monthly ${pkg.monthlyPrice} ${pkg.currency}` : null,
      pkg.annualPrice > 0 ? `annual ${pkg.annualPrice} ${pkg.currency}` : null,
    ].filter(Boolean);

    if (!apply) {
      console.info(
        `[dry-run] ${pkg.code}: would create product + prices (${parts.join(", ")}) in the configured Stripe account. Run with --apply to execute.`,
      );
      continue;
    }

    const product = await provider.createProduct({
      name: pkg.name,
      description: pkg.description || undefined,
      metadata: { packageCode: pkg.code, packageId: String(pkg._id) },
    });
    pkg.stripeProductId = product.id;

    if (pkg.monthlyPrice > 0) {
      const price = await provider.createPrice({
        productId: product.id,
        unitAmount: pkg.monthlyPrice,
        currency: pkg.currency.toLowerCase(),
        interval: "month",
        metadata: {
          packageCode: pkg.code,
          packageId: String(pkg._id),
          version: String(pkg.version),
        },
      });
      pkg.stripePriceId = price.id;
    }

    if (pkg.annualPrice > 0) {
      const price = await provider.createPrice({
        productId: product.id,
        unitAmount: pkg.annualPrice,
        currency: pkg.currency.toLowerCase(),
        interval: "year",
        metadata: {
          packageCode: pkg.code,
          packageId: String(pkg._id),
          version: String(pkg.version),
          billingInterval: "annual",
        },
      });
      pkg.stripeAnnualPriceId = price.id;
    }

    const versionEntry = pkg.versions?.find((v) => v.version === pkg.version);
    if (versionEntry) {
      versionEntry.stripeProductId = pkg.stripeProductId;
      versionEntry.stripePriceId = pkg.stripePriceId;
      versionEntry.stripeAnnualPriceId = pkg.stripeAnnualPriceId;
    }

    await pkg.save();
    console.info(
      `[done] ${pkg.code}: product=${pkg.stripeProductId} monthly=${pkg.stripePriceId || "-"} annual=${pkg.stripeAnnualPriceId || "-"}`,
    );
  }
}

main()
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Stripe re-sync failed");
    process.exitCode = 1;
  })
  .finally(() => disconnectDB());
