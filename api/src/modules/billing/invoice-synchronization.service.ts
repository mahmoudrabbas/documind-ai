import { Types } from "mongoose";
import { AppError } from "../../common/errors/AppError.js";
import {
  BILLING_OPERATION_NOT_ALLOWED,
  BILLING_OPERATION_ALREADY_PENDING,
  BILLING_PROVIDER_OWNERSHIP_MISMATCH,
  BILLING_PROVIDER_UNAVAILABLE,
  NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import { getAuditWriter, getMetricRecorder } from "../../common/observability/index.js";
import InvoiceModel from "../../db/models/invoice.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import BillingOperationModel from "../../db/models/billingOperation.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import type { PaymentProvider, ProviderInvoice } from "./ports/payment-provider.port.js";
import { isSystemPlatformTenant } from "../../common/auth/platformTenant.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { authorizePlatformOperation, type OperationAuthorizationContext } from "../permissions/permissions.operation.js";

export const INVOICE_WEBHOOK_EVENTS = new Set([
  "invoice.created",
  "invoice.finalized",
  "invoice.updated",
  "invoice.paid",
  "invoice.payment_failed",
  "invoice.voided",
  "invoice.marked_uncollectible",
]);

export const BILLING_SUBSCRIPTION_NOT_READY = "BILLING_SUBSCRIPTION_NOT_READY";

export class RetryableInvoiceSynchronizationError extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = "RetryableInvoiceSynchronizationError";
  }
}

export interface InvoiceProjectionResult {
  outcome: "created" | "updated" | "unchanged";
  invoiceId: string;
}

interface OwnedSubscription {
  _id: Types.ObjectId;
  tenantId: Types.ObjectId;
  provider: string;
  providerCustomerId: string;
  providerSubscriptionId: string;
}

export async function synchronizeInvoiceFromReference(input: {
  provider: PaymentProvider;
  providerName: string;
  providerInvoiceId: string;
  providerCustomerId: string;
  providerSubscriptionId?: string;
  sourceEventId: string;
}): Promise<InvoiceProjectionResult> {
  const subscription = await findOwnedSubscription(input.providerCustomerId, input.providerSubscriptionId);
  let providerInvoice: ProviderInvoice;
  try {
    providerInvoice = await input.provider.retrieveInvoice({
      invoiceId: input.providerInvoiceId,
      expectedCustomerId: subscription.providerCustomerId,
    });
  } catch (error) {
    getMetricRecorder().increment("billing.invoice.provider_read_failed", { provider: input.providerName });
    await getAuditWriter().write({
      action: "BILLING_INVOICE_SYNCHRONIZATION_FAILED",
      resourceType: "Subscription",
      resourceId: String(subscription._id),
      tenantId: String(subscription.tenantId),
      outcome: "FAILURE",
      changes: { failureCode: BILLING_PROVIDER_UNAVAILABLE },
    }).catch(() => false);
    throw mapInvoiceProviderError(error);
  }
  return projectProviderInvoice({
    subscription,
    providerName: input.providerName,
    providerInvoice,
    sourceEventId: input.sourceEventId,
  });
}

