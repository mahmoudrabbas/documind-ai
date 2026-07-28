import type { ApiError } from "@/lib/api-client";
import type { SubscriptionStatus } from "@/types/api/billing.types";

export const BLOCKING_PROVIDER_SUBSCRIPTION_STATUSES = new Set([
  "TRIALING",
  "INCOMPLETE",
  "ACTIVE",
  "PAST_DUE",
  "PAUSED",
  "CANCEL_AT_PERIOD_END",
  "UNPAID",
]);

export interface CheckoutConflictState {
  kind: "active-subscription" | "checkout-pending";
  message: string;
  reusableCheckoutUrl: string | null;
  manageBillingAvailable: boolean;
}

type SubscriptionLike = Pick<
  SubscriptionStatus,
  "status" | "providerLinked" | "providerManaged" | "packageId"
>;

function resolvePackageId(pkg: SubscriptionLike["packageId"]): string | null {
  if (typeof pkg === "string") {
    return pkg;
  }

  if (pkg && typeof pkg === "object") {
    const candidate = pkg as { _id?: string; name?: string };
    if (typeof candidate._id === "string") {
      return candidate._id;
    }
  }

  return null;
}

function resolvePackageName(pkg: SubscriptionLike["packageId"]): string | null {
  if (pkg && typeof pkg === "object") {
    const candidate = pkg as { name?: string };
    if (typeof candidate.name === "string" && candidate.name.trim().length > 0) {
      return candidate.name;
    }
  }

  return null;
}

export function hasBlockingProviderSubscription(
  subscription: Pick<SubscriptionStatus, "status" | "providerLinked"> | null | undefined,
): boolean {
  if (!subscription?.providerLinked) {
    return false;
  }
  return BLOCKING_PROVIDER_SUBSCRIPTION_STATUSES.has(subscription.status);
}

export function getCurrentPackageId(subscription: SubscriptionLike | null | undefined): string | null {
  if (!subscription) return null;
  return resolvePackageId(subscription.packageId);
}

export function getCurrentPackageName(subscription: SubscriptionLike | null | undefined): string | null {
  if (!subscription) return null;
  return resolvePackageName(subscription.packageId);
}

export function classifyCheckoutError(error: ApiError): CheckoutConflictState | null {
  if (error.code === "ACTIVE_SUBSCRIPTION_EXISTS") {
    const details = error.details as {
      currentPackageName?: unknown;
      currentPackageId?: unknown;
      manageBillingAvailable?: unknown;
    } | null;
    return {
      kind: "active-subscription",
      message: "You already have an active subscription.",
      reusableCheckoutUrl: null,
      manageBillingAvailable: details?.manageBillingAvailable !== false,
    } satisfies CheckoutConflictState;
  }

  if (error.code === "CHECKOUT_SESSION_PENDING") {
    const details = error.details as {
      reusableCheckoutUrl?: unknown;
      url?: unknown;
    } | null;
    const reusableCheckoutUrl =
      typeof details?.reusableCheckoutUrl === "string" && details.reusableCheckoutUrl.trim().length > 0
        ? details.reusableCheckoutUrl
        : typeof details?.url === "string" && details.url.trim().length > 0
          ? details.url
          : null;
    return {
      kind: "checkout-pending",
      message: "A checkout session is already in progress.",
      reusableCheckoutUrl,
      manageBillingAvailable: false,
    } satisfies CheckoutConflictState;
  }

  return null;
}
