// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { CompanyBillingPage } from "../CompanyBillingPage";
import { Permission } from "@/types/api/permissions.types";

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "ar", t: (key: string) => key }));
vi.mock("@/providers/i18n-provider", () => ({ useI18n: () => ({ locale: localeState.locale, dir: localeState.locale === "ar" ? "rtl" : "ltr", t: localeState.t }) }));
vi.mock("@/providers/permission-provider", () => ({ usePermissions: vi.fn() }));
vi.mock("@/services/billing.service", () => ({
  getBillingSummary: vi.fn(),
  listInvoices: vi.fn(),
  createBillingPortalSession: vi.fn(),
  getInvoiceLinks: vi.fn(),
  listPublicBillingPackages: vi.fn(),
  createSubscriptionChangePreview: vi.fn(),
  requestSubscriptionChange: vi.fn(),
  requestBillingCancellation: vi.fn(),
  requestBillingReactivation: vi.fn(),
  getBillingOperation: vi.fn(),
}));

import { usePermissions } from "@/providers/permission-provider";
import { createBillingPortalSession, createSubscriptionChangePreview, getBillingOperation, getBillingSummary, getInvoiceLinks, listInvoices, listPublicBillingPackages, requestBillingCancellation, requestBillingReactivation, requestSubscriptionChange } from "@/services/billing.service";

const summary = {
  id: "local-sub", tenantId: "local-tenant", packageId: { _id: "pkg", name: "Pro", code: "pro", version: 2, monthlyPrice: 10, annualPrice: 100, monthlyPriceCents: 1000, annualPriceCents: 10000, currency: "USD", entitlements: { employees: 1, admins: 1, documents: 1, storageMb: 1, fileSizeMb: 1, queriesPerMonth: 1, tokensPerMonth: 1, ocrPagesPerMonth: 1 } },
  packageVersion: 2, billingInterval: "monthly", status: "ACTIVE", paymentState: "paid", periodStart: "2026-07-01T00:00:00.000Z", periodEnd: "2026-08-01T00:00:00.000Z", currentPeriodStart: "2026-07-01T00:00:00.000Z", currentPeriodEnd: "2026-08-01T00:00:00.000Z", trialStart: null, trialEnd: null, cancelAtPeriodEnd: false, cancellationEffectiveAt: null,
  providerManaged: true, providerLinked: true, pendingOperation: null, canOpenPortal: true, canUpdatePaymentMethod: true, canViewInvoices: true, canChangePlan: true, canCancel: true, canReactivate: false, canRequestRefund: false,
  lifecycle: { eligible: true, inGracePeriod: false, accessEndsAt: null, reason: "ACTIVE" }, invoiceSummary: { total: 1, open: 0, paid: 1, pastDue: 0 },
};
const invoice = { id: "local-invoice", invoiceNumber: "INV-1", status: "paid", currency: "USD", amountDueMinor: 1250, amountPaidMinor: 1250, amountRemainingMinor: 0, subtotalMinor: 1250, taxMinor: null, createdAt: "2026-07-02T00:00:00.000Z", dueAt: null, paidAt: "2026-07-02T00:00:00.000Z", periodStart: null, periodEnd: null, hostedInvoiceAvailable: true, invoicePdfAvailable: true, receiptAvailable: false };
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

  it("retrieves secure links by local invoice ID only when the action is used", async () => {
    const open = vi.spyOn(window, "open").mockReturnValue(null); (getInvoiceLinks as Mock).mockResolvedValue({ success: true, data: { hostedInvoiceUrl: null, invoicePdfUrl: "https://invoice.stripe.com/i/safe", receiptUrl: null } });
    const { container } = await render(); expect(getInvoiceLinks).not.toHaveBeenCalled();
    const action = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("billingAdmin.openInvoice"))!;
    await act(async () => { action.click(); }); await settle(); expect(getInvoiceLinks).toHaveBeenCalledWith("local-invoice"); expect(open).toHaveBeenCalledWith("https://invoice.stripe.com/i/safe", "_blank", "noopener,noreferrer");
  });
});
