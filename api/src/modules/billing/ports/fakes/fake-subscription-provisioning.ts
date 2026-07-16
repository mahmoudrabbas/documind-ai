import type { PackageEntitlements } from "../../../../db/models/package.model.js";
import type { SubscriptionStatus } from "../../billing.types.js";
import { LegalTransition } from "../../billing.types.js";
import type {
  SubscriptionProvisioningPort,
  ProvisionResult,
} from "../subscription-provisioning.port.js";
import type { EntitlementSnapshot } from "../entitlement-snapshot.port.js";
import type {
  ProviderEventEnvelope,
  SynchronizationResult,
} from "../provider-event.types.js";
import { ProviderEventTransitionMap } from "../provider-event.types.js";

/* ------------------------------------------------------------------ */
/*  Internal shape                                                     */
/* ------------------------------------------------------------------ */

interface FakeSubscription {
  tenantId: string;
  packageId: string;
  status: SubscriptionStatus;
  periodEnd: Date;
  cancelledAt?: Date;
}

interface FakePackage {
  _id: string;
  code: string;
  version: number;
  entitlements: PackageEntitlements;
  supportedModels: string[];
  analyticsLevel: string;
  retentionDays: number;
  supportLevel: string;
}

/* ------------------------------------------------------------------ */
/*  Fake implementation                                                */
/* ------------------------------------------------------------------ */

/**
 * In-memory fake implementation of {@link SubscriptionProvisioningPort}.
 *
 * Designed for **contract tests and local development** only. All state
 * lives in Maps — nothing is persisted.
 *
 * **Usage:**
 * ```typescript
 * const fake = new FakeSubscriptionProvisioning();
 * fake.addPackage({ _id: "pkg_pro_001", code: "pro", ... });
 *
 * const result = await fake.provision("tenant-1", "pkg_pro_001");
 * ```
 */