export async function reconcileTenantInvoices(input: {
  tenantId: string;
  provider: PaymentProvider;
  maxRecords?: number;
  context?: OperationAuthorizationContext;
}): Promise<{ examined: number; created: number; updated: number; unchanged: number; failed: number }> {
  if (!Types.ObjectId.isValid(input.tenantId)) throw new AppError(404, NOT_FOUND, "Tenant subscription not found");
  const actor = input.context ? await authorizePlatformOperation(input.context, Permission.BILLING_MANAGE) : null;
  const tenant = await TenantModel.findById(input.tenantId).select("slug status isSystemTenant").lean().exec();
  if (!tenant || tenant.status !== "active") throw new AppError(404, NOT_FOUND, "Target tenant not found");
  if (isSystemPlatformTenant(tenant)) throw new AppError(409, BILLING_OPERATION_NOT_ALLOWED, "Target tenant is not eligible for invoice reconciliation");

  const subscriptions = await SubscriptionModel.find({
    tenantId: new Types.ObjectId(input.tenantId),
    providerCustomerId: { $ne: "" },
    providerSubscriptionId: { $ne: "" },
  }).lean().exec() as unknown as OwnedSubscription[];
  if (subscriptions.length === 0) throw new AppError(404, NOT_FOUND, "Provider-linked subscription not found");

  let locked = false;
  if (actor) {
    locked = await acquireInvoiceReconciliationLock(input.tenantId, actor.actorId, actor.actorRole);
    if (!locked) throw new AppError(409, BILLING_OPERATION_ALREADY_PENDING, "Invoice reconciliation is already pending for this tenant");
  }

  try {
    const startedAt = Date.now();
    const result = { examined: 0, created: 0, updated: 0, unchanged: 0, failed: 0 };
    const maximum = Math.min(500, Math.max(1, input.maxRecords ?? 200));

    for (const subscription of subscriptions) {
      if (result.examined >= maximum) break;
      try {
        const consumed = await reconcileSubscriptionInvoices(subscription, input.provider, input.tenantId, maximum - result.examined, result);
        result.examined += consumed.examined;
        result.created += consumed.created;
        result.updated += consumed.updated;
        result.unchanged += consumed.unchanged;
        result.failed += consumed.failed;
      } catch {
        result.failed += 1;
      }
    }

    getMetricRecorder().histogram("billing.invoice.reconciliation_duration_ms", Date.now() - startedAt, { tenantId: input.tenantId });
    for (const key of ["created", "updated", "unchanged", "failed"] as const) {
      getMetricRecorder().gauge(`billing.invoice.reconciliation_${key}`, result[key], { tenantId: input.tenantId });
    }
    await getAuditWriter().write({
      action: "BILLING_INVOICE_SYNCHRONIZED",
      resourceType: "Tenant",
      resourceId: input.tenantId,
      tenantId: input.tenantId,
      changes: result,
    });
    return result;
  } finally {
    if (locked) await releaseInvoiceReconciliationLock(input.tenantId);
  }
}

