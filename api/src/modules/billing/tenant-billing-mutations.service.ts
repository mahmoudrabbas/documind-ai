import { createHash } from "node:crypto";
import { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  BILLING_CURRENCY_MISMATCH,
  BILLING_OPERATION_ALREADY_PENDING,
  BILLING_OPERATION_NOT_ALLOWED,
  BILLING_PREVIEW_STALE,
  BILLING_PROVIDER_CONFIGURATION_INVALID,
  NOT_FOUND,
  PRICE_NOT_CONFIGURED,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter } from "../../common/observability/index.js";
import BillingPreviewModel, { type BillingPreviewDocument, type BillingPreviewImpactField } from "../../db/models/billingPreview.model.js";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import {
  BillingOperationService,
  mapBillingProviderError,
  type StartBillingOperationInput,
  validateBillingPreview,
} from "./billing-operation.service.js";
import { evaluateSubscriptionAccess } from "./subscription-access-policy.js";
import type { PaymentProvider, ProviderOperationContext } from "./ports/payment-provider.port.js";
import { legacyPackageVersionId } from "./provider-subscription-sync.service.js";
import type { OperationAuthorizationContext } from "../permissions/permissions.operation.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { authorizeTenantOperation } from "../permissions/permissions.operation.js";
import { config } from "../../config/index.js";
import BillingOperationModel from "../../db/models/billingOperation.model.js";

type BillingInterval = "monthly" | "annual";
type CancellationType = "PERIOD_END" | "IMMEDIATE";

interface OperationDto {
  id: string;
  type: string;
  status: string;
  requestedAt: Date;
  confirmedAt: Date | null;
  failedAt: Date | null;
  retryCount: number;
  failureCode: string | null;
  effectiveAt: Date | null;
  cancellationType: CancellationType | null;
}

interface SubscriptionContext {
  record: Record<string, unknown>;
  id: string;
  tenantId: string;
  provider: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
  providerPriceId: string;
  packageVersionId: string | null;
  packageVersion: number;
  billingInterval: BillingInterval | null;
  revision: number;
  status: string;
  cancelAtPeriodEnd: boolean;
  periodEnd: Date | null;
  packageProjection: Record<string, unknown> | null;
}

interface ResolvedTargetPackage {
  packageId: string;
  packageName: string;
  packageCode: string;
  packageVersion: number;
  packageVersionId: string;
  billingInterval: BillingInterval;
  currency: string;
  providerPriceReference: string;
  entitlements: Record<string, number>;
}

export interface BillingChangePreviewDto {
  id: string;
  currentPackage: { id: string; name: string; code: string; version: number };
  targetPackage: { id: string; name: string; code: string; version: number };
  billingInterval: BillingInterval;
  currency: string;
  amountDueMinor: number;
  amountCreditMinor: number;
  effectiveAt: Date | null;
  nextBillingDate: Date | null;
  entitlementImpact: BillingPreviewImpactField[];
  expiresAt: Date;
  subscriptionRevision: number;
}

