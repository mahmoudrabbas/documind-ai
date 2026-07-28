// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { SubscriptionWidget } from "../SubscriptionWidget";

/* ── Module mocks (hoisted by vitest) ───────────────────────────────── */

vi.mock("@/providers/auth-provider", () => ({ useAuth: vi.fn() }));
vi.mock("@/providers/permission-provider", () => ({ usePermissions: vi.fn() }));
vi.mock("@/services/billing.service", () => ({
  getSubscriptionStatus: vi.fn(),
  createBillingPortalSession: vi.fn(),
}));

/* ── Imports (resolved after hoisted mocks) ─────────────────────────── */

import { useAuth } from "@/providers/auth-provider";
import { usePermissions } from "@/providers/permission-provider";
import { getSubscriptionStatus } from "@/services/billing.service";
import { ApiError } from "@/lib/api-client";
import { Permission } from "@/types/api/permissions.types";
import type { SubscriptionStatus } from "@/types/api/billing.types";

/* ── Helpers ────────────────────────────────────────────────────────── */

function createMockSubscription(
  overrides: Partial<SubscriptionStatus> = {},
): SubscriptionStatus {
  return {
    id: "sub_123",
    tenantId: "tenant_1",
    packageId: {
      _id: "pkg_456",
      name: "Professional Plan",
      code: "pro-2026",
      version: 1,
      monthlyPrice: 49,
      annualPrice: 490,
      monthlyPriceCents: 4900,
      annualPriceCents: 49000,
      currency: "USD",
      entitlements: {
        employees: 25,
        admins: 3,
        documents: 1000,
        storageMb: 10240,
        fileSizeMb: 20,
        queriesPerMonth: 5000,
        tokensPerMonth: 100_000,
        ocrPagesPerMonth: 500,
      },
    },
    packageVersion: 1,
    billingInterval: "monthly",
    status: "ACTIVE",
    periodStart: "2026-01-15T00:00:00Z",
    periodEnd: "2026-07-15T00:00:00Z",
    currentPeriodStart: "2026-01-15T00:00:00Z",
    currentPeriodEnd: "2026-07-15T00:00:00Z",
    trialStart: null,
    trialEnd: null,
    paymentState: "paid",
    cancelAtPeriodEnd: false,
    cancellationEffectiveAt: null,
    providerManaged: true,
    providerLinked: true,
    pendingOperation: null,
    canOpenPortal: true,
    canUpdatePaymentMethod: true,
    canChangePlan: true,
    canCancel: true,
    canReactivate: false,
    canRequestRefund: true,
    ...overrides,
  };
}

/**
 * Render the widget and flush all pending effects / resolved promises /
 * React state updates so the component settles to its final state.
 */
async function renderAndSettle() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<SubscriptionWidget />);
  });

  // Flush microtasks (promise .then/.catch handlers) then React state updates
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  return { container, root };
}

/* ── Tests ──────────────────────────────────────────────────────────── */

