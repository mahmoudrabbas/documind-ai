import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { SubscriptionProvisioningPort } from "../../subscription-provisioning.port.js";
import type { ProviderEventEnvelope } from "../../subscription-provisioning.port.js";
import { FakeSubscriptionProvisioning } from "../fake-subscription-provisioning.js";

// ── Reusable test suite factory ──────────────────────────────────────────────
// Every test in this factory must pass for BOTH the fake adapter AND any
// future production adapter.  New adapters simply call this function with
// their own create/cleanup pair.

export function contractTests(
  label: string,
  createAdapter: () => SubscriptionProvisioningPort,
  cleanup?: () => Promise<void>,
): void {
  describe(`${label} — SubscriptionProvisioningPort contract`, () => {
    let adapter: SubscriptionProvisioningPort;

    beforeEach(() => {
      adapter = createAdapter();
    });

    afterEach(async () => {
      await cleanup?.();
    });

    // ── provision ───────────────────────────────────────────────────────

    it("provision creates a subscription record", async () => {
      const result = await adapter.provision("tenant-1", "pkg-basic");

      expect(result.tenantId).toBe("tenant-1");
      expect(result.packageId).toBe("pkg-basic");
      expect(result.subscriptionId).toBeTruthy();
      expect(result.status).toBe("INCOMPLETE");
    });

    it("provision is idempotent (same tenant returns same record)", async () => {
      const first = await adapter.provision("tenant-1", "pkg-basic");
      const second = await adapter.provision("tenant-1", "pkg-pro");

      expect(second.subscriptionId).toBe(first.subscriptionId);
      expect(second.tenantId).toBe("tenant-1");
      // Idempotent — packageId is not updated on repeat provision
      expect(second.packageId).toBe("pkg-basic");
    });

    // ── getEntitlement ──────────────────────────────────────────────────

    it("getEntitlement returns null for non-existent tenant", async () => {
      const result = await adapter.getEntitlement("non-existent");
      expect(result).toBeNull();
    });

    it("getEntitlement returns snapshot with all FR-PAY-001 fields", async () => {
      await adapter.provision("tenant-1", "pkg-basic");
      const snapshot = await adapter.getEntitlement("tenant-1");

      expect(snapshot).not.toBeNull();
      expect(snapshot!.employees).toBeTypeOf("number");
      expect(snapshot!.admins).toBeTypeOf("number");
      expect(snapshot!.documents).toBeTypeOf("number");
      expect(snapshot!.storageMb).toBeTypeOf("number");
      expect(snapshot!.fileSizeMb).toBeTypeOf("number");
      expect(snapshot!.queriesPerMonth).toBeTypeOf("number");
      expect(snapshot!.tokensPerMonth).toBeTypeOf("number");
      expect(snapshot!.ocrPagesPerMonth).toBeTypeOf("number");
      expect(Array.isArray(snapshot!.supportedModels)).toBe(true);
      expect(["basic", "advanced", "enterprise"]).toContain(
        snapshot!.analyticsLevel,
      );
      expect(snapshot!.retentionDays).toBeTypeOf("number");
      expect(["community", "standard", "priority", "dedicated"]).toContain(
        snapshot!.supportLevel,
      );
    });

    // ── getEntitlement after provision ──────────────────────────────────

    it("getEntitlement returns values after provision", async () => {
      await adapter.provision("tenant-1", "pkg-basic");
      const snapshot = await adapter.getEntitlement("tenant-1");

      expect(snapshot).not.toBeNull();
      expect(snapshot!.employees).toBeGreaterThanOrEqual(1);
      expect(snapshot!.documents).toBeGreaterThanOrEqual(1);
    });

    // ── transition (Super Admin override) ───────────────────────────────

    it("transition applies legal state change", async () => {
      await adapter.provision("tenant-1", "pkg-basic");
      const newStatus = await adapter.transition("tenant-1", "ACTIVE");
      expect(newStatus).toBe("ACTIVE");
    });

    it("transition rejects illegal state transitions", async () => {
      await adapter.provision("tenant-1", "pkg-basic");
      // INCOMPLETE → CANCELED is illegal per LEGAL_TRANSITIONS
      await expect(
        adapter.transition("tenant-1", "CANCELED"),
      ).rejects.toThrow("Illegal subscription transition");
    });

    // ── processProviderEvent ────────────────────────────────────────────

    describe("processProviderEvent", () => {
      function makeEvent(
        overrides: Partial<ProviderEventEnvelope> & {
          payload: { tenantId: string };
        },
      ): ProviderEventEnvelope {
        return {
          eventId: `evt_${Date.now()}_${Math.random()}`,
          eventType: "invoice.paid",
          provider: "stripe",
          timestamp: new Date(),
          ...overrides,
          payload: { ...overrides.payload },
        };
      }

      it("payment_method.attached transitions INCOMPLETE → ACTIVE", async () => {
        await adapter.provision("tenant-1", "pkg-basic");
        const result = await adapter.processProviderEvent(
          makeEvent({
            eventType: "payment_method.attached",
            payload: { tenantId: "tenant-1" },
          }),
        );
        expect(result.newStatus).toBe("ACTIVE");
        expect(result.entitlementChanged).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("invoice.payment_failed transitions ACTIVE → PAST_DUE", async () => {
        await adapter.provision("tenant-1", "pkg-basic");
        // Move to ACTIVE first
        await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_activate",
            eventType: "payment_method.attached",
            payload: { tenantId: "tenant-1" },
          }),
        );
        const result = await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_fail",
            eventType: "invoice.payment_failed",
            payload: { tenantId: "tenant-1" },
          }),
        );
        expect(result.newStatus).toBe("PAST_DUE");
        expect(result.entitlementChanged).toBe(false);
        expect(result.errors).toHaveLength(0);
      });

      it("invoice.paid transitions PAST_DUE → ACTIVE", async () => {
        await adapter.provision("tenant-1", "pkg-basic");
        await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_activate",
            eventType: "payment_method.attached",
            payload: { tenantId: "tenant-1" },
          }),
        );
        await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_fail",
            eventType: "invoice.payment_failed",
            payload: { tenantId: "tenant-1" },
          }),
        );
        const result = await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_pay",
            eventType: "invoice.paid",
            payload: { tenantId: "tenant-1" },
          }),
        );
        expect(result.newStatus).toBe("ACTIVE");
        expect(result.entitlementChanged).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("subscription.canceled transitions CANCEL_AT_PERIOD_END → CANCELED", async () => {
        await adapter.provision("tenant-1", "pkg-basic");
        await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_activate",
            eventType: "payment_method.attached",
            payload: { tenantId: "tenant-1" },
          }),
        );
        // Move to CANCEL_AT_PERIOD_END via subscription.updated
        await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_cancel_sched",
            eventType: "subscription.updated",
            payload: {
              tenantId: "tenant-1",
              cancel_at_period_end: true,
            },
          }),
        );
        const result = await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_cancel",
            eventType: "subscription.canceled",
            payload: { tenantId: "tenant-1" },
          }),
        );
        expect(result.newStatus).toBe("CANCELED");
        expect(result.entitlementChanged).toBe(false);
        expect(result.errors).toHaveLength(0);
      });

      it("subscription.updated with cancel_at_period_end=true transitions ACTIVE → CANCEL_AT_PERIOD_END", async () => {
        await adapter.provision("tenant-1", "pkg-basic");
        await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_activate",
            eventType: "payment_method.attached",
            payload: { tenantId: "tenant-1" },
          }),
        );
        const result = await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_sched",
            eventType: "subscription.updated",
            payload: {
              tenantId: "tenant-1",
              cancel_at_period_end: true,
            },
          }),
        );
        expect(result.newStatus).toBe("CANCEL_AT_PERIOD_END");
        expect(result.entitlementChanged).toBe(false);
        expect(result.errors).toHaveLength(0);
      });

      it("subscription.updated with cancel_at_period_end=false transitions CANCEL_AT_PERIOD_END → ACTIVE", async () => {
        await adapter.provision("tenant-1", "pkg-basic");
        await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_activate",
            eventType: "payment_method.attached",
            payload: { tenantId: "tenant-1" },
          }),
        );
        // First schedule cancellation
        await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_sched",
            eventType: "subscription.updated",
            payload: {
              tenantId: "tenant-1",
              cancel_at_period_end: true,
            },
          }),
        );
        // Then unschedule
        const result = await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_unsched",
            eventType: "subscription.updated",
            payload: {
              tenantId: "tenant-1",
              cancel_at_period_end: false,
            },
          }),
        );
        expect(result.newStatus).toBe("ACTIVE");
        expect(result.entitlementChanged).toBe(false);
        expect(result.errors).toHaveLength(0);
      });

      it("customer.subscription.deleted from ACTIVE transitions to EXPIRED", async () => {
        await adapter.provision("tenant-1", "pkg-basic");
        await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_activate",
            eventType: "payment_method.attached",
            payload: { tenantId: "tenant-1" },
          }),
        );
        const result = await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_delete1",
            eventType: "customer.subscription.deleted",
            payload: { tenantId: "tenant-1" },
          }),
        );
        expect(result.newStatus).toBe("EXPIRED");
        expect(result.entitlementChanged).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("customer.subscription.deleted from PAST_DUE transitions to EXPIRED", async () => {
        await adapter.provision("tenant-1", "pkg-basic");
        await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_activate",
            eventType: "payment_method.attached",
            payload: { tenantId: "tenant-1" },
          }),
        );
        await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_fail",
            eventType: "invoice.payment_failed",
            payload: { tenantId: "tenant-1" },
          }),
        );
        const result = await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_delete2",
            eventType: "customer.subscription.deleted",
            payload: { tenantId: "tenant-1" },
          }),
        );
        expect(result.newStatus).toBe("EXPIRED");
        expect(result.entitlementChanged).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("customer.subscription.deleted from PAUSED transitions to EXPIRED", async () => {
        await adapter.provision("tenant-1", "pkg-basic");
        await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_activate",
            eventType: "payment_method.attached",
            payload: { tenantId: "tenant-1" },
          }),
        );
        await adapter.transition("tenant-1", "PAUSED");
        const result = await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_delete3",
            eventType: "customer.subscription.deleted",
            payload: { tenantId: "tenant-1" },
          }),
        );
        expect(result.newStatus).toBe("EXPIRED");
        expect(result.entitlementChanged).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it("customer.subscription.deleted transitions ACTIVE/PAST_DUE/PAUSED → EXPIRED (legacy)", async () => {
        await adapter.provision("tenant-1", "pkg-basic");
        await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_activate",
            eventType: "payment_method.attached",
            payload: { tenantId: "tenant-1" },
          }),
        );
        const result1 = await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_delete1",
            eventType: "customer.subscription.deleted",
            payload: { tenantId: "tenant-1" },
          }),
        );
        expect(result1.newStatus).toBe("EXPIRED");
        expect(result1.entitlementChanged).toBe(true);
        expect(result1.errors).toHaveLength(0);
      });

      it("duplicate eventId is silently skipped (idempotency)", async () => {
        await adapter.provision("tenant-1", "pkg-basic");
        const event: ProviderEventEnvelope = {
          eventId: "evt_dup_test",
          eventType: "payment_method.attached",
          provider: "stripe",
          timestamp: new Date(),
          payload: { tenantId: "tenant-1" },
        };

        const first = await adapter.processProviderEvent(event);
        expect(first.newStatus).toBe("ACTIVE");
        expect(first.errors).toHaveLength(0);

        // Process the same event again
        const second = await adapter.processProviderEvent(event);
        expect(second.newStatus).toBe("ACTIVE");
        expect(second.entitlementChanged).toBe(false);
        expect(second.errors).toHaveLength(0);
      });

      it("unknown eventType returns error in SynchronizationResult.errors", async () => {
        await adapter.provision("tenant-1", "pkg-basic");
        const result = await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_unknown",
            eventType: "charge.dispute.created",
            payload: { tenantId: "tenant-1" },
          }),
        );
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain(
          "Unrecognized provider event type",
        );
        expect(result.errors[0]).toContain("charge.dispute.created");
      });

      it("returns error when no subscription found for payload tenantId", async () => {
        const result = await adapter.processProviderEvent(
          makeEvent({
            eventId: "evt_no_tenant",
            eventType: "invoice.paid",
            payload: { tenantId: "missing-tenant" },
          }),
        );
        expect(result.errors.length).toBeGreaterThan(0);
        expect(result.errors[0]).toContain("No subscription found");
      });
    });
  });
}

// ── Run against the fake adapter ─────────────────────────────────────────────
// Future production adapters should also invoke contractTests() with their
// own create/cleanup to guarantee behavioral conformance.

contractTests(
  "FakeSubscriptionProvisioning",
  () => {
    const fake = new FakeSubscriptionProvisioning();
    fake._reset();
    return fake;
  },
);