export async function createSubscriptionChangePreview(input: {
  tenantId: string;
  targetPackageId: string;
  billingInterval: BillingInterval;
  provider: PaymentProvider;
  context: OperationAuthorizationContext;
}): Promise<BillingChangePreviewDto> {
  const actor = await authorizeTenantOperation(input.context, Permission.BILLING_MANAGE);
  assertTenant(input.tenantId, actor.tenantId);
  const subscription = await loadSubscription(input.tenantId);
  assertProviderLinked(subscription);
  await assertNoPendingMutation(subscription.tenantId, subscription.id);
  const target = await resolveTargetPackage(input.targetPackageId, input.billingInterval);
  ensurePlanChangeAllowed(subscription, target);
  ensureCurrencyCompatible(subscription, target.currency);
  const reusable = await BillingPreviewModel.findOne({
    tenantId: new Types.ObjectId(input.tenantId),
    subscriptionId: new Types.ObjectId(subscription.id),
    targetPackageVersionId: new Types.ObjectId(target.packageVersionId),
    targetBillingInterval: target.billingInterval,
    subscriptionRevision: subscription.revision,
    consumedByOperationId: null,
    expiresAt: { $gt: new Date() },
  })
    .sort({ expiresAt: -1, createdAt: -1 })
    .select("+providerPreviewReference +currentProviderPriceReference +targetProviderPriceReference")
    .exec();
  if (reusable) {
    return previewDto(reusable, subscription, target);
  }

  const previewReference = new Types.ObjectId().toString();
  const requestFingerprint = createHash("sha256")
    .update(`${subscription.id}:${target.packageVersionId}:${target.billingInterval}`)
    .digest("hex");
  const providerPreview = await input.provider.previewSubscriptionChange({
    subscriptionId: subscription.providerSubscriptionId,
    expectedCustomerId: subscription.providerCustomerId,
    targetPriceReference: target.providerPriceReference,
    operationContext: providerOperationContext({
      idempotencyKey: `preview:${previewReference}`,
      requestFingerprint,
      tenantReference: input.tenantId,
      operationReference: previewReference,
      traceId: input.context.traceId,
    }),
  });
  if (providerPreview.currency.toUpperCase() !== target.currency.toUpperCase()) {
    throw new AppError(409, BILLING_CURRENCY_MISMATCH, "Billing preview currency does not match the requested package");
  }

  const amountDueMinor = Math.max(0, providerPreview.amountDueMinor);
  const amountCreditMinor = providerPreview.amountDueMinor < 0 ? Math.abs(providerPreview.amountDueMinor) : 0;
  const entitlementImpact = entitlementDelta(subscription.packageProjection?.entitlements, target.entitlements);
  const preview = await BillingPreviewModel.create({
    _id: new Types.ObjectId(previewReference),
    tenantId: new Types.ObjectId(input.tenantId),
    subscriptionId: new Types.ObjectId(subscription.id),
    currentPackageId: new Types.ObjectId(String(subscription.packageProjection?._id ?? subscription.record.packageId)),
    currentPackageVersionId: subscription.packageVersionId ? new Types.ObjectId(subscription.packageVersionId) : null,
    currentPackageVersion: subscription.packageVersion,
    currentBillingInterval: subscription.billingInterval,
    targetPackageId: new Types.ObjectId(target.packageId),
    targetPackageVersionId: new Types.ObjectId(target.packageVersionId),
    targetPackageVersion: target.packageVersion,
    targetBillingInterval: target.billingInterval,
    currency: target.currency,
    amountDueMinor,
    amountCreditMinor,
    effectiveAt: providerPreview.effectiveAt,
    nextBillingDate: subscription.periodEnd,
    expiresAt: providerPreview.expiresAt,
    subscriptionRevision: subscription.revision,
    provider: subscription.provider,
    providerPreviewReference: providerPreview.id,
    providerStateObservedAt: providerPreview.providerStateObservedAt,
    currentProviderPriceReference: subscription.providerPriceId,
    targetProviderPriceReference: target.providerPriceReference,
    entitlementImpact,
    createdBy: new Types.ObjectId(actor.actorId),
  });
  await getAuditWriter().write({
    action: "BILLING_PREVIEW_CREATED",
    resourceType: "BillingOperation",
    resourceId: String(preview._id),
    tenantId: input.tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    changes: {
      subscriptionId: subscription.id,
      targetPackageId: target.packageId,
      targetPackageVersion: target.packageVersion,
      billingInterval: target.billingInterval,
    },
  });
  return previewDto(preview, subscription, target);
}

