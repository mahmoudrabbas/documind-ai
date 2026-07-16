import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { FakeSubscriptionProvisioning } from "../fake-subscription-provisioning.js";
import type { ProviderEventEnvelope } from "../../provider-event.types.js";

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const TENANT_ID = "tenant-contract-001";
const PKG_FREE = "pkg_free_001"; // seeded by default

function makeEvent(
  overrides: Partial<ProviderEventEnvelope> & {
    eventId: string;
    eventType: string;
  },
): ProviderEventEnvelope {
  return {
    provider: "stripe",
    timestamp: new Date().toISOString(),
    payload: { tenantId: TENANT_ID },
    ...overrides,
  };
}

/* ------------------------------------------------------------------ */
/*  Contract: provision                                                */
/* ------------------------------------------------------------------ */

describe("FakeSubscriptionProvisioning — provision", () => {
  let fake: FakeSubscriptionProvisioning;

  beforeEach(() => {
    fake = new FakeSubscriptionProvisioning();
  });

  it("creates a subscription record with TRIALING status", async () => {
    const result = await fake.provision(TENANT_ID, PKG_FREE);

    assert.ok(result.subscriptionId, "subscriptionId must be set");
    assert.ok(result.periodEnd instanceof Date, "periodEnd must be a Date");
    assert.equal(result.status, "TRIALING");

    // Verify internal state
    const stored = fake.getSubscription(TENANT_ID);
    assert.ok(stored, "subscription must exist in internal map");
    assert.equal(stored.status, "TRIALING");
    assert.equal(stored.packageId, PKG_FREE);
  });

  it("is idempotent — second provision returns the same result", async () => {
    const first = await fake.provision(TENANT_ID, PKG_FREE);
    const second = await fake.provision(TENANT_ID, PKG_FREE);

    assert.equal(second.status, first.status);
    assert.equal(second.subscriptionId, first.subscriptionId);
    assert.equal(second.periodEnd.getTime(), first.periodEnd.getTime());
  });

  it("throws when the package does not exist", async () => {
    await assert.rejects(
      () => fake.provision(TENANT_ID, "pkg_nonexistent"),
      { message: "Package pkg_nonexistent not found" },
    );
  });
});

/* ------------------------------------------------------------------ */
/*  Contract: getEntitlement                                           */
/* ------------------------------------------------------------------ */

describe("FakeSubscriptionProvisioning — getEntitlement", () => {
  let fake: FakeSubscriptionProvisioning;

  beforeEach(() => {
    fake = new FakeSubscriptionProvisioning();
  });

  it("returns all 8 entitlement fields from the linked package", async () => {
    await fake.provision(TENANT_ID, PKG_FREE);
    const e = await fake.getEntitlement(TENANT_ID);

    // PackageEntitlements fields (8)
    assert.equal(typeof e.employees, "number");
    assert.equal(typeof e.admins, "number");
    assert.equal(typeof e.documents, "number");
    assert.equal(typeof e.storageMb, "number");
    assert.equal(typeof e.fileSizeMb, "number");
    assert.equal(typeof e.queriesPerMonth, "number");
    assert.equal(typeof e.tokensPerMonth, "number");
    assert.equal(typeof e.ocrPagesPerMonth, "number");
  });

  it("returns model, analytics, retention, and support fields", async () => {
    await fake.provision(TENANT_ID, PKG_FREE);
    const e = await fake.getEntitlement(TENANT_ID);

    assert.ok(Array.isArray(e.supportedModels));
    assert.equal(e.analyticsLevel, "basic");
    assert.equal(typeof e.retentionDays, "number");
    assert.equal(e.supportLevel, "community");
  });

  it("matches the free-package default values", async () => {
    await fake.provision(TENANT_ID, PKG_FREE);
    const e = await fake.getEntitlement(TENANT_ID);

    assert.equal(e.employees, 3);
    assert.equal(e.admins, 1);
    assert.equal(e.documents, 50);
    assert.equal(e.storageMb, 100);
    assert.equal(e.fileSizeMb, 10);
    assert.equal(e.queriesPerMonth, 500);
    assert.equal(e.tokensPerMonth, 0);
    assert.equal(e.ocrPagesPerMonth, 0);
    assert.deepEqual(e.supportedModels, ["basic"]);
    assert.equal(e.analyticsLevel, "basic");
    assert.equal(e.retentionDays, 90);
    assert.equal(e.supportLevel, "community");
  });

  it("throws when no subscription exists", async () => {
    await assert.rejects(
      () => fake.getEntitlement("nonexistent-tenant"),
      { message: "No subscription for tenant nonexistent-tenant" },
    );
  });

  it("reflects a custom registered package", async () => {
    fake.addPackage({
      _id: "pkg_pro_001",
      code: "pro",
      version: 1,
      entitlements: {
        employees: 100,
        admins: 10,
        documents: 5000,
        storageMb: 10_240,
        fileSizeMb: 100,
        queriesPerMonth: 50_000,
        tokensPerMonth: 1_000_000,
        ocrPagesPerMonth: 5_000,
      },
      supportedModels: ["basic", "advanced"],
      analyticsLevel: "advanced",
      retentionDays: 365,
      supportLevel: "standard",
    });

    await fake.provision(TENANT_ID, "pkg_pro_001");
    const e = await fake.getEntitlement(TENANT_ID);

    assert.equal(e.employees, 100);
    assert.equal(e.analyticsLevel, "advanced");
    assert.equal(e.retentionDays, 365);
    assert.equal(e.supportLevel, "standard");
    assert.deepEqual(e.supportedModels, ["basic", "advanced"]);
  });
});