describe("SubscriptionWidget", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    (useAuth as Mock).mockReturnValue({
      status: "authenticated",
      user: {
        id: "1",
        name: "Admin",
        email: "admin@test.com",
        role: "COMPANY_ADMIN",
      },
    });

    (usePermissions as Mock).mockReturnValue({
      status: "ready",
      can: vi.fn().mockReturnValue(true),
    });
  });

  /* ── 1. Loading state ────────────────────────────────────────── */

  it("shows a skeleton placeholder while the API call is in-flight", async () => {
    (getSubscriptionStatus as Mock).mockReturnValue(
      new Promise<never>(() => {}),
    );

    const { container } = await renderAndSettle();

    const region = container.querySelector('[role="status"]');
    expect(region).toBeTruthy();

    // Skeleton <div> elements have aria-hidden="true"
    const skeletons = region!.querySelectorAll('[aria-hidden="true"]');
    expect(skeletons.length).toBeGreaterThanOrEqual(2);
  });

  /* ── 2. No permission ────────────────────────────────────────── */

  it("returns null when the user lacks BILLING_READ permission", async () => {
    (usePermissions as Mock).mockReturnValue({
      status: "ready",
      can: vi.fn((perm: string) => perm !== Permission.BILLING_READ),
    });

    const { container } = await renderAndSettle();

    expect(container.children.length).toBe(0);
  });

  /* ── 3. Generic API error ──────────────────────────────────────── */

  it("shows an error message and a Retry button on generic API failure", async () => {
    (getSubscriptionStatus as Mock).mockRejectedValue(
      new Error("Network error"),
    );

    const { container } = await renderAndSettle();

    expect(container.textContent).toContain("Could not load subscription data");

    const retryBtn = container.querySelector("button");
    expect(retryBtn).toBeTruthy();
    expect(retryBtn!.textContent).toContain("Retry");
  });

  /* ── 4. No subscription (404) ──────────────────────────────────── */

  it('shows "No active subscription" and a "View Plans" link when API returns 404', async () => {
    (getSubscriptionStatus as Mock).mockRejectedValue(
      new ApiError({
        status: 404,
        message: "Subscription not found for tenant",
      }),
    );

    const { container } = await renderAndSettle();

    expect(container.textContent).toContain("No active subscription");

    const link = container.querySelector('a[href="/checkout"]');
    expect(link).toBeTruthy();
    expect(link!.textContent).toContain("View Plans");
  });

  /* ── 5. Active subscription ────────────────────────────────────── */

  it("renders the full subscription panel (plan name, badge, entitlements, price, Manage Billing) for an active subscription", async () => {
    (getSubscriptionStatus as Mock).mockResolvedValue({
      data: createMockSubscription(),
    });

    const { container } = await renderAndSettle();

    // Plan name
    expect(container.textContent).toContain("Professional Plan");

    // Status badge
    expect(container.textContent).toContain("Active");

    // Billing period
    expect(container.textContent).toContain("Billing Period:");

    // Entitlements
    expect(container.textContent).toContain("25 employees");
    expect(container.textContent).toContain("1,000");
    expect(container.textContent).toContain("10 GB");
    expect(container.textContent).toContain("5,000/mo");

    // Pricing
    expect(container.textContent).toContain("$49");
    expect(container.textContent).toContain("$490");

    // Manage Billing button (visible when providerCustomerId is set)
    const manageBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Manage Billing"),
    );
    expect(manageBtn).toBeTruthy();
  });

  /* ── 6. Trialing ───────────────────────────────────────────────── */

  it("shows trial information with days remaining for a TRIALING subscription", async () => {
    const now = new Date();
    const trialStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const trialEnd = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);

    (getSubscriptionStatus as Mock).mockResolvedValue({
      data: createMockSubscription({
        status: "TRIALING",
        periodStart: null,
        periodEnd: null,
        trialStart: trialStart.toISOString(),
        trialEnd: trialEnd.toISOString(),
      }),
    });

    const { container } = await renderAndSettle();

    expect(container.textContent).toContain("Trial:");
    expect(container.textContent).toContain("14d left");
  });

  /* ── 7. Cancel at period end ────────────────────────────────────── */

  it('shows a "Cancels at period end" warning when cancelAtPeriodEnd is true', async () => {
    (getSubscriptionStatus as Mock).mockResolvedValue({
      data: createMockSubscription({ cancelAtPeriodEnd: true }),
    });

    const { container } = await renderAndSettle();

    expect(container.textContent).toContain("Cancels at period end");
  });

  /* ── 8. No provider customer — Manage Billing hidden ────────────── */

  it("hides the Manage Billing button when the portal capability is unavailable", async () => {
    (getSubscriptionStatus as Mock).mockResolvedValue({
      data: createMockSubscription({ canOpenPortal: false }),
    });

    const { container } = await renderAndSettle();

    // The panel is still rendered
    expect(container.textContent).toContain("Professional Plan");

    // No Manage Billing button
    const manageBtn = Array.from(container.querySelectorAll("button")).find(
      (btn) => btn.textContent?.includes("Manage Billing"),
    );
    expect(manageBtn).toBeUndefined();
  });
});