export async function requestSubscriptionChange(input: {
  tenantId: string;
  previewId: string;
  idempotencyKey: string;
  provider: PaymentProvider;
  context: OperationAuthorizationContext;
}): Promise<{ operation: OperationDto; replayed: boolean }> {
  const actor = await authorizeTenantOperation(input.context, Permission.BILLING_MANAGE);
  assertTenant(input.tenantId, actor.tenantId);
  const [subscription, preview] = await Promise.all([
    loadSubscription(input.tenantId),
    loadPreview(input.previewId, input.tenantId),
  ]);
  if (preview.subscriptionId.toString() !== subscription.id) {
    throw new AppError(409, BILLING_PREVIEW_STALE, "Billing preview no longer matches this subscription");
  }
  assertProviderLinked(subscription);
  const target = await resolveTargetPackage(String(preview.targetPackageId), preview.targetBillingInterval);
  ensurePlanChangeAllowed(subscription, target);
  validateBillingPreview({
    now: new Date(),
    expiresAt: preview.expiresAt,
    expectedSubscriptionRevision: preview.subscriptionRevision,
    actualSubscriptionRevision: subscription.revision,
    expectedPackageVersionId: String(preview.targetPackageVersionId),
    actualPackageVersionId: target.packageVersionId,
    expectedCurrency: preview.currency,
    actualCurrency: target.currency,
    targetAvailable: true,
  });
  const normalizedRequest = {
    previewId: String(preview._id),
    subscriptionId: subscription.id,
    targetPackageId: target.packageId,
    targetPackageVersionId: target.packageVersionId,
    targetPackageVersion: target.packageVersion,
    billingInterval: target.billingInterval,
    currency: target.currency,
    expectedSubscriptionRevision: subscription.revision,
  };
  const operationService = new BillingOperationService();
  const started = await operationService.begin(startInput({
    tenantId: input.tenantId,
    actor,
    operationType: "PLAN_CHANGE",
    idempotencyKey: input.idempotencyKey,
    normalizedRequest,
    subscription,
    targetPackageId: target.packageId,
    packageVersionId: target.packageVersionId,
    previewReference: String(preview._id),
    previewExpiresAt: preview.expiresAt,
  }));
  let responseOperation = started.operation;
  if (!started.replayed) {
    await consumePreview(String(preview._id), input.tenantId, String(started.operation._id));
    const pending = await operationService.markProviderPending(started.operation);
    responseOperation = pending;
    try {
      const result = await input.provider.updateSubscription({
        subscriptionId: subscription.providerSubscriptionId,
        expectedCustomerId: subscription.providerCustomerId,
        targetPriceReference: target.providerPriceReference,
        targetPackage: {
          packageId: target.packageId,
          packageVersionId: target.packageVersionId,
          packageVersion: target.packageVersion,
          billingInterval: target.billingInterval,
        },
        previewReference: preview.providerPreviewReference || undefined,
        operationContext: operationContextFor(pending, input.idempotencyKey, normalizedRequest, input.tenantId, input.context.traceId),
      });
      await operationService.recordProviderResult(String(pending._id), input.tenantId, {
        operationReference: result.operationReference,
        objectReference: result.state?.id,
      });
    } catch (error) {
      const mapped = mapBillingProviderError(error);
      if (mapped.statusCode >= 500) {
        await operationService.markRetryPending(String(pending._id), input.tenantId, mapped.code, new Date(Date.now() + 60_000));
      } else {
        await operationService.fail(String(pending._id), input.tenantId, mapped.code);
      }
      throw mapped;
    }
  }
  await getAuditWriter().write({
    action: started.replayed ? "BILLING_OPERATION_REPLAYED" : "BILLING_PLAN_CHANGE_REQUESTED",
    resourceType: "BillingOperation",
    resourceId: String(started.operation._id),
    tenantId: input.tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    changes: { targetPackageId: target.packageId, targetPackageVersion: target.packageVersion, billingInterval: target.billingInterval },
  });
  return { operation: operationDto(responseOperation), replayed: started.replayed };
}