export class FakeSubscriptionProvisioning
  implements SubscriptionProvisioningPort
{
  private readonly subscriptions = new Map<string, FakeSubscription>();
  private readonly packages = new Map<string, FakePackage>();
  private readonly processedEvents = new Set<string>();

  constructor() {
    this.seedDefaultPackage();
  }

  /* ---------------------------------------------------------------- */
  /*  Test helpers                                                     */
  /* ---------------------------------------------------------------- */

  /**
   * Register a custom package that tests or downstream code can provision.
   */
  addPackage(pkg: FakePackage): void {
    this.packages.set(pkg._id, pkg);
  }

  /**
   * Access a subscription directly for test assertions.
   * Returns `undefined` if no subscription exists for the tenant.
   */
  getSubscription(tenantId: string): FakeSubscription | undefined {
    return this.subscriptions.get(tenantId);
  }

  /**
   * Reset all state — subscriptions, packages (except the default), and
   * processed-event dedup set. Useful between test cases.
   */
  reset(): void {
    this.subscriptions.clear();
    this.packages.clear();
    this.processedEvents.clear();
    this.seedDefaultPackage();
  }

  /**
   * Check whether an event ID has already been processed (idempotency).
   */
  hasProcessedEvent(eventId: string): boolean {
    return this.processedEvents.has(eventId);
  }

  /* ---------------------------------------------------------------- */
  /*  Port implementation                                              */
  /* ---------------------------------------------------------------- */

  async provision(
    tenantId: string,
    packageId: string,
  ): Promise<ProvisionResult> {
    // Idempotent — return existing subscription if present
    const existing = this.subscriptions.get(tenantId);
    if (existing) {
      return {
        subscriptionId: `sub_${tenantId}`,
        status: existing.status,
        periodEnd: existing.periodEnd,
      };
    }

    if (!this.packages.has(packageId)) {
      throw new Error(`Package ${packageId} not found`);
    }

    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    this.subscriptions.set(tenantId, {
      tenantId,
      packageId,
      status: "TRIALING",
      periodEnd,
    });

    return {
      subscriptionId: `sub_${tenantId}`,
      status: "TRIALING",
      periodEnd,
    };
  }

  async getEntitlement(tenantId: string): Promise<EntitlementSnapshot> {
    const sub = this.subscriptions.get(tenantId);
    if (!sub) {
      throw new Error(`No subscription for tenant ${tenantId}`);
    }

    const pkg = this.packages.get(sub.packageId);
    if (!pkg) {
      throw new Error(`Package ${sub.packageId} not found`);
    }

    return {
      ...pkg.entitlements,
      supportedModels: [...pkg.supportedModels],
      analyticsLevel: pkg.analyticsLevel as EntitlementSnapshot["analyticsLevel"],
      retentionDays: pkg.retentionDays,
      supportLevel: pkg.supportLevel as EntitlementSnapshot["supportLevel"],
    };
  }

  async transition(
    tenantId: string,
    targetState: SubscriptionStatus,
  ): Promise<SubscriptionStatus> {
    const sub = this.subscriptions.get(tenantId);
    if (!sub) {
      throw new Error(`No subscription for tenant ${tenantId}`);
    }

    const allowed = LegalTransition[sub.status];
    if (!allowed || !allowed.includes(targetState)) {
      throw new Error(
        `Cannot transition from ${sub.status} to ${targetState}`,
      );
    }

    sub.status = targetState;
    if (targetState === "CANCELED") {
      sub.cancelledAt = new Date();
    }

    return targetState;
  }

  async processProviderEvent(
    event: ProviderEventEnvelope,
  ): Promise<SynchronizationResult> {
    // Idempotency check — duplicate eventId is silently skipped
    if (this.processedEvents.has(event.eventId)) {
      return { newStatus: null, entitlementChanged: false, errors: [] };
    }

    // Resolve the tenant from the event payload
    const tenantId = event.payload?.tenantId;
    if (!tenantId || typeof tenantId !== "string") {
      return {
        newStatus: null,
        entitlementChanged: false,
        errors: ["No tenantId in event payload"],
      };
    }

    const sub = this.subscriptions.get(tenantId);
    if (!sub) {
      return {
        newStatus: null,
        entitlementChanged: false,
        errors: [`No subscription for tenant ${tenantId}`],
      };
    }

    // Map event type → target status
    const targetStatus = ProviderEventTransitionMap[event.eventType];
    if (!targetStatus) {
      return {
        newStatus: null,
        entitlementChanged: false,
        errors: [`Unknown event type: ${event.eventType}`],
      };
    }

    // Validate transition legality
    const allowed = LegalTransition[sub.status];
    if (!allowed || !allowed.includes(targetStatus)) {
      return {
        newStatus: null,
        entitlementChanged: false,
        errors: [
          `Cannot transition from ${sub.status} to ${targetStatus} (event: ${event.eventType})`,
        ],
      };
    }

    // Apply transition
    sub.status = targetStatus;
    if (targetStatus === "CANCELED") {
      sub.cancelledAt = new Date();
    }

    this.processedEvents.add(event.eventId);

    return { newStatus: targetStatus, entitlementChanged: true, errors: [] };
  }

  /* ---------------------------------------------------------------- */
  /*  Private helpers                                                  */
  /* ---------------------------------------------------------------- */

  private seedDefaultPackage(): void {
    const id = "pkg_free_001";
    this.packages.set(id, {
      _id: id,
      code: "free",
      version: 1,
      entitlements: {
        employees: 3,
        admins: 1,
        documents: 50,
        storageMb: 100,
        fileSizeMb: 10,
        queriesPerMonth: 500,
        tokensPerMonth: 0,
        ocrPagesPerMonth: 0,
      },
      supportedModels: ["basic"],
      analyticsLevel: "basic",
      retentionDays: 90,
      supportLevel: "community",
    });
  }
}

/* ---------------------------------------------------------------- */
/*  Re-exports for convenience                                        */
/* ---------------------------------------------------------------- */

export type {
  ProviderEventEnvelope,
  SynchronizationResult,
} from "../provider-event.types.js";
