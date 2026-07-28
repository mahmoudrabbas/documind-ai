import { Types } from "mongoose";
import { createHash } from "node:crypto";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import CheckoutSessionModel from "../../db/models/checkoutSession.model.js";
import PaymentEventModel from "../../db/models/paymentEvent.model.js";
import BillingOperationModel from "../../db/models/billingOperation.model.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  NOT_FOUND,
  BAD_REQUEST,
  ACTIVE_SUBSCRIPTION_EXISTS,
  CHECKOUT_SESSION_PENDING,
  PRICE_NOT_CONFIGURED,
  BILLING_PORTAL_UNAVAILABLE,
  CHECKOUT_SESSION_NOT_FOUND,
  CHECKOUT_SESSION_INCOMPLETE,
  CHECKOUT_PAYMENT_INCOMPLETE,
  CHECKOUT_SYNC_PROVIDER_UNAVAILABLE,
  BILLING_PROVIDER_UNAVAILABLE,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import type { AuditAction } from "../../common/observability/auditEvents.js";
import type { PaymentProvider } from "../billing/ports/payment-provider.port.js";
import type { ProviderOperationContext } from "../billing/ports/payment-provider.port.js";
import { synchronizeProviderSubscription } from "../billing/provider-subscription-sync.service.js";
import { toCompanyBillingSummary } from "../billing/company-billing-summary.js";
import { Permission } from "../permissions/permissions.catalog.js";
import {
  authorizeTenantOperation,
  type OperationAuthorizationContext,
  type ResolvedOperationAuthorizationContext,
} from "../permissions/permissions.operation.js";