/* ------------------------------------------------------------------ */
/*  Contract: transition                                               */
/* ------------------------------------------------------------------ */

describe("FakeSubscriptionProvisioning — transition", () => {
  let fake: FakeSubscriptionProvisioning;

  beforeEach(() => {
    fake = new FakeSubscriptionProvisioning();
  });

  it("rejects an illegal state transition (TRIALING → UNPAID)", async () => {
    await fake.provision(TENANT_ID, PKG_FREE);
    await assert.rejects(
      () => fake.transition(TENANT_ID, "UNPAID"),
      { message: "Cannot transition from TRIALING to UNPAID" },
    );
  });

  it("rejects transition when no subscription exists", async () => {
    await assert.rejects(
      () => fake.transition("nonexistent", "ACTIVE"),
      { message: "No subscription for tenant nonexistent" },
    );
  });

  it("allows a legal chain: TRIALING → ACTIVE → PAST_DUE → ACTIVE → CANCEL_AT_PERIOD_END → CANCELED", async () => {
    await fake.provision(TENANT_ID, PKG_FREE);

    // TRIALING → ACTIVE ✓
    const s1 = await fake.transition(TENANT_ID, "ACTIVE");
    assert.equal(s1, "ACTIVE");
    assert.equal(fake.getSubscription(TENANT_ID)?.status, "ACTIVE");

    // ACTIVE → PAST_DUE ✓
    const s2 = await fake.transition(TENANT_ID, "PAST_DUE");
    assert.equal(s2, "PAST_DUE");

    // PAST_DUE → ACTIVE ✓
    const s3 = await fake.transition(TENANT_ID, "ACTIVE");
    assert.equal(s3, "ACTIVE");

    // ACTIVE → CANCEL_AT_PERIOD_END ✓
    const s4 = await fake.transition(TENANT_ID, "CANCEL_AT_PERIOD_END");
    assert.equal(s4, "CANCEL_AT_PERIOD_END");

    // CANCEL_AT_PERIOD_END → CANCELED ✓
    const s5 = await fake.transition(TENANT_ID, "CANCELED");
    assert.equal(s5, "CANCELED");
  });

  it("sets cancelledAt when target is CANCELED", async () => {
    await fake.provision(TENANT_ID, PKG_FREE);
    await fake.transition(TENANT_ID, "ACTIVE");
    await fake.transition(TENANT_ID, "CANCELED");

    const sub = fake.getSubscription(TENANT_ID);
    assert.ok(sub?.cancelledAt, "cancelledAt must be set on CANCELED");
    assert.ok(sub.cancelledAt instanceof Date);
  });
});

/* ------------------------------------------------------------------ */
/*  Contract: processProviderEvent                                     */
/* ------------------------------------------------------------------ */

