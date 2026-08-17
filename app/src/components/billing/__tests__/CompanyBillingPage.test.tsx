// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { CompanyBillingPage } from "../CompanyBillingPage";
import { Permission } from "@/types/api/permissions.types";

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "ar", t: (key: string) => key }));
vi.mock("@/providers/i18n-provider", () => ({ useI18n: () => ({ locale: localeState.locale, dir: localeState.locale === "ar" ? "rtl" : "ltr", t: localeState.t, tPlural: (key: string) => key, setLocale: vi.fn() }), useIntlLocale: () => (localeState.locale === "ar" ? "ar-EG-u-nu-latn" : "en-US"), useDirection: () => (localeState.locale === "ar" ? "rtl" : "ltr") }));
vi.mock("@/providers/permission-provider", () => ({ usePermissions: vi.fn() }));
vi.mock("@/services/billing.service", () => ({
  getBillingSummary: vi.fn(),
  listInvoices: vi.fn(),
  listRefundRequests: vi.fn(),
  createRefundRequest: vi.fn(),
  createRefundEligibilityPreview: vi.fn(),
  createBillingPortalSession: vi.fn(),
  getInvoiceLinks: vi.fn(),
  getInvoicePdfBlobUrl: vi.fn(),
  listPublicBillingPackages: vi.fn(),
  createSubscriptionChangePreview: vi.fn(),
  requestSubscriptionChange: vi.fn(),
  requestBillingCancellation: vi.fn(),
  requestBillingReactivation: vi.fn(),
  getBillingOperation: vi.fn(),
}));

import { usePermissions } from "@/providers/permission-provider";
import { createBillingPortalSession, createRefundEligibilityPreview, createRefundRequest, createSubscriptionChangePreview, getBillingOperation, getBillingSummary, getInvoiceLinks, getInvoicePdfBlobUrl, listInvoices, listPublicBillingPackages, listRefundRequests, requestBillingCancellation, requestBillingReactivation, requestSubscriptionChange } from "@/services/billing.service";

const summary = {
  id: "local-sub", tenantId: "local-tenant", packageId: { _id: "pkg", name: "Pro", code: "pro", version: 2, monthlyPrice: 10, annualPrice: 100, monthlyPriceCents: 1000, annualPriceCents: 10000, currency: "USD", entitlements: { employees: 1, admins: 1, documents: 1, storageMb: 1, fileSizeMb: 1, queriesPerMonth: 1, tokensPerMonth: 1, ocrPagesPerMonth: 1 } },
  packageVersion: 2, billingInterval: "monthly", status: "ACTIVE", paymentState: "paid", periodStart: "2026-07-01T00:00:00.000Z", periodEnd: "2026-08-01T00:00:00.000Z", currentPeriodStart: "2026-07-01T00:00:00.000Z", currentPeriodEnd: "2026-08-01T00:00:00.000Z", trialStart: null, trialEnd: null, cancelAtPeriodEnd: false, cancellationEffectiveAt: null,
  providerManaged: true, providerLinked: true, pendingOperation: null, canOpenPortal: true, canUpdatePaymentMethod: true, canViewInvoices: true, canChangePlan: true, canCancel: true, canReactivate: false, canRequestRefund: true,
  lifecycle: { eligible: true, inGracePeriod: false, accessEndsAt: null, reason: "ACTIVE" }, invoiceSummary: { total: 1, open: 0, paid: 1, pastDue: 0 },
};
const invoice = { id: "local-invoice", invoiceNumber: "INV-1", status: "paid", currency: "USD", amountDueMinor: 1250, amountPaidMinor: 1250, amountRemainingMinor: 0, subtotalMinor: 1250, taxMinor: null, createdAt: "2026-07-02T00:00:00.000Z", dueAt: null, paidAt: "2026-07-02T00:00:00.000Z", periodStart: null, periodEnd: null, refundedAmountMinor: 0, reservedRefundAmountMinor: 0, remainingRefundableMinor: 1250, canRequestRefund: true, hostedInvoiceAvailable: true, invoicePdfAvailable: true, receiptAvailable: false };
const refund = { id: "refund-1", tenantId: "local-tenant", tenant: { id: "local-tenant", name: "Tenant", slug: "tenant" }, invoiceId: "local-invoice", invoiceNumber: "INV-1", subscriptionId: "local-sub", subscription: { id: "local-sub", status: "ACTIVE", packageName: "Pro", packageCode: "pro", packageVersion: 2 }, amountMinor: 500, currency: "USD", refundableRemainingMinor: 750, refundedAmountMinor: 0, reservedRefundAmountMinor: 500, reason: "customer_request", requestedBy: { id: "user-1", name: "Billing Admin", email: "billing@example.test" }, confirmedBy: null, requestedAt: "2026-07-20T00:00:00.000Z", confirmedAt: null, rejectedAt: null, rejectionReason: null, status: "REQUESTED", providerPending: false, failureCode: null, operationId: "operation-refund", previousRefundSummary: { successfulCount: 0, successfulAmountMinor: 0, pendingCount: 0, pendingAmountMinor: 0 } };
const plan = { id: "pkg-enterprise", name: "Enterprise", code: "enterprise", description: "Enterprise package", monthlyPrice: 20000, annualPrice: 200000, monthlyPriceCents: 20000, annualPriceCents: 200000, currency: "USD", trialDays: 0, entitlements: { employees: 5, documents: 10, storageMb: 100, queriesPerMonth: 1000 }, supportedModels: ["basic"], analyticsLevel: "advanced", retentionDays: 90, supportLevel: "priority" };
const preview = {
  id: "preview-1",
  currentPackage: { id: "pkg", name: "Pro", code: "pro", version: 2 },
  targetPackage: { id: "pkg-enterprise", name: "Enterprise", code: "enterprise", version: 4 },
  billingInterval: "monthly",
  currency: "USD",
  amountDueMinor: 5000,
  amountCreditMinor: 0,
  effectiveAt: "2026-07-20T00:00:00.000Z",
  nextBillingDate: "2026-08-01T00:00:00.000Z",
  entitlementImpact: [{ field: "employees", current: 1, target: 5, delta: 4 }],
  expiresAt: "2026-07-20T00:15:00.000Z",
  subscriptionRevision: 3,
};
const operation = {
  id: "operation-1",
  type: "PLAN_CHANGE",
  status: "PROVIDER_PENDING",
  requestedAt: "2026-07-20T00:00:00.000Z",
  confirmedAt: null,
  failedAt: null,
  retryCount: 0,
  failureCode: null,
  effectiveAt: null,
  cancellationType: null,
};