export async function requestCancellation(input: {
  tenantId: string;
  cancellationType: CancellationType;
  idempotencyKey: string;
  provider: PaymentProvider;
  context: OperationAuthorizationContext;
}): Promise<{ operation: OperationDto; replayed: boolean }> {
  const actor = await authorizeTenantOperation(input.context, Permission.BILLING_MANAGE);
  assertTenant(input.tenantId, actor.tenantId);
  const subscription = await loadSubscription(input.tenantId);
  assertProviderLinked(subscription);
  assertCancellationAllowed(subscription, input.cancellationType);
  const normalizedRequest = {
    subscriptionId: subscription.id,
    cancellationType: input.cancellationType,
    expectedSubscriptionRevision: subscription.revision,
  };
  const operationType = input.cancellationType === "IMMEDIATE" ? "CANCEL_IMMEDIATELY" : "CANCEL_PERIOD_END";
  const operationService = new BillingOperationService();
  const started = await operationService.execute(
    startInput({
      tenantId: input.tenantId,
      actor,
      operationType,
      idempotencyKey: input.idempotencyKey,
      normalizedRequest,
      subscription,
      cancellationType: input.cancellationType,
      effectiveAt: input.cancellationType === "PERIOD_END" ? subscription.periodEnd : null,
    }),
    (operation) => input.cancellationType === "IMMEDIATE"
      ? input.provider.cancelImmediately({
        subscriptionId: subscription.providerSubscriptionId,
        expectedCustomerId: subscription.providerCustomerId,
        operationContext: operationContextFor(operation, input.idempotencyKey, normalizedRequest, input.tenantId, input.context.traceId),
      })
      : input.provider.scheduleCancellation({
        subscriptionId: subscription.providerSubscriptionId,
        expectedCustomerId: subscription.providerCustomerId,
        operationContext: operationContextFor(operation, input.idempotencyKey, normalizedRequest, input.tenantId, input.context.traceId),
      }),
  );
  await getAuditWriter().write({
    action: started.replayed ? "BILLING_OPERATION_REPLAYED" : "BILLING_CANCELLATION_REQUESTED",
    resourceType: "BillingOperation",
    resourceId: String(started.operation._id),
    tenantId: input.tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    changes: { cancellationType: input.cancellationType },
  });
  return { operation: operationDto(started.operation), replayed: started.replayed };
}

export async function requestReactivation(input: {
  tenantId: string;
  idempotencyKey: string;
  provider: PaymentProvider;
  context: OperationAuthorizationContext;
}): Promise<{ operation: OperationDto; replayed: boolean }> {
  const actor = await authorizeTenantOperation(input.context, Permission.BILLING_MANAGE);
  assertTenant(input.tenantId, actor.tenantId);
  const subscription = await loadSubscription(input.tenantId);
  assertProviderLinked(subscription);
  assertReactivationAllowed(subscription);
  const normalizedRequest = {
    subscriptionId: subscription.id,
    expectedSubscriptionRevision: subscription.revision,
    reactivate: true,
  };
  const operationService = new BillingOperationService();
  const started = await operationService.execute(
    startInput({
      tenantId: input.tenantId,
      actor,
      operationType: "REACTIVATE",
      idempotencyKey: input.idempotencyKey,
      normalizedRequest,
      subscription,
    }),
    (operation) => input.provider.reactivateSubscription({
      subscriptionId: subscription.providerSubscriptionId,
      expectedCustomerId: subscription.providerCustomerId,
      operationContext: operationContextFor(operation, input.idempotencyKey, normalizedRequest, input.tenantId, input.context.traceId),
    }),
  );
  await getAuditWriter().write({
    action: started.replayed ? "BILLING_OPERATION_REPLAYED" : "BILLING_REACTIVATION_REQUESTED",
    resourceType: "BillingOperation",
    resourceId: String(started.operation._id),
    tenantId: input.tenantId,
    actorId: actor.actorId,
    actorEmail: actor.actorEmail,
    actorRole: actor.actorRole,
    changes: { subscriptionId: subscription.id },
  });
  return { operation: operationDto(started.operation), replayed: started.replayed };
}

export async function getCompanyBillingOperation(input: {
  operationId: string;
  tenantId: string;
  context: OperationAuthorizationContext;
}): Promise<OperationDto> {
  const actor = await authorizeTenantOperation(input.context, Permission.BILLING_READ);
  assertTenant(input.tenantId, actor.tenantId);
  const operation = await new BillingOperationService().findForTenant(input.operationId, input.tenantId);
  return operationDto(operation);
}

