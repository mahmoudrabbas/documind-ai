import { Types } from "mongoose";
import { createHash } from "node:crypto";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import CheckoutSessionModel from "../../db/models/checkoutSession.model.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  NOT_FOUND,
  BAD_REQUEST,
  ACTIVE_SUBSCRIPTION_EXISTS,
  CHECKOUT_SESSION_PENDING,
  PRICE_NOT_CONFIGURED,
  BILLING_PORTAL_UNAVAILABLE,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import type { PaymentProvider } from "../billing/ports/payment-provider.port.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  authorizeTenantOperation,
  type OperationAuthorizationContext,
  type ResolvedOperationAuthorizationContext,
} from "../permissions/permissions.operation.js";

function writeAudit(
  action: string,
  resourceId: string,
  changes: Record<string, unknown>,
  tenantId: string,
  actor: ResolvedOperationAuthorizationContext,
): void {
  const writer = getAuditWriter();
  writer
    .write({
      action: action as never,
      resourceType: "Subscription" as never,
      resourceId,
      changes,
      tenantId,
      actorId: actor.actorId,
      actorEmail: actor.actorEmail,
      actorRole: actor.actorRole,
      actorKind: actor.actorKind,
    })
    .catch((err: unknown) => {
      console.error("Audit write failed (non-blocking):", err);
    });
}

function getProviderPriceId(
  pkg: { monthlyPrice: number; annualPrice: number; code: string; stripePriceId?: string; stripeAnnualPriceId?: string },
  billingInterval: "monthly" | "annual",
): string {
  const price =
    billingInterval === "annual" ? pkg.annualPrice : pkg.monthlyPrice;
  if (price <= 0) {
    throw new AppError(
      400,
      BAD_REQUEST,
      `Package has no ${billingInterval} price configured`,
    );
  }

  const priceId = billingInterval === "annual" ? pkg.stripeAnnualPriceId : pkg.stripePriceId;

  if (priceId) {
    return priceId;
  }

  throw new AppError(
    400,
    PRICE_NOT_CONFIGURED,
    `Package "${pkg.code}" has no Stripe ${billingInterval} price configured. Sync the package with Stripe first.`,
  );
}

function legacyPackageVersionId(packageId: string, version: number): string {
  return createHash("sha256")
    .update(`${packageId}:${version}`)
    .digest("hex")
    .slice(0, 24);
}

function resolveCheckoutPackageVersion(
  pkg: { _id: unknown; version: number; versions?: Array<{ _id?: unknown; version: number }> },
): { packageVersionId: string; packageVersion: number } {
  const matches = pkg.versions?.filter((snapshot) => snapshot.version === pkg.version) ?? [];
  if (matches.length > 1) {
    throw new AppError(400, BAD_REQUEST, "Package version is ambiguous");
  }

  return {
    packageVersionId:
      matches[0]?._id?.toString() ??
      legacyPackageVersionId(String(pkg._id), pkg.version),
    packageVersion: pkg.version,
  };
}

const BLOCKING_PROVIDER_SUBSCRIPTION_STATUSES = new Set([
  "TRIALING",
  "INCOMPLETE",
  "ACTIVE",
  "PAST_DUE",
  "PAUSED",
  "CANCEL_AT_PERIOD_END",
  "UNPAID",
]);

function isBlockingProviderSubscription(sub: {
  status: string;
  providerSubscriptionId?: string;
} | null | undefined): boolean {
  if (!sub?.providerSubscriptionId) {
    return false;
  }
  return BLOCKING_PROVIDER_SUBSCRIPTION_STATUSES.has(sub.status);
}

function getPackageDetails(pkg: unknown): { currentPackageId: string | null; currentPackageName: string | null } {
  if (typeof pkg === "string") {
    return { currentPackageId: pkg, currentPackageName: null };
  }

  if (!pkg || typeof pkg !== "object") {
    return { currentPackageId: null, currentPackageName: null };
  }

  const record = pkg as {
    _id?: { toString(): string } | string;
    name?: unknown;
    toString?: () => string;
  };
  return {
    currentPackageId:
      typeof record._id === "string"
        ? record._id
        : record._id?.toString?.() ?? record.toString?.() ?? null,
    currentPackageName:
      typeof record.name === "string" && record.name.trim().length > 0
        ? record.name
        : null,
  };
}

async function expireCheckoutSession(
  sessionId: unknown,
  providerSessionId: string,
  reason: string,
): Promise<void> {
  if (!sessionId) return;
  await CheckoutSessionModel.updateOne(
    { _id: sessionId, status: "pending" },
    {
      $set: {
        status: "expired",
        "metadata.expirationReason": reason,
        "metadata.expiredAt": new Date().toISOString(),
        "metadata.providerSessionId": providerSessionId,
      },
    },
  );
}

async function completeCheckoutSession(sessionId: unknown): Promise<void> {
  if (!sessionId) return;
  await CheckoutSessionModel.updateOne(
    { _id: sessionId, status: { $ne: "completed" } },
    {
      $set: {
        status: "completed",
        completedAt: new Date(),
      },
    },
  );
}

