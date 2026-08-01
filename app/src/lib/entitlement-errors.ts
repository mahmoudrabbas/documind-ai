/**
 * Entitlement denial mapping.
 *
 * Pure helpers that translate the backend entitlement error contract into
 * UI-level denial states. The backend responds with
 * `{ error: { code, message, details } }` where:
 *
 * - HTTP 403 + `SUBSCRIPTION_INACTIVE` — the tenant's subscription is not
 *   serviceable (canceled / expired / refunded) → "Subscription Inactive" UI.
 * - HTTP 429 + `ENTITLEMENT_EXCEEDED` — an entitlement counter is exhausted
 *   (e.g. `tokensPerMonth`) → "Quota Exceeded" banner with quota details.
 *
 * These helpers are framework-free so they can be unit-tested directly.
 */

import { ApiError, ENTITLEMENT_EXCEEDED } from "@/lib/api-client";

/** Backend error code returned when a tenant's subscription is not serviceable. */
export const SUBSCRIPTION_INACTIVE = "SUBSCRIPTION_INACTIVE";

export type EntitlementDenialKind = "subscription-inactive" | "quota-exceeded";

/** Quota payload the backend attaches to a 429 `ENTITLEMENT_EXCEEDED` denial. */
export interface QuotaExceededDenial {
  kind: "quota-exceeded";
  /** Counter dimension that was exhausted (e.g. "tokensPerMonth"). */
  dimension: string;
  /** Current counter value at denial time. */
  current: number;
  /** Effective limit for the dimension. */
  limit: number;
  /** Units remaining under the limit. */
  remaining: number;
  /** Whether the requesting actor may take an upgrade action. */
  canUpgrade: boolean;
  /** ISO date the quota period resets, if known. */
  periodReset: string | null;
}

export interface SubscriptionInactiveDenial {
  kind: "subscription-inactive";
}

export type EntitlementDenial =
  | SubscriptionInactiveDenial
  | QuotaExceededDenial;

/** Extracts the numeric/string quota fields from the opaque `details` payload. */
function readQuotaDetails(details: unknown): {
  dimension?: string;
  current?: number;
  limit?: number;
  remaining?: number;
  canUpgrade?: boolean;
  periodReset?: string;
} {
  if (typeof details !== "object" || details === null) {
    return {};
  }
  const record = details as Record<string, unknown>;
  const out: {
    dimension?: string;
    current?: number;
    limit?: number;
    remaining?: number;
    canUpgrade?: boolean;
    periodReset?: string;
  } = {};
  if (typeof record.dimension === "string" && record.dimension !== "") {
    out.dimension = record.dimension;
  }
  if (typeof record.current === "number") out.current = record.current;
  if (typeof record.limit === "number") out.limit = record.limit;
  if (typeof record.remaining === "number") out.remaining = record.remaining;
  if (typeof record.canUpgrade === "boolean") {
    out.canUpgrade = record.canUpgrade;
  }
  if (typeof record.periodReset === "string") {
    out.periodReset = record.periodReset;
  }
  return out;
}

/**
 * Maps an unknown error to a UI denial state, or `null` when it is not an
 * entitlement denial.
 *
 * Matching uses the real backend error codes (`SUBSCRIPTION_INACTIVE` /
 * `ENTITLEMENT_EXCEEDED`) in addition to the HTTP status so that unrelated
 * 403s (e.g. `PERMISSION_REQUIRED`) are never treated as subscription
 * denials.
 */
export function mapEntitlementError(error: unknown): EntitlementDenial | null {
  if (!(error instanceof ApiError)) {
    return null;
  }

  if (error.status === 403 && error.code === SUBSCRIPTION_INACTIVE) {
    return { kind: "subscription-inactive" };
  }

  if (error.status === 429 && error.code === ENTITLEMENT_EXCEEDED) {
    const details = readQuotaDetails(error.details);
    return {
      kind: "quota-exceeded",
      dimension: details.dimension ?? "quota",
      current: details.current ?? 0,
      limit: details.limit ?? 0,
      remaining: details.remaining ?? 0,
      canUpgrade: details.canUpgrade ?? false,
      periodReset: details.periodReset ?? null,
    };
  }

  return null;
}