async function settle() { await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); }); }
function detailValue(container: HTMLElement, label: string): string | null {
  const dt = Array.from(container.querySelectorAll("dt")).find((candidate) => candidate.textContent === label);
  const dd = dt?.nextElementSibling;
  return dd instanceof HTMLElement ? dd.textContent : null;
}
const mounted: Array<{ container: HTMLElement; root: Root }> = [];
async function render(): Promise<{ container: HTMLElement; root: Root }> {
  const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container);
  mounted.push({ container, root }); await act(async () => { root.render(<CompanyBillingPage />); }); await settle(); return { container, root };
}

describe("CompanyBillingPage", () => {
  beforeEach(() => {
    vi.clearAllMocks(); localeState.locale = "en";
    (usePermissions as Mock).mockReturnValue({ status: "ready", can: vi.fn().mockReturnValue(true), refreshPermissions: vi.fn() });
    (getBillingSummary as Mock).mockResolvedValue({ success: true, data: summary });
    (listInvoices as Mock).mockResolvedValue({ success: true, data: { invoices: [invoice], pagination: { page: 1, pageSize: 10, totalRecords: 1, totalPages: 1 } } });
    (listRefundRequests as Mock).mockResolvedValue({ success: true, data: { refunds: [refund], pagination: { page: 1, pageSize: 10, totalRecords: 1, totalPages: 1 } } });
    (createRefundRequest as Mock).mockResolvedValue({ success: true, data: { refund, replayed: false } });
    (createRefundEligibilityPreview as Mock).mockResolvedValue({ success: true, data: { id: "eligibility-1", invoiceId: "local-invoice", invoiceAmountMinor: 1250, currency: "USD", periodElapsedPercent: 20, usage: [{ dimension: "queriesPerMonth", percent: 40 }], consumedValueMinor: 500, maximumEligibleRefundMinor: 750, reason: "VOLUNTARY_CANCELLATION", subscriptionImpact: "CANCEL_AND_MOVE_TO_FREE", expiresAt: "2026-07-20T00:15:00.000Z", reviewRequired: false, decisionReason: "USAGE_PROPORTIONAL" } });
    (listPublicBillingPackages as Mock).mockResolvedValue({ success: true, data: [plan] });
    (createSubscriptionChangePreview as Mock).mockResolvedValue({ success: true, data: preview });
    (requestSubscriptionChange as Mock).mockResolvedValue({ success: true, data: { operation, replayed: false } });
    (requestBillingCancellation as Mock).mockResolvedValue({ success: true, data: { operation: { ...operation, type: "CANCEL_PERIOD_END", cancellationType: "PERIOD_END" }, replayed: false } });
    (requestBillingReactivation as Mock).mockResolvedValue({ success: true, data: { operation: { ...operation, type: "REACTIVATE" }, replayed: false } });
    (getBillingOperation as Mock).mockResolvedValue({ success: true, data: operation });
  });
  afterEach(() => {
    for (const item of mounted.splice(0)) { act(() => item.root.unmount()); item.container.remove(); }
  });

  it("renders accessible loading states", () => {
    (getBillingSummary as Mock).mockReturnValueOnce(new Promise(() => undefined));
    (listInvoices as Mock).mockReturnValueOnce(new Promise(() => undefined));
    const container = document.createElement("div"); document.body.appendChild(container); const root = createRoot(container); mounted.push({ container, root });
    act(() => root.render(<CompanyBillingPage />));
    expect(container.querySelectorAll('[role="status"]').length).toBeGreaterThan(0);
  });

  it("renders a semantic invoice table, localized money, and safe local identifiers", async () => {
    const { container } = await render();
    expect(container.querySelector("table")).toBeTruthy(); expect(container.querySelectorAll("th")).toHaveLength(5);
    expect(container.textContent).toContain("$12.50"); expect(container.textContent).not.toMatch(/provider|cus_|sub_|in_/i);
  });

  it("submits a refund request from a local invoice without exposing provider identifiers", async () => {
    const { container } = await render();
    const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === "billingAdmin.requestRefund")!;
    await act(async () => { button.click(); });
    await settle();
    expect(container.querySelector("select")).toBeNull();
    expect(container.querySelectorAll('input[type="number"]').length).toBe(0);
    expect(container.textContent).not.toContain("billingAdmin.fullRefund");
    expect(container.textContent).not.toContain("billingAdmin.partialRefund");
    const submit = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("billingAdmin.refundRemainingAction"))!;
    await act(async () => { submit.click(); });
    await settle();
    expect(createRefundRequest).toHaveBeenCalledWith({ previewId: "eligibility-1", idempotencyKey: expect.any(String) });
    expect(container.textContent).not.toMatch(/cus_|sub_|re_/i);
  });

  it("keeps the move-to-Free transition wording for a currently paid subscription", async () => {
    const { container } = await render();
    const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === "billingAdmin.requestRefund")!;
    await act(async () => { button.click(); }); await settle();
    expect(container.textContent).toContain("billingAdmin.systemRefundWarning");
    expect(container.textContent).not.toContain("billingAdmin.refundFreeNote");
    const submit = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("billingAdmin.refundRemainingAction"))!;
    expect(submit?.textContent).toContain("$7.50");
    expect(container.textContent).toContain("$5.00");
    expect(container.textContent).toContain("20%");
  });

  it("shows plain refund wording without a move-to-Free claim when already on Free", async () => {
    (getBillingSummary as Mock).mockResolvedValueOnce({
      success: true,
      data: {
        ...summary,
        packageId: { ...summary.packageId, name: "Free", code: "free", monthlyPrice: 0, annualPrice: 0, monthlyPriceCents: 0, annualPriceCents: 0 },
        status: "ACTIVE",
        paymentState: "not_applicable",
        providerManaged: false,
        providerLinked: false,
        pendingOperation: null,
        canRequestRefund: true,
      },
    });
    const { container } = await render();
    const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === "billingAdmin.requestRefund")!;
    await act(async () => { button.click(); }); await settle();
    expect(container.textContent).toContain("billingAdmin.refundFreeNote");
    expect(container.textContent).not.toContain("billingAdmin.systemRefundWarning");
    expect(container.textContent).not.toContain("billingAdmin.refundRemainingAction");
    const submit = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent?.includes("billingAdmin.refundAction"))!;
    expect(submit?.textContent).toBe("billingAdmin.refundAction $7.50");
    expect(container.textContent).toContain("$5.00");
    expect(container.textContent).toContain("20%");
  });

  it("shows a non-actionable refund-pending label while a reservation consumes the invoice balance", async () => {
    (listInvoices as Mock).mockResolvedValueOnce({ success: true, data: { invoices: [{ ...invoice, reservedRefundAmountMinor: 500, remainingRefundableMinor: 750, canRequestRefund: true }], pagination: { page: 1, pageSize: 10, totalRecords: 1, totalPages: 1 } } });
    const { container } = await render();
    expect(container.textContent).toContain("billingAdmin.refundPendingAction");
    expect(container.textContent).toContain("billingAdmin.invoicePaidRefundPending");
    expect(container.textContent).not.toContain("billingAdmin.requestRefund");
    expect(Array.from(container.querySelectorAll("button")).some((candidate) => candidate.textContent === "billingAdmin.requestRefund")).toBe(false);
    const pending = Array.from(container.querySelectorAll('[role="status"]')).find((candidate) => candidate.textContent === "billingAdmin.refundPendingAction");
    expect(pending).toBeTruthy();
    expect(pending instanceof HTMLButtonElement).toBe(false);
  });

  it("shows no refundable balance when a paid invoice has no active reservation", async () => {
    (listInvoices as Mock).mockResolvedValueOnce({ success: true, data: { invoices: [{ ...invoice, retainedConsumedMinor: 1, refundedAmountMinor: 1249, remainingRefundableMinor: 0, settlementCompleted: true, canRequestRefund: false }], pagination: { page: 1, pageSize: 10, totalRecords: 1, totalPages: 1 } } });
    const { container } = await render();
    expect(container.textContent).toContain("billingAdmin.noRefundableBalance");
    expect(container.textContent).toContain("billingAdmin.settledUnderPolicy");
    expect(container.textContent).not.toContain("billingAdmin.requestRefund");
    expect(container.textContent).not.toContain("billingAdmin.refundPendingAction");
  });

  it("shows a zero remaining refundable balance on the refund card for a fully-reserved request", async () => {
    (listRefundRequests as Mock).mockResolvedValueOnce({ success: true, data: { refunds: [{ ...refund, amountMinor: 488, refundableRemainingMinor: 0, retainedConsumedMinor: 12, reservedRefundAmountMinor: 488, reasonCode: "SYSTEM_REMAINING_BALANCE_REFUND" }], pagination: { page: 1, pageSize: 10, totalRecords: 1, totalPages: 1 } } });
    const { container } = await render();
    const refundsPanel = container.querySelector('[data-guide-id="billing-refunds"]');
    expect(refundsPanel).toBeTruthy();
    const refundableRemainingValue = detailValue(refundsPanel as HTMLElement, "billingAdmin.refundableRemaining");
    expect(refundableRemainingValue).toBe("$0.00");
    expect(refundableRemainingValue).not.toBe("$0.12");
    const retainedConsumedValue = detailValue(refundsPanel as HTMLElement, "billingAdmin.retainedConsumed");
    expect(retainedConsumedValue).toBe("$0.12");
  });

  it("keeps the request-refund action for a paid invoice with remaining balance", async () => {
    const { container } = await render();
    const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === "billingAdmin.requestRefund");
    expect(button).toBeTruthy();
    expect(container.textContent).not.toContain("billingAdmin.noRefundableBalance");
    expect(container.textContent).not.toContain("billingAdmin.refundPendingAction");
  });

  it("shows denied state for direct access without billing:read", async () => {
    (usePermissions as Mock).mockReturnValue({ status: "ready", can: vi.fn((permission: string) => permission !== Permission.BILLING_READ), refreshPermissions: vi.fn() });
    const { container } = await render(); expect(container.textContent).toContain("permissions.deniedTitle"); expect(getBillingSummary).not.toHaveBeenCalled();
  });

  it("allows billing:read while hiding portal actions without billing:manage", async () => {
    (usePermissions as Mock).mockReturnValue({ status: "ready", can: vi.fn((permission: string) => permission === Permission.BILLING_READ), refreshPermissions: vi.fn() });
    const { container } = await render();
    expect(container.textContent).toContain("billingAdmin.invoices");
    expect(container.textContent).not.toContain("billingAdmin.updatePayment");
    expect(container.textContent).not.toContain("billingAdmin.openPortal");
    expect(container.textContent).not.toContain("billingAdmin.changePlan");
  });

  it("shows the localized checkout entry for a local free trial", async () => {
    (getBillingSummary as Mock).mockResolvedValueOnce({
      success: true,
      data: {
        ...summary,
        packageId: {
          ...summary.packageId,
          name: "Free",
          code: "free",
          monthlyPrice: 0,
          annualPrice: 0,
          monthlyPriceCents: 0,
          annualPriceCents: 0,
        },
        status: "TRIALING",
        paymentState: "pending",
        providerManaged: false,
        providerLinked: false,
        canChangePlan: false,
        canOpenPortal: false,
        canUpdatePaymentMethod: false,
      },
    });
    const { container } = await render();
    const choosePlan = Array.from(container.querySelectorAll("a")).find((link) => link.textContent === "billingAdmin.choosePlan");
    expect(choosePlan).toBeTruthy();
    expect(choosePlan?.getAttribute("href")).toBe("/checkout");
    expect(container.textContent).toContain("billingAdmin.freeTrialDescription");
  });

  it.each([
    ["TRIALING", "pending"],
    ["TRIALING", "not_applicable"],
    ["ACTIVE", "not_applicable"],
    ["ACTIVE", "pending"],
  ] as const)("shows checkout entry for provider-less Free %s + %s", async (status, paymentState) => {
    (getBillingSummary as Mock).mockResolvedValueOnce({
      success: true,
      data: {
        ...summary,
        packageId: { ...summary.packageId, name: "Free", code: "free", monthlyPrice: 0, annualPrice: 0, monthlyPriceCents: 0, annualPriceCents: 0 },
        status,
        paymentState,
        transitionState: "ACTIVE",
        providerManaged: false,
        providerLinked: false,
        pendingOperation: null,
      },
    });
    const { container } = await render();
    const choosePlan = Array.from(container.querySelectorAll("a")).find((link) => link.textContent === "billingAdmin.choosePlan");
    expect(choosePlan?.getAttribute("href")).toBe("/checkout");
  });

  it("shows checkout entry for Free plan with a provider customer but no subscription", async () => {
    (getBillingSummary as Mock).mockResolvedValueOnce({
      success: true,
      data: {
        ...summary,
        packageId: { ...summary.packageId, name: "Free", code: "free", monthlyPrice: 0, annualPrice: 0, monthlyPriceCents: 0, annualPriceCents: 0 },
        status: "ACTIVE",
        paymentState: "pending",
        transitionState: "ACTIVE",
        providerManaged: true,
        providerLinked: false,
        pendingOperation: null,
      },
    });
    const { container } = await render();
    const choosePlan = Array.from(container.querySelectorAll("a")).find((link) => link.textContent === "billingAdmin.choosePlan");
    expect(choosePlan?.getAttribute("href")).toBe("/checkout");
  });

  it("shows an active provider-less Free plan without paid billing controls", async () => {
    (getBillingSummary as Mock).mockResolvedValueOnce({
      success: true,
      data: {
        ...summary,
        packageId: { ...summary.packageId, name: "Free", code: "free", monthlyPrice: 0, annualPrice: 0, monthlyPriceCents: 0, annualPriceCents: 0 },
        status: "ACTIVE", paymentState: "not_applicable", billingInterval: null,
        periodStart: null, periodEnd: null, currentPeriodStart: null, currentPeriodEnd: null,
        providerManaged: false, providerLinked: false, canOpenPortal: false, canUpdatePaymentMethod: false,
        canChangePlan: false, canCancel: false, canReactivate: false, canRequestRefund: false,
      },
    });
    (listInvoices as Mock).mockResolvedValueOnce({ success: true, data: { invoices: [{ ...invoice, retainedConsumedMinor: 1, refundedAmountMinor: 1249, remainingRefundableMinor: 0, settlementCompleted: true, canRequestRefund: false }], pagination: { page: 1, pageSize: 10, totalRecords: 1, totalPages: 1 } } });
    const { container } = await render();
    expect(container.textContent).toContain("Free");
    expect(container.textContent).toContain("billingAdmin.status.not_applicable");
    expect(container.textContent).not.toContain("billingAdmin.status.paid");
    const choosePlan = Array.from(container.querySelectorAll("a")).find((link) => link.textContent === "billingAdmin.choosePlan");
    expect(choosePlan?.getAttribute("href")).toBe("/checkout");
    expect(container.textContent).toContain("billingAdmin.freePlanDescription");
    expect(container.textContent).not.toContain("billingAdmin.updatePayment");
    expect(container.textContent).not.toContain("billingAdmin.cancelImmediately");
    expect(container.textContent).not.toContain("billingAdmin.cancelAtPeriodEnd");
    expect(container.textContent).not.toContain("billingAdmin.requestRefund");
  });

  it("keeps checkout entry hidden for a provider-linked paid subscription", async () => {
    const { container } = await render();
    expect(Array.from(container.querySelectorAll("a")).some((link) => link.textContent === "billingAdmin.choosePlan")).toBe(false);
  });

  it.each([
    { label: "provider-linked Free record", patch: { providerManaged: true, providerLinked: true } },
    { label: "paid ACTIVE package", patch: { packageId: { ...summary.packageId, name: "Pro", code: "pro", monthlyPrice: 10, annualPrice: 100 }, status: "ACTIVE", paymentState: "paid" } },
    { label: "canceled Free record", patch: { status: "CANCELED", paymentState: "not_applicable" } },
    { label: "failed Free payment state", patch: { status: "ACTIVE", paymentState: "failed" } },
    { label: "conflicting billing operation", patch: { pendingOperation: { id: "operation", type: "PLAN_CHANGE", status: "REQUESTED", requestedAt: "2026-08-01T00:00:00.000Z" } } },
  ])("keeps checkout entry hidden for $label", async ({ patch }) => {
    (getBillingSummary as Mock).mockResolvedValueOnce({
      success: true,
      data: {
        ...summary,
        packageId: { ...summary.packageId, name: "Free", code: "free", monthlyPrice: 0, annualPrice: 0, monthlyPriceCents: 0, annualPriceCents: 0 },
        status: "ACTIVE",
        paymentState: "not_applicable",
        transitionState: "ACTIVE",
        providerManaged: false,
        providerLinked: false,
        pendingOperation: null,
        ...patch,
      },
    });
    const { container } = await render();
    expect(Array.from(container.querySelectorAll("a")).some((link) => link.textContent === "billingAdmin.choosePlan")).toBe(false);
  });

  it.each(["TRANSITION_PENDING", "TRANSITION_RETRYABLE", "REPAIR_REQUIRED"] as const)(
    "keeps checkout entry hidden while the Free transition state is %s",
    async (transitionState) => {
      (getBillingSummary as Mock).mockResolvedValueOnce({
        success: true,
        data: {
          ...summary,
          packageId: { ...summary.packageId, name: "Free", code: "free", monthlyPrice: 0, annualPrice: 0, monthlyPriceCents: 0, annualPriceCents: 0 },
          status: "ACTIVE",
          paymentState: "not_applicable",
          transitionState,
          providerManaged: false,
          providerLinked: false,
          pendingOperation: null,
        },
      });
      const { container } = await render();
      expect(Array.from(container.querySelectorAll("a")).some((link) => link.textContent === "billingAdmin.choosePlan")).toBe(false);
    },
  );

  it("does not claim the account moved to Free until transition completion is authoritative", async () => {
    const systemRefund = { ...refund, reasonCode: "SYSTEM_REMAINING_BALANCE_REFUND", retainedConsumedMinor: 1, status: "SUCCEEDED" };
    (listRefundRequests as Mock).mockResolvedValueOnce({ success: true, data: { refunds: [{ ...systemRefund, localTransitionStatus: "RETRY_PENDING", subscriptionImpactStatus: "RETRY_PENDING" }], pagination: { page: 1, pageSize: 10, totalRecords: 1, totalPages: 1 } } });
    const { container } = await render();
    expect(container.textContent).toContain("billingAdmin.refundMessage.system_syncing");
    expect(container.textContent).not.toContain("billingAdmin.refundMessage.system_completed");
  });

  it("shows a fail-closed synchronization notice and no paid controls while Free activation is retrying", async () => {
    (getBillingSummary as Mock).mockResolvedValueOnce({
      success: true,
      data: {
        ...summary,
        status: "CANCELED",
        transitionState: "TRANSITION_RETRYABLE",
        canOpenPortal: false,
        canUpdatePaymentMethod: false,
        canChangePlan: false,
        canCancel: false,
        canReactivate: false,
        canRequestRefund: false,
      },
    });
    const { container } = await render();
    expect(container.textContent).toContain("billingAdmin.freeTransitionRetryable");
    expect(container.textContent).not.toContain("billingAdmin.updatePayment");
    expect(container.textContent).not.toContain("billingAdmin.cancelImmediately");
    expect(container.textContent).not.toContain("billingAdmin.requestRefund");
  });

  it("shows completed and intervention messages only for their authoritative impact states", async () => {
    const systemRefund = { ...refund, reasonCode: "SYSTEM_REMAINING_BALANCE_REFUND", retainedConsumedMinor: 1, status: "SUCCEEDED" };
    (listRefundRequests as Mock).mockResolvedValueOnce({ success: true, data: { refunds: [{ ...systemRefund, localTransitionStatus: "SUCCEEDED", subscriptionImpactStatus: "SUCCEEDED" }, { ...systemRefund, id: "refund-2", localTransitionStatus: "FAILED", subscriptionImpactStatus: "FAILED" }], pagination: { page: 1, pageSize: 10, totalRecords: 2, totalPages: 1 } } });
    const { container } = await render();
    expect(container.textContent).toContain("billingAdmin.refundMessage.system_completed");
    expect(container.textContent).toContain("billingAdmin.refundMessage.system_failed");
    expect(container.textContent).not.toContain("billingAdmin.refundMessage.succeeded_active");
  });

  it("renders summary/invoice errors with keyboard-accessible retry controls", async () => {
    (getBillingSummary as Mock).mockRejectedValue(new Error("network")); (listInvoices as Mock).mockRejectedValue(new Error("network"));
    const { container } = await render(); expect(container.querySelectorAll('[role="alert"]').length).toBeGreaterThanOrEqual(2);
    const retry = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "common.retry"); expect(retry).toBeTruthy();
  });

  it("renders the empty invoice state and Arabic RTL layout", async () => {
    localeState.locale = "ar"; (listInvoices as Mock).mockResolvedValue({ success: true, data: { invoices: [], pagination: { page: 1, pageSize: 10, totalRecords: 0, totalPages: 0 } } });
    const { container } = await render(); expect(container.querySelector('[dir="rtl"]')).toBeTruthy(); expect(container.textContent).toContain("billingAdmin.noInvoices");
  });

  it("launches the explicit payment-method flow once on rapid duplicate clicks and recovers on failure", async () => {
    (createBillingPortalSession as Mock).mockRejectedValue(new Error("provider down"));
    const { container } = await render(); const button = Array.from(container.querySelectorAll("button")).find((candidate) => candidate.textContent === "billingAdmin.updatePayment")!;
    await act(async () => { button.click(); button.click(); }); await settle();
    expect(createBillingPortalSession).toHaveBeenCalledTimes(1); expect(createBillingPortalSession).toHaveBeenCalledWith("payment_method_update");
    expect(container.querySelector('[role="alert"]')).toBeTruthy(); expect(button.disabled).toBe(false);
  });

  it("renders change-plan actions and confirms a preview-backed mutation", async () => {
    const { container } = await render();
    const changePlan = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "billingAdmin.changePlan")!;
    await act(async () => { changePlan.click(); });
    await settle();
    const previewButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "billingAdmin.previewChange")!;
    await act(async () => { previewButton.click(); });
    await settle();
    expect(createSubscriptionChangePreview).toHaveBeenCalledWith({ targetPackageId: "pkg-enterprise", billingInterval: "monthly" });
    const confirmButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "billingAdmin.confirmChange")!;
    await act(async () => { confirmButton.click(); });
    await settle();
    expect(requestSubscriptionChange).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("billingAdmin.pendingOperation");
  });

  it("reuses the same idempotency key when a preview confirmation is retried", async () => {
    (requestSubscriptionChange as Mock)
      .mockRejectedValueOnce(new Error("timeout"))
      .mockResolvedValueOnce({ success: true, data: { operation, replayed: false } });
    const { container } = await render();
    const changePlan = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "billingAdmin.changePlan")!;
    await act(async () => { changePlan.click(); });
    await settle();
    const previewButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "billingAdmin.previewChange")!;
    await act(async () => { previewButton.click(); });
    await settle();
    const confirmButton = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "billingAdmin.confirmChange")!;
    await act(async () => { confirmButton.click(); });
    await settle();
    await act(async () => { confirmButton.click(); });
    await settle();
    expect(requestSubscriptionChange).toHaveBeenCalledTimes(2);
    expect((requestSubscriptionChange as Mock).mock.calls[0][0].idempotencyKey).toBe((requestSubscriptionChange as Mock).mock.calls[1][0].idempotencyKey);
  });

  it("opens cancellation confirmation and requests a period-end cancellation", async () => {
    const { container } = await render();
    const action = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "billingAdmin.cancelAtPeriodEnd")!;
    await act(async () => { action.click(); });
    await settle();
    const confirm = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "billingAdmin.confirmCancellation")!;
    await act(async () => { confirm.click(); });
    await settle();
    expect(requestBillingCancellation).toHaveBeenCalledWith(expect.objectContaining({ cancellationType: "PERIOD_END" }));
  });

  it("opens a blank popup synchronously before resolving invoice links", async () => {
    const fakePopup = { opener: {}, location: { href: "", replace: vi.fn() }, document: { write: vi.fn(), close: vi.fn() }, addEventListener: vi.fn(), close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(fakePopup as unknown as Window);
    let resolveLinks!: (value: { success: boolean; data: { hostedInvoiceUrl: string | null; invoicePdfUrl: string | null; receiptUrl: string | null } }) => void;
    (getInvoiceLinks as Mock).mockReturnValue(new Promise((resolve) => { resolveLinks = resolve; }));
    (getInvoicePdfBlobUrl as Mock).mockResolvedValue("blob:invoice-pdf");
    const { container } = await render(); expect(getInvoiceLinks).not.toHaveBeenCalled();
    const action = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("billingAdmin.openInvoice"))!;
    act(() => { action.click(); });
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(fakePopup.opener).toBeNull();
    expect(fakePopup.document.write).toHaveBeenCalledWith(expect.stringContaining("billingAdmin.popupLoadingTitle"));
    expect(fakePopup.document.close).toHaveBeenCalled();
    expect(getInvoiceLinks).toHaveBeenCalledWith("local-invoice");
    resolveLinks({ success: true, data: { hostedInvoiceUrl: null, invoicePdfUrl: "https://invoice.stripe.com/i/safe", receiptUrl: null } });
    await settle();
    expect(open).toHaveBeenCalledTimes(1);
  });

  it("opens the popup first, then navigates it to the fetched PDF blob URL", async () => {
    const fakePopup = { opener: {}, location: { href: "", replace: vi.fn() }, document: { write: vi.fn(), close: vi.fn() }, addEventListener: vi.fn(), close: vi.fn() };
    const open = vi.spyOn(window, "open").mockReturnValue(fakePopup as unknown as Window);
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    (getInvoiceLinks as Mock).mockResolvedValue({ success: true, data: { hostedInvoiceUrl: null, invoicePdfUrl: "https://invoice.stripe.com/i/safe", receiptUrl: null } });
    (getInvoicePdfBlobUrl as Mock).mockResolvedValue("blob:invoice-pdf");
    const { container } = await render();
    const action = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("billingAdmin.openInvoice"))!;
    await act(async () => { action.click(); }); await settle();
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("", "_blank");
    expect(fakePopup.opener).toBeNull();
    expect(fakePopup.document.write).toHaveBeenCalledWith(expect.stringContaining("billingAdmin.popupLoadingTitle"));
    expect(getInvoicePdfBlobUrl).toHaveBeenCalledWith("local-invoice");
    expect(fakePopup.location.replace).toHaveBeenCalledWith("blob:invoice-pdf");
    expect(open).not.toHaveBeenCalledWith("blob:invoice-pdf", "_blank", expect.anything());
    expect(revoke).not.toHaveBeenCalled();
    expect(document.querySelector("a[download]")).toBeNull();
  });

  it("revokes the blob URL only after the popup finishes loading the PDF", async () => {
    const listeners = new Map<string, () => void>();
    const fakePopup = { opener: {}, location: { href: "", replace: vi.fn() }, document: { write: vi.fn(), close: vi.fn() }, addEventListener: vi.fn((type: string, cb: () => void) => { listeners.set(type, cb); }), close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(fakePopup as unknown as Window);
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    (getInvoiceLinks as Mock).mockResolvedValue({ success: true, data: { hostedInvoiceUrl: null, invoicePdfUrl: "https://invoice.stripe.com/i/safe", receiptUrl: null } });
    (getInvoicePdfBlobUrl as Mock).mockResolvedValue("blob:invoice-pdf");
    const { container } = await render();
    const action = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("billingAdmin.openInvoice"))!;
    await act(async () => { action.click(); }); await settle();
    expect(fakePopup.location.replace).toHaveBeenCalledWith("blob:invoice-pdf");
    expect(fakePopup.addEventListener).toHaveBeenCalledWith("load", expect.any(Function), { once: true });
    expect(revoke).not.toHaveBeenCalled();
    act(() => listeners.get("load")?.());
    expect(revoke).toHaveBeenCalledWith("blob:invoice-pdf");
  });

  it("revokes the blob URL without navigating when the popup is closed during retrieval", async () => {
    const fakePopup = { opener: {}, location: { href: "", replace: vi.fn() }, document: { write: vi.fn(), close: vi.fn() }, addEventListener: vi.fn(), close: vi.fn(), closed: true };
    vi.spyOn(window, "open").mockReturnValue(fakePopup as unknown as Window);
    const revoke = vi.spyOn(URL, "revokeObjectURL");
    (getInvoiceLinks as Mock).mockResolvedValue({ success: true, data: { hostedInvoiceUrl: null, invoicePdfUrl: "https://invoice.stripe.com/i/safe", receiptUrl: null } });
    (getInvoicePdfBlobUrl as Mock).mockResolvedValue("blob:invoice-pdf");
    const { container } = await render();
    const action = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("billingAdmin.openInvoice"))!;
    await act(async () => { action.click(); }); await settle();
    expect(fakePopup.location.replace).not.toHaveBeenCalled();
    expect(revoke).toHaveBeenCalledWith("blob:invoice-pdf");
  });

  it("navigates the opened popup to the hosted invoice page when no PDF is available", async () => {
    const fakePopup = { opener: {}, location: { href: "", replace: vi.fn() }, document: { write: vi.fn(), close: vi.fn() }, addEventListener: vi.fn(), close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(fakePopup as unknown as Window);
    (getInvoiceLinks as Mock).mockResolvedValue({ success: true, data: { hostedInvoiceUrl: "https://invoice.stripe.com/i/hosted", invoicePdfUrl: null, receiptUrl: null } });
    const { container } = await render();
    const action = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("billingAdmin.openInvoice"))!;
    await act(async () => { action.click(); }); await settle();
    expect(fakePopup.document.write).toHaveBeenCalledWith(expect.stringContaining("billingAdmin.popupLoadingTitle"));
    expect(getInvoicePdfBlobUrl).not.toHaveBeenCalled();
    expect(fakePopup.location.replace).toHaveBeenCalledWith("https://invoice.stripe.com/i/hosted");
  });

  it("navigates the opened popup to the receipt when only a receipt is available", async () => {
    const fakePopup = { opener: {}, location: { href: "", replace: vi.fn() }, document: { write: vi.fn(), close: vi.fn() }, addEventListener: vi.fn(), close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(fakePopup as unknown as Window);
    (getInvoiceLinks as Mock).mockResolvedValue({ success: true, data: { hostedInvoiceUrl: null, invoicePdfUrl: null, receiptUrl: "https://receipt.stripe.com/r/1" } });
    const { container } = await render();
    const action = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("billingAdmin.openInvoice"))!;
    await act(async () => { action.click(); }); await settle();
    expect(fakePopup.document.write).toHaveBeenCalledWith(expect.stringContaining("billingAdmin.popupLoadingTitle"));
    expect(getInvoicePdfBlobUrl).not.toHaveBeenCalled();
    expect(fakePopup.location.replace).toHaveBeenCalledWith("https://receipt.stripe.com/r/1");
  });

  it("shows an error state in the popup and announces failure when no link is available", async () => {
    const fakePopup = { opener: {}, location: { href: "", replace: vi.fn() }, document: { write: vi.fn(), close: vi.fn() }, addEventListener: vi.fn(), close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(fakePopup as unknown as Window);
    (getInvoiceLinks as Mock).mockResolvedValue({ success: true, data: { hostedInvoiceUrl: null, invoicePdfUrl: null, receiptUrl: null } });
    const { container } = await render();
    const action = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("billingAdmin.openInvoice"))!;
    await act(async () => { action.click(); }); await settle();
    expect(fakePopup.close).not.toHaveBeenCalled();
    expect(fakePopup.document.write).toHaveBeenCalledWith(expect.stringContaining("billingAdmin.popupErrorTitle"));
    expect(container.textContent).toContain("billingAdmin.loadError");
  });

  it("shows an error state in the same popup and announces failure when retrieval fails", async () => {
    const fakePopup = { opener: {}, location: { href: "", replace: vi.fn() }, document: { write: vi.fn(), close: vi.fn() }, addEventListener: vi.fn(), close: vi.fn() };
    vi.spyOn(window, "open").mockReturnValue(fakePopup as unknown as Window);
    (getInvoiceLinks as Mock).mockResolvedValue({ success: true, data: { hostedInvoiceUrl: null, invoicePdfUrl: "https://invoice.stripe.com/i/safe", receiptUrl: null } });
    (getInvoicePdfBlobUrl as Mock).mockRejectedValue(new Error("down"));
    const { container } = await render();
    const action = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("billingAdmin.openInvoice"))!;
    await act(async () => { action.click(); }); await settle();
    expect(fakePopup.close).not.toHaveBeenCalled();
    expect(fakePopup.document.write).toHaveBeenCalledWith(expect.stringContaining("billingAdmin.popupErrorTitle"));
    expect(container.textContent).toContain("billingAdmin.loadError");
  });

  it("surfaces a popup-blocked error and skips retrieval when window.open returns null", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null);
    const { container } = await render();
    const action = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("billingAdmin.openInvoice"))!;
    await act(async () => { action.click(); }); await settle();
    expect(getInvoiceLinks).not.toHaveBeenCalled();
    expect(getInvoicePdfBlobUrl).not.toHaveBeenCalled();
    expect(container.textContent).toContain("billingAdmin.popupBlocked");
    expect(open).toHaveBeenCalledTimes(1);
  });
});