async function loadSubscription(tenantId: string): Promise<SubscriptionContext> {
  const subscription = await SubscriptionModel.findOne({
    tenantId: new Types.ObjectId(tenantId),
    status: { $in: ["TRIALING", "INCOMPLETE", "ACTIVE", "PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END"] },
  })
    .populate("packageId", "name code version currency entitlements")
    .lean()
    .exec() as Record<string, unknown> | null;
  if (!subscription) throw new AppError(404, NOT_FOUND, "Subscription not found");
  return {
    record: subscription,
    id: String(subscription._id),
    tenantId: String(subscription.tenantId),
    provider: String(subscription.provider || ""),
    providerCustomerId: String(subscription.providerCustomerId || ""),
    providerSubscriptionId: String(subscription.providerSubscriptionId || ""),
    providerPriceId: String(subscription.providerPriceId || ""),
    packageVersionId: subscription.packageVersionId ? String(subscription.packageVersionId) : null,
    packageVersion: Number(subscription.packageVersion ?? 0),
    billingInterval: subscription.billingInterval === "annual" ? "annual" : subscription.billingInterval === "monthly" ? "monthly" : null,
    revision: Number(subscription.revision ?? 0),
    status: String(subscription.status || ""),
    cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
    periodEnd: dateOrNull(subscription.currentPeriodEnd ?? subscription.periodEnd),
    packageProjection: subscription.packageId && typeof subscription.packageId === "object" ? subscription.packageId as Record<string, unknown> : null,
  };
}

async function resolveTargetPackage(packageId: string, billingInterval: BillingInterval): Promise<ResolvedTargetPackage> {
  if (!Types.ObjectId.isValid(packageId)) throw new AppError(404, NOT_FOUND, "Package not found");
  const pkg = await PackageModel.findById(packageId).lean().exec();
  if (!pkg || !pkg.active || pkg.visibility !== "public") {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Target package is unavailable");
  }
  const snapshot = (pkg.versions ?? []).find((candidate) => candidate.version === pkg.version)
    ?? ((pkg.versions?.length ?? 0) === 0
      ? {
        _id: new Types.ObjectId(legacyPackageVersionId(String(pkg._id), pkg.version)),
        version: pkg.version,
        name: pkg.name,
        code: pkg.code,
        currency: pkg.currency,
        entitlements: pkg.entitlements,
        stripePriceId: pkg.stripePriceId,
        stripeAnnualPriceId: pkg.stripeAnnualPriceId,
      }
      : null);
  if (!snapshot?._id) throw new AppError(409, BILLING_PROVIDER_CONFIGURATION_INVALID, "Package version mapping is unavailable");
  const providerPriceReference = billingInterval === "annual" ? snapshot.stripeAnnualPriceId : snapshot.stripePriceId;
  if (!providerPriceReference) throw new AppError(409, PRICE_NOT_CONFIGURED, "Package price is not configured");
  return {
    packageId: String(pkg._id),
    packageName: snapshot.name || pkg.name,
    packageCode: snapshot.code || pkg.code,
    packageVersion: snapshot.version,
    packageVersionId: String(snapshot._id),
    billingInterval,
    currency: String(snapshot.currency || pkg.currency).toUpperCase(),
    providerPriceReference,
    entitlements: normalizeEntitlements(snapshot.entitlements ?? pkg.entitlements),
  };
}

async function loadPreview(previewId: string, tenantId: string) {
  const preview = Types.ObjectId.isValid(previewId)
    ? await BillingPreviewModel.findOne({
      _id: new Types.ObjectId(previewId),
      tenantId: new Types.ObjectId(tenantId),
    }).select("+providerPreviewReference +currentProviderPriceReference +targetProviderPriceReference").exec()
    : null;
  if (!preview) throw new AppError(404, NOT_FOUND, "Billing preview not found");
  return preview;
}

