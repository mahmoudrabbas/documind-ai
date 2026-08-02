export interface BillingPeriod {
  start: Date;
  end: Date;
}

export function normalizeBillingPeriod(start: unknown, end: unknown): BillingPeriod | null {
  const normalizedStart = start instanceof Date ? start : start ? new Date(String(start)) : null;
  const normalizedEnd = end instanceof Date ? end : end ? new Date(String(end)) : null;
  if (!normalizedStart || !normalizedEnd) return null;
  if (!Number.isFinite(normalizedStart.getTime()) || !Number.isFinite(normalizedEnd.getTime())) return null;
  if (normalizedEnd.getTime() <= normalizedStart.getTime()) return null;
  return { start: normalizedStart, end: normalizedEnd };
}

export interface CanonicalBillingPeriodInput {
  providerServicePeriodStart?: unknown;
  providerServicePeriodEnd?: unknown;
  existingPeriodStart?: unknown;
  existingPeriodEnd?: unknown;
  subscriptionCurrentPeriodStart?: unknown;
  subscriptionCurrentPeriodEnd?: unknown;
  subscriptionPeriodStart?: unknown;
  subscriptionPeriodEnd?: unknown;
}

/**
 * Resolve only authoritative service periods. Invoice header dates are
 * intentionally excluded because Stripe may expose equal billing timestamps
 * there that are not the subscription line's service period.
 */
export function resolveCanonicalBillingPeriod(input: CanonicalBillingPeriodInput): BillingPeriod | null {
  const providerLinePeriod = normalizeBillingPeriod(input.providerServicePeriodStart, input.providerServicePeriodEnd);
  if (providerLinePeriod) return providerLinePeriod;
  return normalizeBillingPeriod(input.existingPeriodStart, input.existingPeriodEnd) ??
    normalizeBillingPeriod(input.subscriptionCurrentPeriodStart, input.subscriptionCurrentPeriodEnd) ??
    normalizeBillingPeriod(input.subscriptionPeriodStart, input.subscriptionPeriodEnd);
}
