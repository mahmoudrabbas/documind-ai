import type { SubscriptionStatus } from "../../db/models/subscription.model.js";

type PackageProjection = Record<string, unknown> | null;
export interface CompanyBillingSummary {
  id: string; tenantId: string; status: SubscriptionStatus; paymentState: string;
  packageId: PackageProjection; packageVersion: number; billingInterval: "monthly" | "annual" | null;
  periodStart: Date | null; periodEnd: Date | null; currentPeriodStart: Date | null; currentPeriodEnd: Date | null;
  trialStart: Date | null; trialEnd: Date | null; cancelAtPeriodEnd: boolean; cancellationEffectiveAt: Date | null;
  providerManaged: boolean; providerLinked: boolean;
  pendingOperation: { id: string; type: string; status: string; requestedAt: Date; failureCode?: string | null; effectiveAt?: Date | null; cancellationType?: "IMMEDIATE" | "PERIOD_END" | null } | null;
  canOpenPortal: boolean; canUpdatePaymentMethod: boolean; canChangePlan: boolean;
  canCancel: boolean; canReactivate: boolean; canRequestRefund: boolean;
  canViewInvoices: boolean;
  lifecycle: { eligible: boolean; inGracePeriod: boolean; accessEndsAt: Date | null; reason: string };
  invoiceSummary: { total: number; open: number; paid: number; pastDue: number };
  transitionState: "ACTIVE" | "TRANSITION_PENDING" | "TRANSITION_RETRYABLE" | "REPAIR_REQUIRED";
}

export function toCompanyBillingSummary(
  subscription: Record<string, unknown>,
  pendingOperation: { _id?: unknown; operationType: string; status: string; requestedAt: Date; conflictGroup?: string | null; failureCode?: string; effectiveAt?: Date | null; cancellationType?: "IMMEDIATE" | "PERIOD_END" | null } | null = null,
  _hasPendingSubscriptionMutation = Boolean(pendingOperation?.conflictGroup === "SUBSCRIPTION_MUTATION"),
  extras: {
    lifecycle?: CompanyBillingSummary["lifecycle"];
    invoiceSummary?: CompanyBillingSummary["invoiceSummary"];
    capabilities?: Partial<Pick<CompanyBillingSummary, "canOpenPortal" | "canUpdatePaymentMethod" | "canViewInvoices" | "canChangePlan" | "canCancel" | "canReactivate" | "canRequestRefund">>;
  } = {},
): CompanyBillingSummary {
  const status = subscription.status as SubscriptionStatus;
  const providerManaged = Boolean(subscription.providerCustomerId || subscription.providerSubscriptionId);
  const providerLinked = Boolean(subscription.providerSubscriptionId);
  const pkg = sanitizePackage(subscription.packageId);
  const paymentState = !providerLinked && pkg?.code === "free"
    ? "not_applicable"
    : String(subscription.paymentState ?? "pending");
  const active = ["TRIALING", "ACTIVE", "PAST_DUE", "CANCEL_AT_PERIOD_END"].includes(status);
  return {
    id: String(subscription._id), tenantId: String(subscription.tenantId), status,
    paymentState, packageId: pkg,
    packageVersion: Number(subscription.packageVersion),
    billingInterval: subscription.billingInterval === "monthly" || subscription.billingInterval === "annual" ? subscription.billingInterval : null,
    periodStart: dateOrNull(subscription.periodStart), periodEnd: dateOrNull(subscription.periodEnd),
    currentPeriodStart: dateOrNull(subscription.currentPeriodStart), currentPeriodEnd: dateOrNull(subscription.currentPeriodEnd),
    trialStart: dateOrNull(subscription.trialStart), trialEnd: dateOrNull(subscription.trialEnd),
    cancelAtPeriodEnd: Boolean(subscription.cancelAtPeriodEnd),
    cancellationEffectiveAt: subscription.cancelAtPeriodEnd ? dateOrNull(subscription.currentPeriodEnd ?? subscription.periodEnd) : null,
    providerManaged, providerLinked,
    pendingOperation: pendingOperation ? {
      id: pendingOperation._id ? String(pendingOperation._id) : "",
      type: pendingOperation.operationType,
      status: pendingOperation.status,
      requestedAt: pendingOperation.requestedAt,
      failureCode: pendingOperation.failureCode || null,
      effectiveAt: pendingOperation.effectiveAt ?? null,
      cancellationType: pendingOperation.cancellationType ?? null,
    } : null,
    canOpenPortal: extras.capabilities?.canOpenPortal ?? (Boolean(subscription.providerCustomerId) && providerLinked),
    canUpdatePaymentMethod: extras.capabilities?.canUpdatePaymentMethod ?? (Boolean(subscription.providerCustomerId) && providerLinked),
    canViewInvoices: extras.capabilities?.canViewInvoices ?? providerLinked,
    canChangePlan: extras.capabilities?.canChangePlan ?? false,
    canCancel: extras.capabilities?.canCancel ?? false,
    canReactivate: extras.capabilities?.canReactivate ?? false,
    canRequestRefund: extras.capabilities?.canRequestRefund ?? false,
    lifecycle: extras.lifecycle ?? { eligible: active, inGracePeriod: false, accessEndsAt: null, reason: status },
    invoiceSummary: extras.invoiceSummary ?? { total: 0, open: 0, paid: 0, pastDue: 0 },
    transitionState: "ACTIVE",
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