describe("FakeSubscriptionProvisioning — processProviderEvent", () => {
  let fake: FakeSubscriptionProvisioning;

  beforeEach(() => {
    fake = new FakeSubscriptionProvisioning();
  });

  it("applies a valid event transition (TRIALING → ACTIVE via invoice.paid)", async () => {
    await fake.provision(TENANT_ID, PKG_FREE);

    const result = await fake.processProviderEvent(
      makeEvent({
        eventId: "evt_001",
        eventType: "invoice.paid",
      }),
    );

    assert.equal(result.newStatus, "ACTIVE");
    assert.equal(result.entitlementChanged, true);
    assert.deepEqual(result.errors, []);
    assert.equal(fake.getSubscription(TENANT_ID)?.status, "ACTIVE");
  });

  it("silently skips a duplicate eventId", async () => {
    await fake.provision(TENANT_ID, PKG_FREE);

    const event = makeEvent({
      eventId: "evt_dup",
      eventType: "invoice.paid",
    });

    const first = await fake.processProviderEvent(event);
    assert.equal(first.newStatus, "ACTIVE");

    const second = await fake.processProviderEvent(event);
    assert.equal(second.newStatus, null);
    assert.equal(second.entitlementChanged, false);
    assert.deepEqual(second.errors, []);
    assert.ok(fake.hasProcessedEvent("evt_dup"));
  });

  it("returns error for unknown eventType", async () => {
    await fake.provision(TENANT_ID, PKG_FREE);

    const result = await fake.processProviderEvent(
      makeEvent({
        eventId: "evt_unknown",
        eventType: "chargeback.disputed",
      }),
    );

    assert.equal(result.newStatus, null);
    assert.equal(result.entitlementChanged, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes("Unknown event type"));
  });

  it("returns error when no tenantId in payload", async () => {
    // Event with no tenantId in payload
    const event: ProviderEventEnvelope = {
      eventId: "evt_no_tenant",
      eventType: "invoice.paid",
      provider: "stripe",
      timestamp: new Date().toISOString(),
      payload: {},
    };

    const result = await fake.processProviderEvent(event);

    assert.equal(result.newStatus, null);
    assert.equal(result.entitlementChanged, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes("No tenantId"));
  });

  it("returns error for illegal transition from current status", async () => {
    await fake.provision(TENANT_ID, PKG_FREE);

    // TRIALING → CANCELED via subscription.canceled IS legal per LegalTransition,
    // so let's try an illegal one: we need to be in a state where the mapping
    // is illegal. ACTIVE → UNPAID is not in the ProviderEventTransitionMap,
    // but subscription.unpaid → UNPAID IS mapped. Let's check:
    // TRIALING: LegalTransition says [ACTIVE, EXPIRED, CANCELED]
    // subscription.unpaid → UNPAID — UNPAID is NOT in TRIALING's allowed list
    const result = await fake.processProviderEvent(
      makeEvent({
        eventId: "evt_illegal",
        eventType: "subscription.unpaid",
      }),
    );

    assert.equal(result.newStatus, null);
    assert.equal(result.entitlementChanged, false);
    assert.ok(result.errors.length > 0);
    assert.ok(result.errors[0].includes("Cannot transition"));
  });

  it("applies multiple events along a legal chain", async () => {
    await fake.provision(TENANT_ID, PKG_FREE);

    // TRIALING → ACTIVE
    const r1 = await fake.processProviderEvent(
      makeEvent({ eventId: "e1", eventType: "invoice.paid" }),
    );
    assert.equal(r1.newStatus, "ACTIVE");

    // ACTIVE → PAST_DUE
    const r2 = await fake.processProviderEvent(
      makeEvent({ eventId: "e2", eventType: "invoice.payment_failed" }),
    );
    assert.equal(r2.newStatus, "PAST_DUE");

    // PAST_DUE → ACTIVE
    const r3 = await fake.processProviderEvent(
      makeEvent({ eventId: "e3", eventType: "invoice.paid" }),
    );
    assert.equal(r3.newStatus, "ACTIVE");

    // ACTIVE → CANCEL_AT_PERIOD_END
    const r4 = await fake.processProviderEvent(
      makeEvent({ eventId: "e4", eventType: "subscription.updated" }),
    );
    assert.equal(r4.newStatus, "CANCEL_AT_PERIOD_END");

    // CANCEL_AT_PERIOD_END → CANCELED
    const r5 = await fake.processProviderEvent(
      makeEvent({ eventId: "e5", eventType: "subscription.canceled" }),
    );
    assert.equal(r5.newStatus, "CANCELED");
  });
});