async function consumePreview(previewId: string, tenantId: string, operationId: string): Promise<void> {
  const consumed = await BillingPreviewModel.findOneAndUpdate(
    {
      _id: new Types.ObjectId(previewId),
      tenantId: new Types.ObjectId(tenantId),
      $or: [
        { consumedByOperationId: null },
        { consumedByOperationId: new Types.ObjectId(operationId) },
      ],
    },
    {
      $set: {
        consumedByOperationId: new Types.ObjectId(operationId),
        consumedAt: new Date(),
      },
    },
    { returnDocument: "after" },
  ).exec();
  if (!consumed) {
    throw new AppError(409, BILLING_PREVIEW_STALE, "Billing preview is unavailable");
  }
}

async function assertNoPendingMutation(tenantId: string, subscriptionId: string): Promise<void> {
  const pending = await BillingOperationModel.exists({
    tenantId: new Types.ObjectId(tenantId),
    subscriptionId: new Types.ObjectId(subscriptionId),
    conflictGroup: "SUBSCRIPTION_MUTATION",
    status: { $in: ["REQUESTED", "PROVIDER_PENDING", "RETRY_PENDING"] },
  });
  if (pending) throw new AppError(409, BILLING_OPERATION_ALREADY_PENDING, "A billing change is already pending");
}

function ensurePlanChangeAllowed(subscription: SubscriptionContext, target: ResolvedTargetPackage): void {
  if (!subscription.providerSubscriptionId || !subscription.providerCustomerId) {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Provider-managed billing is unavailable");
  }
  const lifecycle = evaluateSubscriptionAccess({
    status: subscription.status as Parameters<typeof evaluateSubscriptionAccess>[0]["status"],
    now: new Date(),
    periodEnd: subscription.periodEnd,
    trialEnd: null,
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    pastDueSince: subscription.status === "PAST_DUE" ? dateOrNull(subscription.record.lastProviderEventTimestamp) : null,
    pastDueGraceDays: config.BILLING_PAST_DUE_GRACE_DAYS,
  });
  if (!lifecycle.eligible) {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Subscription is not eligible for a billing change");
  }
  if (String(subscription.packageProjection?._id ?? "") === target.packageId
    && subscription.packageVersionId === target.packageVersionId
    && subscription.billingInterval === target.billingInterval) {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Selected plan is already active");
  }
}

function ensureCurrencyCompatible(subscription: SubscriptionContext, targetCurrency: string): void {
  const currentCurrency = String(subscription.packageProjection?.currency ?? "").toUpperCase();
  if (currentCurrency && currentCurrency !== targetCurrency.toUpperCase()) {
    throw new AppError(409, BILLING_CURRENCY_MISMATCH, "Plan currency must match the current subscription");
  }
}

function assertCancellationAllowed(subscription: SubscriptionContext, cancellationType: CancellationType): void {
  if (!["TRIALING", "ACTIVE", "PAST_DUE", "CANCEL_AT_PERIOD_END"].includes(subscription.status)) {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Cancellation is not allowed for this subscription state");
  }
  if (subscription.status === "CANCELED" || subscription.status === "EXPIRED") {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Cancellation is already effective");
  }
  if (cancellationType === "PERIOD_END" && subscription.cancelAtPeriodEnd) {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Cancellation is already scheduled");
  }
}

function assertReactivationAllowed(subscription: SubscriptionContext): void {
  const effective = Boolean(subscription.periodEnd && subscription.periodEnd.getTime() <= Date.now());
  if (!subscription.cancelAtPeriodEnd && subscription.status !== "CANCEL_AT_PERIOD_END") {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "No scheduled cancellation can be reactivated");
  }
  if (effective || ["CANCELED", "EXPIRED", "UNPAID", "PAUSED", "INCOMPLETE"].includes(subscription.status)) {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "A new checkout is required");
  }
}

function assertProviderLinked(subscription: SubscriptionContext): void {
  if (!subscription.provider || !subscription.providerCustomerId || !subscription.providerSubscriptionId) {
    throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Provider-linked billing is unavailable");
  }
}

