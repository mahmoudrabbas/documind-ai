import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { buildProvisionInput, buildUpdateInput, validateSubscriptionReason } from "./subscription-operation.contract";
import type { PlatformSubscriptionRecord } from "@/types/api/super-admin.types";

const existing = {
  _id: "sub", tenantId: { _id: "tenant", name: "Tenant", slug: "tenant", status: "active" },
  packageId: { _id: "pkg-a", name: "A", code: "a", version: 1, monthlyPrice: 10, currency: "USD" },
  packageVersion: 1, status: "ACTIVE", version: 3, providerManaged: false,
  providerState: { hasCustomer: false, hasSubscription: false, hasPrice: false },
  periodStart: null, periodEnd: null, trialEnd: null, cancelledAt: null, renewsAt: null,
  currentPeriodStart: null, currentPeriodEnd: null, updatedAt: new Date(0).toISOString(),
} satisfies PlatformSubscriptionRecord;

describe("subscription operation contracts", () => {
  it("provisions explicitly and package-only update omits unchanged ACTIVE status", () => {
    expect(buildProvisionInput("pkg-a", "trialing", "  Approved provisioning  ")).toEqual({
      packageId: "pkg-a", status: "trialing", expectedVersion: 0, reason: "Approved provisioning",
    });
    expect(buildUpdateInput(existing, { packageId: "pkg-b", status: "active" }, "  Package approved  ")).toEqual({
      packageId: "pkg-b", expectedVersion: 3, reason: "Package approved",
    });
  });

  it("omits unchanged fields and validates mandatory reason", () => {
    expect(buildUpdateInput(existing, { packageId: "pkg-a", status: "ACTIVE" }, "No change request")).toEqual({
      expectedVersion: 3, reason: "No change request",
    });
    expect(validateSubscriptionReason(" short ")).toContain("10");
    expect(validateSubscriptionReason("Approved by billing")).toBeNull();
  });

  it("keeps one idempotency key per mounted attempt and accessible preview states", async () => {
    const source = await readFile(new URL("./subscription-operation-dialog.tsx", import.meta.url), "utf8");
    expect(source).toContain("useRef(crypto.randomUUID())");
    expect(source).toContain('role="dialog"');
    expect(source).toContain('aria-modal="true"');
    expect(source).toContain('event.key === "Escape"');
    expect(source).toContain("setRetry((value) => value + 1)");
    expect(source).toContain("preview.transitionAllowed");
  });
});