async function reconcilePendingCheckoutSessions(
  tenantId: string,
  provider: PaymentProvider,
): Promise<{ reusableCheckoutUrl: string; providerSessionId: string; checkoutId: string; expiresAt: Date } | null> {
  const pendingSessions = await CheckoutSessionModel.find({
    tenantId: new Types.ObjectId(tenantId),
    status: "pending",
  })
    .sort({ createdAt: -1 })
    .lean()
    .exec();

  const now = new Date();
  let reusableSession: { reusableCheckoutUrl: string; providerSessionId: string; checkoutId: string; expiresAt: Date } | null = null;

  for (const session of pendingSessions) {
    const expiresAt = new Date(session.expiresAt);
    if (expiresAt.getTime() <= now.getTime()) {
      await expireCheckoutSession(session._id, session.providerSessionId, "local_expired");
      continue;
    }

    try {
      const providerSession = await provider.retrieveCheckoutSession(session.providerSessionId);
      if (providerSession.status === "open" && providerSession.url) {
        reusableSession = {
          reusableCheckoutUrl: providerSession.url,
          providerSessionId: providerSession.id,
          checkoutId: String(session._id),
          expiresAt,
        };
        break;
      }

      if (providerSession.status === "complete") {
        await completeCheckoutSession(session._id);
        continue;
      }

      await expireCheckoutSession(session._id, providerSession.id, providerSession.status);
    } catch (error) {
      console.warn("Failed to reconcile pending checkout session from provider", {
        tenantId,
        providerSessionId: session.providerSessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      await expireCheckoutSession(session._id, session.providerSessionId, "provider_unavailable");
    }
  }

  return reusableSession;
}

export async function createCheckoutSession(
  tenantId: string,
  packageId: string,
  billingInterval: "monthly" | "annual",
  provider: PaymentProvider,
  successUrl: string,
  cancelUrl: string,
  inputContext: OperationAuthorizationContext,
) {
  const actor = await authorizeTenantOperation(
    inputContext,
    Permission.BILLING_MANAGE,
  );
  if (tenantId !== actor.tenantId) {
    throw new AppError(404, NOT_FOUND, "Subscription not found");
  }
  const pkg = await PackageModel.findById(packageId).lean().exec();
  if (!pkg) {
    throw new AppError(404, NOT_FOUND, "Package not found");
  }
  if (!pkg.active) {
    throw new AppError(400, BAD_REQUEST, "Package is not active");
  }

  const currentSubscription = await SubscriptionModel.findOne({ tenantId })
    .populate("packageId", "name code")
    .lean()
    .exec();
  if (currentSubscription?.status === "CANCELED") {
    throw new AppError(400, BAD_REQUEST, "Tenant subscription is canceled");
  }
  if (currentSubscription && isBlockingProviderSubscription(currentSubscription)) {
    const { currentPackageId, currentPackageName } = getPackageDetails(currentSubscription.packageId);
    throw new AppError(
      409,
      ACTIVE_SUBSCRIPTION_EXISTS,
      "You already have an active subscription.",
      {
        currentStatus: currentSubscription.status,
        currentPackageId: currentPackageId ?? packageId,
        currentPackageName: currentPackageName ?? null,
        manageBillingAvailable: Boolean(currentSubscription.providerCustomerId),
      },
    );
  }

  const reusableCheckoutSession = await reconcilePendingCheckoutSessions(tenantId, provider);
  if (reusableCheckoutSession) {
    throw new AppError(
      409,
      CHECKOUT_SESSION_PENDING,
      "A checkout session is already in progress.",
      reusableCheckoutSession,
    );
  }

  let providerCustomerId = currentSubscription?.providerCustomerId ?? "";
  const isFakeCustomer = providerCustomerId.startsWith("cus_fake_");
  if (!providerCustomerId || isFakeCustomer) {
    providerCustomerId = await provider.createCustomer({
      tenantId,
      email: actor.actorEmail,
      name: actor.actorEmail,
    });
    if (currentSubscription) {
      await SubscriptionModel.updateOne(
        { tenantId },
        { $set: { providerCustomerId } },
      );
    }
  }

  const returnUrl = successUrl;
  const cancelUrlFinal = cancelUrl;

  const priceId = getProviderPriceId(pkg, billingInterval);
  const version = resolveCheckoutPackageVersion(pkg);
  const metadata = {
    tenantId,
    packageId,
    packageVersionId: version.packageVersionId,
    packageVersion: String(version.packageVersion),
    billingInterval,
  };

  const session = await provider.createCheckoutSession({
    customerId: providerCustomerId,
    priceId,
    successUrl: returnUrl,
    cancelUrl: cancelUrlFinal,
    metadata,
    subscriptionMetadata: metadata,
    clientReferenceId: tenantId,
  });

  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  const checkoutSession = await CheckoutSessionModel.create({
    tenantId: new Types.ObjectId(tenantId),
    packageId: new Types.ObjectId(packageId),
    packageVersion: version.packageVersion,
    packageVersionId: new Types.ObjectId(version.packageVersionId),
    billingInterval,
    providerSessionId: session.id,
    providerCustomerId,
    status: "pending",
    returnUrl,
    cancelUrl: cancelUrlFinal,
    metadata: new Map(Object.entries(session.metadata)),
    expiresAt,
  });

  if (providerCustomerId && !currentSubscription?.providerCustomerId) {
    await SubscriptionModel.updateOne(
      { tenantId },
      { $set: { providerCustomerId } },
    );
  }

  writeAudit(
    "CHECKOUT_SESSION_CREATED",
    String(checkoutSession._id),
    {
      tenantId,
      packageId,
      billingInterval,
      providerSessionId: session.id,
    },
    tenantId,
    actor,
  );

  return {
    checkoutId: String(checkoutSession._id),
    sessionUrl: session.url,
    providerSessionId: session.id,
  };
}

export async function getCheckoutStatus(
  checkoutId: string,
  tenantId: string,
  inputContext: OperationAuthorizationContext,
) {
  const actor = await authorizeTenantOperation(
    inputContext,
    Permission.BILLING_READ,
  );
  if (tenantId !== actor.tenantId) {
    throw new AppError(404, NOT_FOUND, "Checkout session not found");
  }
  const session = await CheckoutSessionModel.findOne({
    _id: checkoutId,
    tenantId,
  })
    .lean()
    .exec();
  if (!session) {
    throw new AppError(404, NOT_FOUND, "Checkout session not found");
  }
  return session;
}

export async function listCheckoutSessions(
  filter: { tenantId: string; status?: string; page: number; pageSize: number },
  inputContext: OperationAuthorizationContext,
) {
  const actor = await authorizeTenantOperation(
    inputContext,
    Permission.BILLING_READ,
  );
  if (filter.tenantId !== actor.tenantId) {
    throw new AppError(404, NOT_FOUND, "Checkout sessions not found");
  }
  const query: Record<string, unknown> = {};
  query.tenantId = new Types.ObjectId(actor.tenantId);
  if (filter.status) query.status = filter.status;

  const [sessions, totalRecords] = await Promise.all([
    CheckoutSessionModel.find(query)
      .sort({ createdAt: -1 })
      .skip((filter.page - 1) * filter.pageSize)
      .limit(filter.pageSize)
      .lean()
      .exec(),
    CheckoutSessionModel.countDocuments(query),
  ]);

  return {
    sessions,
    pagination: {
      page: filter.page,
      pageSize: filter.pageSize,
      totalRecords,
      totalPages: Math.ceil(totalRecords / filter.pageSize),
    },
  };
}

export async function getSubscriptionStatus(
  tenantId: string,
  inputContext: OperationAuthorizationContext,
) {
  const actor = await authorizeTenantOperation(
    inputContext,
    Permission.BILLING_READ,
  );
  if (tenantId !== actor.tenantId) {
    throw new AppError(404, NOT_FOUND, "Subscription not found");
  }
  const sub = await SubscriptionModel.findOne({ tenantId })
    .populate("packageId", "name code version monthlyPrice annualPrice currency entitlements")
    .lean()
    .exec();
  if (!sub) {
    throw new AppError(404, NOT_FOUND, "Subscription not found for tenant");
  }
  const populatedPackage = sub.packageId as unknown as Record<string, unknown>;
  if (populatedPackage && typeof populatedPackage === "object") {
    populatedPackage.monthlyPriceCents = populatedPackage.monthlyPrice;
    populatedPackage.annualPriceCents = populatedPackage.annualPrice;
  }
  return sub;
}

export async function createBillingPortalSession(
  tenantId: string,
  inputContext: OperationAuthorizationContext,
  provider: PaymentProvider,
  returnUrl: string,
) {
  const actor = await authorizeTenantOperation(
    inputContext,
    Permission.BILLING_MANAGE,
  );
  if (tenantId !== actor.tenantId) {
    throw new AppError(404, NOT_FOUND, "Subscription not found");
  }

  const sub = await SubscriptionModel.findOne({ tenantId }).lean().exec();
  if (!sub) {
    throw new AppError(404, NOT_FOUND, "Subscription not found for tenant");
  }

  if (!sub.providerCustomerId) {
    throw new AppError(
      400,
      BILLING_PORTAL_UNAVAILABLE,
      "No billing customer on file. Please complete a checkout first.",
    );
  }

  const session = await provider.createBillingPortalSession({
    customerId: sub.providerCustomerId,
    returnUrl,
  });

  writeAudit(
    "BILLING_PORTAL_SESSION_CREATED",
    String(sub._id),
    {
      tenantId,
      providerCustomerId: sub.providerCustomerId,
    },
    tenantId,
    actor,
  );

  return { url: session.url };
}