function writeAudit(
  action: AuditAction,
  resourceId: string,
  changes: Record<string, unknown>,
  tenantId: string,
  actor: ResolvedOperationAuthorizationContext,
): void {
  const writer = getAuditWriter();
  writer
    .write({
      action,
      resourceType: "Subscription",
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

function providerOperationContext(
  tenantId: string,
  operationReference: string,
  normalizedRequest: Record<string, unknown>,
  actor: ResolvedOperationAuthorizationContext,
): ProviderOperationContext {
  const requestFingerprint = createHash("sha256").update(JSON.stringify(Object.fromEntries(Object.entries(normalizedRequest).sort(([a], [b]) => a.localeCompare(b))))).digest("hex");
  return {
    idempotencyKey: createHash("sha256").update(`${tenantId}:${operationReference}:${requestFingerprint}`).digest("hex"),
    requestFingerprint, tenantReference: tenantId, operationReference,
    ...(actor.traceId ? { traceId: actor.traceId } : {}),
  };
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
      operationContext: providerOperationContext(tenantId, "checkout-customer", { tenantId }, actor),
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
    operationContext: providerOperationContext(tenantId, "checkout-session", { tenantId, packageId, packageVersionId: version.packageVersionId, billingInterval }, actor),
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

function hiddenCheckoutSessionError(): AppError {
  return new AppError(404, CHECKOUT_SESSION_NOT_FOUND, "Checkout session not found");
}

function isProviderNotFound(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const providerError = error as {
    status?: unknown;
    statusCode?: unknown;
    code?: unknown;
  };
  return (
    providerError.status === 404 ||
    providerError.statusCode === 404 ||
    providerError.code === "resource_missing"
  );
}

export async function synchronizeCheckoutSession(
  sessionId: string,
  tenantId: string,
  provider: PaymentProvider,
  inputContext: OperationAuthorizationContext,
) {
  const actor = await authorizeTenantOperation(inputContext, Permission.BILLING_MANAGE);
  if (tenantId !== actor.tenantId) throw hiddenCheckoutSessionError();

  const localSession = await CheckoutSessionModel.findOne({
    providerSessionId: sessionId,
  }).lean().exec();

  let providerSession;
  try {
    providerSession = await provider.retrieveCheckoutSession(sessionId);
  } catch (error) {
    if (isProviderNotFound(error)) throw hiddenCheckoutSessionError();
    throw new AppError(
      503,
      CHECKOUT_SYNC_PROVIDER_UNAVAILABLE,
      "Checkout synchronization is temporarily unavailable. Please try again.",
    );
  }

  const trustedTenantIds = [
    providerSession.clientReferenceId,
    providerSession.metadata.tenantId,
    localSession?.tenantId?.toString(),
  ].filter((value): value is string => Boolean(value));
  if (
    trustedTenantIds.length === 0 ||
    trustedTenantIds.some((trustedTenantId) => trustedTenantId !== tenantId)
  ) {
    throw hiddenCheckoutSessionError();
  }

  if (providerSession.status !== "complete") {
    throw new AppError(
      409,
      CHECKOUT_SESSION_INCOMPLETE,
      "Checkout is not complete yet.",
    );
  }
  if (!new Set(["paid", "no_payment_required"]).has(providerSession.paymentStatus)) {
    throw new AppError(
      409,
      CHECKOUT_PAYMENT_INCOMPLETE,
      "Checkout payment is not complete.",
    );
  }

  let providerSubscription = providerSession.subscription;
  if (!providerSubscription && providerSession.subscriptionId && provider.retrieveSubscription) {
    try {
      providerSubscription = await provider.retrieveSubscription(providerSession.subscriptionId);
    } catch {
      throw new AppError(
        503,
        CHECKOUT_SYNC_PROVIDER_UNAVAILABLE,
        "Checkout synchronization is temporarily unavailable. Please try again.",
      );
    }
  }
  if (!providerSubscription) {
    throw new AppError(
      409,
      CHECKOUT_SESSION_PENDING,
      "The provider subscription is still being prepared.",
    );
  }
  if (
    providerSession.customerId &&
    providerSubscription.customerId !== providerSession.customerId
  ) {
    throw hiddenCheckoutSessionError();
  }
  if (
    providerSubscription.metadata.tenantId &&
    providerSubscription.metadata.tenantId !== tenantId
  ) {
    throw hiddenCheckoutSessionError();
  }

  const sourceId = `checkout-session-sync:${sessionId}`;
  let syncResult;
  try {
    syncResult = await synchronizeProviderSubscription({
      providerSubscription,
      tenantId,
      provider: "stripe",
      sourceId,
      sourceType: "checkout_session_sync",
    });
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(
      503,
      CHECKOUT_SYNC_PROVIDER_UNAVAILABLE,
      "Checkout synchronization is temporarily unavailable. Please try again.",
    );
  }

  await CheckoutSessionModel.updateOne(
    { providerSessionId: sessionId, tenantId: new Types.ObjectId(tenantId) },
    { $set: { status: "completed", completedAt: new Date() } },
  );

  try {
    await PaymentEventModel.create({
      eventId: sourceId,
      eventType: "checkout.session.synchronized",
      provider: "stripe",
      status: "processed",
      signature: "",
      rawBody: "",
      payload: { checkoutSessionId: sessionId, recovery: "checkout_session_sync" },
      processingErrors: [],
      processedAt: new Date(),
      tenantId: new Types.ObjectId(tenantId),
    });
  } catch (error) {
    if (!(typeof error === "object" && error !== null && "code" in error && (error as { code?: unknown }).code === 11000)) {
      throw error;
    }
  }

  return {
    synchronized: true,
    changed: syncResult.changed,
    subscription: syncResult.subscription,
  };
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
  const pendingFilter = {
    tenantId: new Types.ObjectId(tenantId),
    status: { $in: ["REQUESTED", "PROVIDER_PENDING", "RETRY_PENDING"] as const },
  };
  const [pendingOperation, pendingSubscriptionMutation] = await Promise.all([
    BillingOperationModel.findOne(pendingFilter).select("operationType status requestedAt conflictGroup").sort({ createdAt: -1 }).lean().exec(),
    BillingOperationModel.exists({ ...pendingFilter, conflictGroup: "SUBSCRIPTION_MUTATION" }),
  ]);
  return toCompanyBillingSummary(sub as unknown as Record<string, unknown>, pendingOperation, Boolean(pendingSubscriptionMutation));
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

  let session;
  try {
    session = await provider.createBillingPortalSession({ customerId: sub.providerCustomerId, returnUrl });
  } catch {
    throw new AppError(503, BILLING_PROVIDER_UNAVAILABLE, "Billing provider is temporarily unavailable");
  }

  writeAudit(
    "BILLING_PORTAL_SESSION_CREATED",
    String(sub._id),
    {
      tenantId,
      portalFlow: "general",
    },
    tenantId,
    actor,
  );

  return { url: session.url };
}
