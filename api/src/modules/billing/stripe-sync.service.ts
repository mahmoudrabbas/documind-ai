import type { PackageDocument } from "../../db/models/package.model.js";
import type { PaymentProvider } from "./ports/payment-provider.port.js";
import { AppError } from "../../common/errors/AppError.js";
import { STRIPE_PRODUCT_SYNC_FAILED } from "../../common/errors/errorCodes.js";
import { logger } from "../../common/logger/logger.js";

export interface StripeSyncResult {
  stripeProductId: string;
  stripePriceId: string;
  stripeAnnualPriceId: string;
}

function isBillable(pkg: PackageDocument): boolean {
  return pkg.monthlyPrice > 0 || pkg.annualPrice > 0;
}

function monthlyPricingChanged(
  existing: PackageDocument,
  updates: {
    monthlyPrice?: number;
    currency?: string;
  },
): boolean {
  if (updates.monthlyPrice !== undefined && updates.monthlyPrice !== existing.monthlyPrice) return true;
  if (updates.currency !== undefined && updates.currency !== existing.currency) return true;
  return false;
}

function annualPricingChanged(
  existing: PackageDocument,
  updates: {
    annualPrice?: number;
    currency?: string;
  },
): boolean {
  if (updates.annualPrice !== undefined && updates.annualPrice !== existing.annualPrice) return true;
  if (updates.currency !== undefined && updates.currency !== existing.currency) return true;
  return false;
}

/**
 * Synchronize a package's billing references with Stripe.
 *
 * - Free packages (monthlyPrice=0, annualPrice=0) skip Stripe entirely.
 * - Idempotent: returns existing IDs if already synced and pricing unchanged.
 * - On pricing change: creates a new Stripe Price (prices are immutable in Stripe).
 * - Creates both monthly and annual Prices when applicable.
 *
 * @param pkg       The package document (mutated in-place with Stripe IDs).
 * @param provider  The payment provider adapter.
 * @param updates   Optional partial updates to detect pricing changes.
 */
export async function syncPackageToStripe(
  pkg: PackageDocument,
  provider: PaymentProvider,
  updates?: {
    monthlyPrice?: number;
    annualPrice?: number;
    currency?: string;
  },
): Promise<StripeSyncResult> {
  if (!isBillable(pkg)) {
    return { stripeProductId: "", stripePriceId: "", stripeAnnualPriceId: "" };
  }

  // Step 1: Create Stripe Product if missing
  if (!pkg.stripeProductId) {
    try {
      const product = await provider.createProduct({
        name: pkg.name,
        description: pkg.description || undefined,
        metadata: {
          packageCode: pkg.code,
          packageId: String(pkg._id),
        },
      });
      pkg.stripeProductId = product.id;
      logger.info(`Created Stripe product ${product.id} for package ${pkg.code}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.error(`Stripe product creation failed for package ${pkg.code}: ${message}`);
      throw new AppError(
        500,
        STRIPE_PRODUCT_SYNC_FAILED,
        `Failed to create Stripe product: ${message}`,
      );
    }
  }

  // Step 2: Create monthly Stripe Price if missing or pricing changed
  if ((updates?.monthlyPrice ?? pkg.monthlyPrice) > 0) {
    const effectiveMonthly = updates?.monthlyPrice ?? pkg.monthlyPrice;
    const needsNewMonthlyPrice = !pkg.stripePriceId || (updates && monthlyPricingChanged(pkg, updates));

    if (needsNewMonthlyPrice) {
      try {
        const price = await provider.createPrice({
          productId: pkg.stripeProductId,
          unitAmount: effectiveMonthly,
          currency: (updates?.currency ?? pkg.currency).toLowerCase(),
          interval: "month",
          metadata: {
            packageCode: pkg.code,
            packageId: String(pkg._id),
            version: String(pkg.version),
          },
        });
        pkg.stripePriceId = price.id;
        logger.info(`Created Stripe monthly price ${price.id} for package ${pkg.code}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Stripe monthly price creation failed for package ${pkg.code}: ${message}`);
        throw new AppError(
          500,
          STRIPE_PRODUCT_SYNC_FAILED,
          `Failed to create Stripe monthly price: ${message}`,
        );
      }
    }
  }

  // Step 3: Create annual Stripe Price if missing or pricing changed
  if ((updates?.annualPrice ?? pkg.annualPrice) > 0) {
    const effectiveAnnual = updates?.annualPrice ?? pkg.annualPrice;
    const needsNewAnnualPrice = !pkg.stripeAnnualPriceId || (updates && annualPricingChanged(pkg, updates));

    if (needsNewAnnualPrice) {
      try {
        const price = await provider.createPrice({
          productId: pkg.stripeProductId,
          unitAmount: effectiveAnnual,
          currency: (updates?.currency ?? pkg.currency).toLowerCase(),
          interval: "year",
          metadata: {
            packageCode: pkg.code,
            packageId: String(pkg._id),
            version: String(pkg.version),
            billingInterval: "annual",
          },
        });
        pkg.stripeAnnualPriceId = price.id;
        logger.info(`Created Stripe annual price ${price.id} for package ${pkg.code}`);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        logger.error(`Stripe annual price creation failed for package ${pkg.code}: ${message}`);
        throw new AppError(
          500,
          STRIPE_PRODUCT_SYNC_FAILED,
          `Failed to create Stripe annual price: ${message}`,
        );
      }
    }
  }

  return {
    stripeProductId: pkg.stripeProductId,
    stripePriceId: pkg.stripePriceId,
    stripeAnnualPriceId: pkg.stripeAnnualPriceId,
  };
}

export { isBillable, monthlyPricingChanged, annualPricingChanged };