function startInput(input: {
  tenantId: string;
  actor: OperationAuthorizationContext;
  operationType: StartBillingOperationInput["operationType"];
  idempotencyKey: string;
  normalizedRequest: Record<string, unknown>;
  subscription: SubscriptionContext;
  targetPackageId?: string;
  packageVersionId?: string;
  previewReference?: string;
  previewExpiresAt?: Date;
  cancellationType?: CancellationType;
  effectiveAt?: Date | null;
}): StartBillingOperationInput {
  return {
    tenantId: input.tenantId,
    actor: input.actor,
    operationType: input.operationType,
    idempotencyKey: input.idempotencyKey,
    normalizedRequest: input.normalizedRequest,
    subscriptionId: input.subscription.id,
    provider: input.subscription.provider,
    targetPackageId: input.targetPackageId,
    packageVersionId: input.packageVersionId,
    expectedSubscriptionRevision: input.subscription.revision,
    previewReference: input.previewReference,
    previewExpiresAt: input.previewExpiresAt,
    cancellationType: input.cancellationType,
    effectiveAt: input.effectiveAt ?? null,
  };
}

function operationContextFor(
  operation: { _id: unknown },
  idempotencyKey: string,
  normalizedRequest: Record<string, unknown>,
  tenantId: string,
  traceId?: string,
): ProviderOperationContext {
  return providerOperationContext({
    idempotencyKey,
    requestFingerprint: createHash("sha256").update(JSON.stringify(normalizedRequest)).digest("hex"),
    tenantReference: tenantId,
    operationReference: String(operation._id),
    traceId,
  });
}

function providerOperationContext(value: ProviderOperationContext): ProviderOperationContext {
  return value;
}

function previewDto(preview: BillingPreviewDocument, subscription: SubscriptionContext, target: ResolvedTargetPackage): BillingChangePreviewDto {
  return {
    id: String(preview._id),
    currentPackage: {
      id: String(subscription.packageProjection?._id ?? subscription.record.packageId),
      name: String(subscription.packageProjection?.name ?? ""),
      code: String(subscription.packageProjection?.code ?? ""),
      version: subscription.packageVersion,
    },
    targetPackage: {
      id: target.packageId,
      name: target.packageName,
      code: target.packageCode,
      version: target.packageVersion,
    },
    billingInterval: target.billingInterval,
    currency: preview.currency,
    amountDueMinor: preview.amountDueMinor,
    amountCreditMinor: preview.amountCreditMinor,
    effectiveAt: preview.effectiveAt,
    nextBillingDate: preview.nextBillingDate,
    entitlementImpact: preview.entitlementImpact,
    expiresAt: preview.expiresAt,
    subscriptionRevision: preview.subscriptionRevision,
  };
}

function operationDto(operation: {
  _id: unknown;
  operationType: string;
  status: string;
  requestedAt: Date;
  confirmedAt?: Date | null;
  failedAt?: Date | null;
  retryCount?: number;
  failureCode?: string;
  effectiveAt?: Date | null;
  cancellationType?: CancellationType | null;
}): OperationDto {
  return {
    id: String(operation._id),
    type: operation.operationType,
    status: operation.status,
    requestedAt: operation.requestedAt,
    confirmedAt: operation.confirmedAt ?? null,
    failedAt: operation.failedAt ?? null,
    retryCount: operation.retryCount ?? 0,
    failureCode: operation.failureCode || null,
    effectiveAt: operation.effectiveAt ?? null,
    cancellationType: operation.cancellationType ?? null,
  };
}

function entitlementDelta(currentValue: unknown, targetValue: Record<string, number>): BillingPreviewImpactField[] {
  const current = normalizeEntitlements(currentValue);
  return Object.entries(targetValue)
    .map(([field, target]) => {
      const existing = current[field] ?? 0;
      return { field, current: existing, target, delta: target - existing };
    })
    .filter((entry) => entry.delta !== 0);
}

function normalizeEntitlements(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => typeof entry === "number" && Number.isFinite(entry))
      .map(([field, entry]) => [field, Number(entry)]),
  );
}

function assertTenant(requested: string, authenticated: string): void {
  if (requested !== authenticated) throw new AppError(404, NOT_FOUND, "Billing resource not found");
}

function dateOrNull(value: unknown): Date | null {
  return value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null;
}
