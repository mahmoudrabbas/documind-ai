import type {
  SubscriptionProvisioningPort,
  ProvisionResult,
  ProviderEventEnvelope,
  SynchronizationResult,
} from "../subscription-provisioning.port.js";
import type { EntitlementSnapshot } from "../entitlement-snapshot.port.js";
import type { SubscriptionStatus } from "../../billing.types.js";

// ── Internal stored record ───────────────────────────────────────────────────

interface SubscriptionRecord {
  subscriptionId: string;
  tenantId: string;
  packageId: string;
  status: SubscriptionStatus;
  createdAt: Date;
}

// ── Event → transition rule ──────────────────────────────────────────────────

interface EventTransitionRule {
  /** One or more source statuses that activate this rule */
  fromStatus: readonly SubscriptionStatus[];
  /** The target status after the transition */
  toStatus: SubscriptionStatus;
  /** Whether the tenant's entitlements should be re-evaluated */
  entitlementChanged: boolean;
  /**
   * Optional predicate to inspect the event payload before applying.
   * When the rule is keyed as "subscription.updated" the predicate
   * distinguishes cancel_at_period_end=true from cancel_at_period_end=false.
   */
  predicate?: (payload: Record<string, unknown>) => boolean;
}

// ── Transition table ─────────────────────────────────────────────────────────

const EVENT_TRANSITION_MAP: Record<
  string,
  EventTransitionRule | EventTransitionRule[]
