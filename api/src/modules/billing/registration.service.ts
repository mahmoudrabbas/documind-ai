import SubscriptionModel from "../../db/models/subscription.model.js";
import { AppError } from "../../common/errors/AppError.js";
import { NOT_FOUND } from "../../common/errors/errorCodes.js";
import { logger } from "../../common/logger/logger.js";
import {
  createSubscription,
} from "./subscription.service.js";
import {
  getPackageByCode,
  createPackage,
  mapToSnapshot,
  type BillingActor,
} from "./package.service.js";
import { getGlobalSettings } from "../platform/global-settings.js";
import type { SubscriptionDocument } from "../../db/models/subscription.model.js";
import type { SubscriptionStatus } from "./billing.types.js";

// ── Default free-package values ─────────────────────────────────────────────

const DEFAULT_FREE_CODE = "free";
const DEFAULT_FREE_NAME = "Free";

const DEFAULT_FREE_ENTITLEMENTS = {
  employees: 5,
  admins: 0,
  documents: 100,
  storageMb: 100,
  fileSizeMb: 10,
  queriesPerMonth: 500,
  tokensPerMonth: 0,
  ocrPagesPerMonth: 0,
};

// ── Public API ──────────────────────────────────────────────────────────────

/**
 * Provision a subscription for a tenant during registration.
 *
 * - If `packageCode` is provided, finds the active package by that code.
 * - If `packageCode` is omitted, resolves the default "free" package.
 * - If no free package exists yet, creates one with sensible defaults.
 * - Idempotent: if a subscription already exists for the tenant, returns it.
 */
export async function provisionSubscription(
  tenantId: string,
  packageCode?: string,
  actor?: BillingActor,
): Promise<SubscriptionDocument> {
  // Idempotency check
  const existing = await SubscriptionModel.findOne({ tenantId }).lean().exec();
  if (existing) {
    return existing;
  }

  // Resolve the target package
  const code = packageCode ?? DEFAULT_FREE_CODE;
  let pkg = await getPackageByCode(code);

  // Auto-bootstrap the free package if it does not exist
  if (!pkg && code === DEFAULT_FREE_CODE) {
    logger.warn(
      { code: DEFAULT_FREE_CODE },
      "Default free package not found — creating one with defaults",
    );

    const created = await createPackage(
      {
        name: DEFAULT_FREE_NAME,
        code: DEFAULT_FREE_CODE,
        description: "Free tier with basic access",
        monthlyPrice: 0,
        annualPrice: 0,
        currency: "USD",
        trialDays: 0,
        entitlements: DEFAULT_FREE_ENTITLEMENTS,
        supportedModels: ["basic"],
        analyticsLevel: "basic",
        retentionDays: 90,
        supportLevel: "community",
        visibility: "public",
      },
      actor,
    );

    pkg = created;
  }

  if (!pkg) {
    throw new AppError(
      404,
      NOT_FOUND,
      `Active package with code "${code}" not found`,
    );
  }

  const snapshot = mapToSnapshot(pkg);

  // Resolve trial days with precedence:
  // 1. Package's explicit trialDays (if > 0)
  // 2. Global defaultTrialDays (if package trialDays is 0)
  // 3. Hardcoded 0 (no trial)
  let resolvedTrialDays = snapshot.trialDays;
  if (resolvedTrialDays === 0) {
    const globalSettings = await getGlobalSettings();
    if (globalSettings.defaultTrialDays > 0) {
      resolvedTrialDays = globalSettings.defaultTrialDays;
      logger.info(
        { packageCode: code, resolvedTrialDays },
        "Package has no trial — applied global defaultTrialDays",
      );
    }
  }

  const subscription = await createSubscription(
    tenantId,
    snapshot.packageId,
    snapshot.version,
    "TRIALING" as SubscriptionStatus,
    actor,
    resolvedTrialDays,
  );

  return subscription;
}