export async function projectProviderInvoice(input: {
  subscription: OwnedSubscription;
  providerName: string;
  providerInvoice: ProviderInvoice;
  sourceEventId: string;
}): Promise<InvoiceProjectionResult> {
  const { subscription, providerInvoice } = input;
  if (providerInvoice.customerId !== subscription.providerCustomerId) ownershipMismatch();
  if (providerInvoice.subscriptionId && providerInvoice.subscriptionId !== subscription.providerSubscriptionId) ownershipMismatch();
  if (!Number.isInteger(providerInvoice.amountDueMinor) || !Number.isInteger(providerInvoice.amountPaidMinor) || !Number.isInteger(providerInvoice.amountRemainingMinor) || !Number.isInteger(providerInvoice.subtotalMinor)) {
    throw new AppError(409, BILLING_PROVIDER_OWNERSHIP_MISMATCH, "Invalid provider invoice projection");
  }
  const amounts = [providerInvoice.amountDueMinor, providerInvoice.amountPaidMinor, providerInvoice.amountRemainingMinor, providerInvoice.subtotalMinor, providerInvoice.taxMinor];
  if (amounts.some((amount) => amount !== null && (!Number.isSafeInteger(amount) || amount < 0)) || !/^[A-Z]{3}$/i.test(providerInvoice.currency)) {
    throw new AppError(409, BILLING_PROVIDER_OWNERSHIP_MISMATCH, "Invalid provider invoice projection");
  }
  const existing = await InvoiceModel.findOne({ provider: input.providerName, providerInvoiceId: providerInvoice.id }).lean().exec();
  if (existing && String(existing.tenantId) !== String(subscription.tenantId)) ownershipMismatch();
  const observedAt = providerInvoice.observedAt ?? new Date();
  if (existing?.providerStateObservedAt && existing.providerStateObservedAt.getTime() > observedAt.getTime()) {
    return { outcome: "unchanged", invoiceId: String(existing._id) };
  }
  const projection = {
    tenantId: subscription.tenantId,
    subscriptionId: subscription._id,
    provider: input.providerName,
    providerInvoiceId: providerInvoice.id,
    invoiceNumber: providerInvoice.number ?? "",
    status: providerInvoice.status,
    currency: providerInvoice.currency.toUpperCase(),
    amountDueMinor: providerInvoice.amountDueMinor,
    amountPaidMinor: providerInvoice.amountPaidMinor,
    amountRemainingMinor: providerInvoice.amountRemainingMinor,
    subtotalMinor: providerInvoice.subtotalMinor,
    taxMinor: providerInvoice.taxMinor,
    createdAtProvider: providerInvoice.createdAt,
    dueAt: providerInvoice.dueAt,
    paidAt: providerInvoice.paidAt,
    periodStart: providerInvoice.periodStart,
    periodEnd: providerInvoice.periodEnd,
    synchronizedAt: new Date(),
    hostedInvoiceAvailable: Boolean(providerInvoice.hostedInvoiceAvailable),
    invoicePdfAvailable: Boolean(providerInvoice.invoicePdfAvailable),
    receiptAvailable: Boolean(providerInvoice.receiptAvailable),
    providerVersion: providerInvoice.providerVersion ?? "",
    lastProviderEventId: input.sourceEventId,
    providerStateObservedAt: observedAt,
  };
  if (!existing) {
    try {
      const created = await InvoiceModel.create(projection);
      await auditProjection(String(created._id), String(subscription.tenantId), "created");
      return { outcome: "created", invoiceId: String(created._id) };
    } catch (error) {
      if (isDuplicateKey(error)) return projectProviderInvoice(input);
      throw error;
    }
  }
  const changed = invoiceChanged(existing as unknown as Record<string, unknown>, projection);
  if (!changed) return { outcome: "unchanged", invoiceId: String(existing._id) };
  const update = await InvoiceModel.updateOne({
    _id: existing._id,
    tenantId: subscription.tenantId,
    $or: [
      { providerStateObservedAt: null },
      { providerStateObservedAt: { $lte: observedAt } },
    ],
  }, { $set: projection });
  if (update.modifiedCount === 0) return { outcome: "unchanged", invoiceId: String(existing._id) };
  await auditProjection(String(existing._id), String(subscription.tenantId), "updated");
  return { outcome: "updated", invoiceId: String(existing._id) };
}

async function findOwnedSubscription(customerId: string, subscriptionId?: string): Promise<OwnedSubscription> {
  const query: Record<string, unknown> = { providerCustomerId: customerId };
  if (subscriptionId) query.providerSubscriptionId = subscriptionId;
  const subscriptions = await SubscriptionModel.find(query).limit(2).lean().exec() as unknown as OwnedSubscription[];
  if (subscriptions.length === 0) {
    throw new RetryableInvoiceSynchronizationError(BILLING_SUBSCRIPTION_NOT_READY);
  }
  if (subscriptions.length !== 1) ownershipMismatch();
  return subscriptions[0];
}

function invoiceChanged(existing: Record<string, unknown>, next: Record<string, unknown>): boolean {
  const scalarFields = ["invoiceNumber", "status", "currency", "amountDueMinor", "amountPaidMinor", "amountRemainingMinor", "subtotalMinor", "taxMinor", "hostedInvoiceAvailable", "invoicePdfAvailable", "receiptAvailable", "providerVersion"];
  if (scalarFields.some((key) => existing[key] !== next[key])) return true;
  return ["createdAtProvider", "dueAt", "paidAt", "periodStart", "periodEnd"]
    .some((key) => dateValue(existing[key]) !== dateValue(next[key]));
}

function dateValue(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const date = value instanceof Date ? value : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.getTime();
}

function isDuplicateKey(error: unknown): boolean {
  return Boolean(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 11000);
}

async function auditProjection(invoiceId: string, tenantId: string, outcome: string): Promise<void> {
  await getAuditWriter().write({ action: "BILLING_INVOICE_SYNCHRONIZED", resourceType: "Invoice", resourceId: invoiceId, tenantId, changes: { outcome } });
}

