import type { SubscriptionStatus } from "../../db/models/subscription.model.js";

type PackageProjection = Record<string, unknown> | null;
export interface CompanyBillingSummary {
  id: string; tenantId: string; status: SubscriptionStatus; paymentState: string;
  packageId: PackageProjection; packageVersion: number; billingInterval: "monthly" | "annual" | null;
  periodStart: Date | null; periodEnd: Date | null; currentPeriodStart: Date | null; currentPeriodEnd: Date | null;
  trialStart: Date | null; trialEnd: Date | null; cancelAtPeriodEnd: boolean; cancellationEffectiveAt: Date | null;
  providerManaged: boolean; providerLinked: boolean;
  pendingOperation: { type: string; status: string; requestedAt: Date } | null;
  canOpenPortal: boolean; canUpdatePaymentMethod: boolean; canChangePlan: boolean;
  canCancel: boolean; canReactivate: boolean; canRequestRefund: boolean;
}

export function toCompanyBillingSummary(
  subscription: Record<string, unknown>,
  pendingOperation: { operationType: string; status: string; requestedAt: Date; conflictGroup?: string | null } | null = null,
  hasPendingSubscriptionMutation = Boolean(pendingOperation?.conflictGroup === "SUBSCRIPTION_MUTATION"),
): CompanyBillingSummary {
  const status = subscription.status as SubscriptionStatus;
  const providerManaged = Boolean(subscription.providerCustomerId || subscription.providerSubscriptionId);
  const providerLinked = Boolean(subscription.providerSubscriptionId);
  const pkg = sanitizePackage(subscription.packageId);
  const active = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCEL_AT_PERIOD_END"].includes(status);
  return {
    id: String(subscription._id), tenantId: String(subscription.tenantId), status,
    paymentState: String(subscription.paymentState ?? "pending"), packageId: pkg,
    packageVersion: Number(subscription.packageVersion),
    billingInterval: subscription.billingInterval === "monthly" || subscription.billingInterval === "annual" ? subscription.billingInterval : null,
    periodStart: dateOrNull(subscription.periodStart), periodEnd: dateOrNull(subscription.periodEnd),
    currentPeriodStart: dateOrNull(subscription.currentPeriodStart), currentPeriodEnd: dateOrNull(subscription.currentPeriodEnd),
    trialStart: dateOrNull(subscription.trialStart), trialEnd: dateOrNull(subscription.trialEnd),
    cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
    cancellationEffectiveAt: subscription.cancelAtPeriodEnd ? dateOrNull(subscription.currentPeriodEnd ?? subscription.periodEnd) : null,
    providerManaged, providerLinked,
    pendingOperation: pendingOperation ? { type: pendingOperation.operationType, status: pendingOperation.status, requestedAt: pendingOperation.requestedAt } : null,
    canOpenPortal: Boolean(subscription.providerCustomerId), canUpdatePaymentMethod: Boolean(subscription.providerCustomerId),
    canChangePlan: providerLinked && active && !hasPendingSubscriptionMutation,
    canCancel: providerLinked && active && !subscription.cancelAtPeriodEnd && !hasPendingSubscriptionMutation,
    canReactivate: providerLinked && Boolean(subscription.cancelAtPeriodEnd) && !hasPendingSubscriptionMutation,
    canRequestRefund: Boolean(subscription.providerCustomerId),
  };
}

function sanitizePackage(value: unknown): PackageProjection {
  if (!value || typeof value !== "object") return null;
  const pkg = value as Record<string, unknown>;
  return {
    _id: pkg._id ? String(pkg._id) : undefined, name: pkg.name, code: pkg.code, version: pkg.version,
    monthlyPrice: pkg.monthlyPrice, annualPrice: pkg.annualPrice,
    monthlyPriceCents: pkg.monthlyPrice, annualPriceCents: pkg.annualPrice,
    currency: pkg.currency, entitlements: pkg.entitlements,
  };
}
function dateOrNull(value: unknown): Date | null { return value instanceof Date ? value : typeof value === "string" || typeof value === "number" ? new Date(value) : null; }