> = {
  "payment_method.attached": {
    fromStatus: ["INCOMPLETE"],
    toStatus: "ACTIVE",
    entitlementChanged: true,
  },
  "invoice.payment_failed": {
    fromStatus: ["ACTIVE"],
    toStatus: "PAST_DUE",
    entitlementChanged: false,
  },
  "invoice.paid": {
    fromStatus: ["PAST_DUE"],
    toStatus: "ACTIVE",
    entitlementChanged: true,
  },
  "subscription.canceled": {
    fromStatus: ["CANCEL_AT_PERIOD_END"],
    toStatus: "CANCELED",
    entitlementChanged: false,
  },
  "subscription.updated": [
    {
      fromStatus: ["ACTIVE"],
      toStatus: "CANCEL_AT_PERIOD_END",
      entitlementChanged: false,
      predicate: (payload) => payload.cancel_at_period_end === true,
    },
    {
      fromStatus: ["CANCEL_AT_PERIOD_END"],
      toStatus: "ACTIVE",
      entitlementChanged: false,
      predicate: (payload) => payload.cancel_at_period_end === false,
    },
  ],
  "customer.subscription.deleted": {
    fromStatus: ["ACTIVE", "PAST_DUE", "PAUSED"],
    toStatus: "EXPIRED",
    entitlementChanged: true,
  },
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function generateId(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ── Default entitlement values (FR-PAY-001) ──────────────────────────────────

const DEFAULT_ENTITLEMENT: EntitlementSnapshot = {
  employees: 3,
  admins: 1,
  documents: 50,
  storageMb: 100,
  fileSizeMb: 10,
  queriesPerMonth: 500,
  tokensPerMonth: 0,
  ocrPagesPerMonth: 0,
  supportedModels: ["basic"],
  analyticsLevel: "basic",
  retentionDays: 90,
  supportLevel: "community",
};

// ── Fake implementation ──────────────────────────────────────────────────────

export class FakeSubscriptionProvisioning
  implements SubscriptionProvisioningPort
{
  private readonly subscriptions = new Map<
    string,
    SubscriptionRecord
  >();
  private readonly processedEvents = new Set<string>();

  // ── Lifecycle helpers for tests ─────────────────────────────────────────

  /** Reset all internal state. Call in afterEach / beforeEach. */
  _reset(): void {
    this.subscriptions.clear();
    this.processedEvents.clear();
  }

  /** Seed a subscription record directly (convenience for test setup). */
  _seed(record: SubscriptionRecord): void {
    this.subscriptions.set(record.tenantId, record);
  }

  /**
   * Expose stored records for test assertions.
   * Returns a shallow copy to prevent mutation.
   */
  _dump(): Map<string, SubscriptionRecord> {
    return new Map(this.subscriptions);
  }

  /** Check whether a given eventId has already been processed. */
  _isProcessed(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  // ── Port implementation ─────────────────────────────────────────────────

  async provision(
    tenantId: string,
    packageId: string,
  ): Promise<ProvisionResult> {
    const existing = this.subscriptions.get(tenantId);
    if (existing) {
      return {
        subscriptionId: existing.subscriptionId,
        tenantId: existing.tenantId,
        packageId: existing.packageId,
        status: existing.status,
      };
    }

    const record: SubscriptionRecord = {
      subscriptionId: generateId(),
      tenantId,
      packageId,
      status: "INCOMPLETE",
      createdAt: new Date(),
    };
    this.subscriptions.set(tenantId, record);

    return {
      subscriptionId: record.subscriptionId,
      tenantId: record.tenantId,
      packageId: record.packageId,
      status: record.status,
    };
  }

  async getEntitlement(
    tenantId: string,
  ): Promise<EntitlementSnapshot | null> {
    const record = this.subscriptions.get(tenantId);
    if (!record) return null;
    // Fake always returns the default entitlement because it has no
    // real package → entitlement resolution. Production adapters will
    // look up the actual package for the tenant.
    return { ...DEFAULT_ENTITLEMENT };
  }

  async transition(
    tenantId: string,
    targetState: SubscriptionStatus,
  ): Promise<SubscriptionStatus> {
    const record = this.subscriptions.get(tenantId);
    if (!record) {
      throw new Error(
        `Subscription not found for tenant: ${tenantId}`,
      );
    }

    const fromState = record.status;
    const legalTargets = LEGAL_TRANSITIONS[fromState];

    if (!legalTargets.includes(targetState)) {
      throw new Error(
        `Illegal subscription transition: ${fromState} → ${targetState}`,
      );
    }

    record.status = targetState;
    return targetState;
  }

  async processProviderEvent(
    event: ProviderEventEnvelope,
  ): Promise<SynchronizationResult> {
    // ── Idempotency ────────────────────────────────────────────────────
    if (this.processedEvents.has(event.eventId)) {
      const record = this.findRecordForPayload(event.payload);
      return {
        newStatus: record?.status ?? "ACTIVE",
        entitlementChanged: false,
        errors: [],
      };
    }

    // ── Resolve tenant from payload ────────────────────────────────────
    const record = this.findRecordForPayload(event.payload);
    if (!record) {
      return {
        newStatus: "ACTIVE" as SubscriptionStatus,
        entitlementChanged: false,
        errors: [
          `No subscription found for event payload: ${JSON.stringify(event.payload)}`,
        ],
      };
    }

    // ── Look up rules ──────────────────────────────────────────────────
    const rule = EVENT_TRANSITION_MAP[event.eventType];
    if (!rule) {
      return {
        newStatus: record.status,
        entitlementChanged: false,
        errors: [
          `Unrecognized provider event type: ${event.eventType}`,
        ],
      };
    }

    // ── Resolve which rule applies (handles array rules with predicates) ──
    const rules: EventTransitionRule[] = Array.isArray(rule) ? rule : [rule];
    const matchingRule = rules.find(
      (r) =>
        r.fromStatus.includes(record.status) &&
        (r.predicate?.(event.payload) ?? true),
    );

    if (!matchingRule) {
      return {
        newStatus: record.status,
        entitlementChanged: false,
        errors: [
          `No matching transition rule for event ${event.eventType} from status ${record.status}`,
        ],
      };
    }

    // ── Apply transition ───────────────────────────────────────────────
    record.status = matchingRule.toStatus;
    this.processedEvents.add(event.eventId);

    return {
      newStatus: matchingRule.toStatus,
      entitlementChanged: matchingRule.entitlementChanged,
      errors: [],
    };
  }

  // ── Internal helpers ──────────────────────────────────────────────────

  /**
   * Extract tenantId from the event payload.
   * Provider webhooks are expected to include tenantId in the payload.
   */
  private findRecordForPayload(
    payload: Record<string, unknown>,
  ): SubscriptionRecord | undefined {
    const tenantId = payload.tenantId as string | undefined;
    if (tenantId) return this.subscriptions.get(tenantId);
    return undefined;
  }
}

// ── Legal transitions mirror (same as subscription.service.ts) ───────────────

const LEGAL_TRANSITIONS: Record<
  SubscriptionStatus,
  readonly SubscriptionStatus[]
> = {
  TRIALING: ["ACTIVE", "PAST_DUE", "CANCEL_AT_PERIOD_END"],
  INCOMPLETE: ["ACTIVE", "PAST_DUE", "EXPIRED"],
  ACTIVE: ["PAST_DUE", "PAUSED", "CANCEL_AT_PERIOD_END", "EXPIRED"],
  PAST_DUE: ["ACTIVE", "PAUSED", "EXPIRED", "UNPAID"],
  PAUSED: ["ACTIVE", "EXPIRED"],
  "CANCEL_AT_PERIOD_END": ["ACTIVE", "CANCELED", "EXPIRED"],
  CANCELED: [],
  EXPIRED: ["ACTIVE", "UNPAID"],
  UNPAID: ["ACTIVE", "EXPIRED"],
};
