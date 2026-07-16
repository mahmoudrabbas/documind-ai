import type { SubscriptionStatus } from "../billing.types.js";

/**
 * Envelope wrapping a raw provider webhook event (FR-PAY-004).
 *
 * Every event carries an idempotent `eventId` — the provider's own unique
 * identifier so duplicate deliveries can be safely skipped.
 */
export interface ProviderEventEnvelope {
  /** Unique idempotency key from the provider (e.g. Stripe's `id`). */
  eventId: string;
  /** Provider event type — e.g. "invoice.paid", "subscription.canceled". */
  eventType: string;
  /** Provider name — e.g. "stripe", "lemon_squeezy". */
  provider: string;
  /** ISO 8601 timestamp of when the event occurred at the provider. */
  timestamp: string;
  /** Raw provider payload — structure depends on provider + event type. */
  payload: Record<string, unknown>;
}

/**
 * Result of synchronising a provider event into the local subscription state.
 */
export interface SynchronizationResult {
  /** New status after applying the event, or null if no state change occurred. */
  newStatus: SubscriptionStatus | null;
  /** Whether the effective entitlements may have changed as a result. */
  entitlementChanged: boolean;
  /** Non-empty if the event could not be processed (unknown type, illegal transition, etc.). */
  errors: string[];
}

/**
 * Maps provider event types to the target subscription status (FR-PAY-004).
 *
 * Not every event in this map is legal from every current status — the
 * transition is validated against {@link LegalTransition} before being applied.
 */
export const ProviderEventTransitionMap: Record<string, SubscriptionStatus> = {
  "payment_method.attached": "ACTIVE",
  "invoice.paid": "ACTIVE",
  "invoice.payment_failed": "PAST_DUE",
  "subscription.canceled": "CANCELED",
  "subscription.updated": "CANCEL_AT_PERIOD_END",
  "subscription.paused": "PAUSED",
  "subscription.expired": "EXPIRED",
  "subscription.unpaid": "UNPAID",
} as const satisfies Record<string, SubscriptionStatus>;