function ownershipMismatch(): never {
  throw new AppError(409, BILLING_PROVIDER_OWNERSHIP_MISMATCH, "Provider invoice ownership mismatch");
}

function mapInvoiceProviderError(_error: unknown): AppError {
  return new AppError(503, BILLING_PROVIDER_UNAVAILABLE, "Billing provider is temporarily unavailable");
}

async function reconcileSubscriptionInvoices(
  subscription: OwnedSubscription,
  provider: PaymentProvider,
  tenantId: string,
  maximum: number,
  total: { examined: number; created: number; updated: number; unchanged: number; failed: number },
): Promise<{ examined: number; created: number; updated: number; unchanged: number; failed: number }> {
  const result = { examined: 0, created: 0, updated: 0, unchanged: 0, failed: 0 };
  let cursor: string | undefined;
  const seenCursors = new Set<string>();
  do {
    let page;
    try {
      page = await provider.listInvoices({ customerId: subscription.providerCustomerId, limit: Math.min(50, maximum - result.examined), cursor });
    } catch (error) {
      getMetricRecorder().increment("billing.invoice.reconciliation_failed", { provider: subscription.provider || "unknown" });
      await getAuditWriter().write({
        action: "BILLING_INVOICE_SYNCHRONIZATION_FAILED",
        resourceType: "Subscription",
        resourceId: String(subscription._id),
        tenantId,
        outcome: "FAILURE",
        changes: { failureCode: BILLING_PROVIDER_UNAVAILABLE },
      }).catch(() => false);
      throw mapInvoiceProviderError(error);
    }
    for (const invoice of page.invoices) {
      if (result.examined >= maximum || total.examined + result.examined >= 500) break;
      result.examined += 1;
      try {
        const projected = await projectProviderInvoice({ subscription, providerName: subscription.provider || "stripe", providerInvoice: invoice, sourceEventId: "reconciliation" });
        result[projected.outcome] += 1;
      } catch {
        result.failed += 1;
      }
    }
    if (!page.hasMore || result.examined >= maximum || !page.nextCursor || seenCursors.has(page.nextCursor)) {
      cursor = undefined;
    } else {
      seenCursors.add(page.nextCursor);
      cursor = page.nextCursor;
    }
  } while (cursor);
  return result;
}

async function acquireInvoiceReconciliationLock(tenantId: string, actorId: string, actorRole: string): Promise<boolean> {
  const operation = await BillingOperationModel.findOneAndUpdate(
    {
      tenantId: new Types.ObjectId(tenantId),
      operationType: "INVOICE_SYNCHRONIZATION",
      provider: "internal-reconciliation",
      status: { $in: ["REQUESTED", "PROVIDER_PENDING", "RETRY_PENDING"] },
      providerObjectReference: "invoice-reconciliation",
    },
    {
      $setOnInsert: {
        actorId: new Types.ObjectId(actorId),
        actorRole,
        operationType: "INVOICE_SYNCHRONIZATION",
        status: "REQUESTED",
        conflictGroup: null,
        subscriptionId: null,
        requestFingerprint: "invoice-reconciliation",
        idempotencyKeyHash: `invoice-reconciliation:${tenantId}`,
        provider: "internal-reconciliation",
        providerOperationReference: "",
        providerObjectReference: "invoice-reconciliation",
        previewReference: "",
        requestedAt: new Date(),
      },
    },
    { upsert: true, new: false, rawResult: true },
  ) as unknown as { lastErrorObject?: { updatedExisting?: boolean } } | null;
  return !(operation?.lastErrorObject?.updatedExisting);
}

async function releaseInvoiceReconciliationLock(tenantId: string): Promise<void> {
  await BillingOperationModel.deleteOne({
    tenantId: new Types.ObjectId(tenantId),
    operationType: "INVOICE_SYNCHRONIZATION",
    provider: "internal-reconciliation",
    providerObjectReference: "invoice-reconciliation",
  }).catch(() => undefined);
}
