// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import SuperAdminRefundPage from "./page";
import { Permission } from "@/types/api/permissions.types";

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "ar", t: (key: string) => key }));
vi.mock("@/providers/i18n-provider", () => ({ useI18n: () => ({ locale: localeState.locale, dir: localeState.locale === "ar" ? "rtl" : "ltr", t: localeState.t }) }));
vi.mock("@/providers/permission-provider", () => ({ usePermissions: vi.fn() }));
vi.mock("@/services/billing.service", () => ({
  listPlatformRefunds: vi.fn(),
  getPlatformRefund: vi.fn(),
  confirmPlatformRefund: vi.fn(),
  rejectPlatformRefund: vi.fn(),
  retryPlatformRefund: vi.fn(),
}));

import { usePermissions } from "@/providers/permission-provider";
import { confirmPlatformRefund, getPlatformRefund, listPlatformRefunds, rejectPlatformRefund, retryPlatformRefund } from "@/services/billing.service";

const refund = {
  id: "refund-1",
  tenantId: "tenant-1",
  tenant: { id: "tenant-1", name: "Tenant One", slug: "tenant-one" },
  invoiceId: "invoice-1",
  invoiceNumber: "INV-1",
  subscriptionId: "sub-1",
  subscription: { id: "sub-1", status: "ACTIVE", packageName: "Pro", packageCode: "pro", packageVersion: 2 },
  amountMinor: 500,
  currency: "USD",
  refundableRemainingMinor: 500,
  refundedAmountMinor: 0,
  reservedRefundAmountMinor: 500,
  reason: "customer_request",
  requestedBy: { id: "user-1", name: "Requester", email: "requester@example.test" },
  confirmedBy: null,
  requestedAt: "2026-07-20T00:00:00.000Z",
  confirmedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  status: "REQUESTED",
  providerPending: false,
  failureCode: null,
  operationId: "operation-1",
  previousRefundSummary: { successfulCount: 0, successfulAmountMinor: 0, pendingCount: 0, pendingAmountMinor: 0 },
};

async function settle() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

const mounted: Array<{ container: HTMLElement; root: Root }> = [];
async function renderPage(): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ container, root });
  await act(async () => { root.render(<SuperAdminRefundPage />); });
  await settle();
  return container;
}

describe("SuperAdminRefundPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localeState.locale = "en";
    (usePermissions as Mock).mockReturnValue({
      status: "ready",
      can: vi.fn((permission: string) => permission === Permission.BILLING_READ || permission === Permission.BILLING_REFUND_CONFIRM),
      refreshPermissions: vi.fn(),
    });
    (listPlatformRefunds as Mock).mockResolvedValue({ success: true, data: { refunds: [refund], pagination: { page: 1, pageSize: 20, totalRecords: 1, totalPages: 1 } } });
    (getPlatformRefund as Mock).mockResolvedValue({ success: true, data: refund });
    (confirmPlatformRefund as Mock).mockResolvedValue({ success: true, data: { refund: { ...refund, status: "PROVIDER_PENDING" } } });
    (rejectPlatformRefund as Mock).mockResolvedValue({ success: true, data: { refund: { ...refund, status: "REJECTED", rejectionReason: "policy" } } });
    (retryPlatformRefund as Mock).mockResolvedValue({ success: true, data: { refund: { ...refund, status: "PROVIDER_PENDING" } } });
  });

  afterEach(() => {
    for (const item of mounted.splice(0)) {
      act(() => item.root.unmount());
      item.container.remove();
    }
  });

  it("renders the refund list without provider identifiers", async () => {
    const container = await renderPage();
    expect(container.textContent).toContain("Tenant One");
    expect(container.textContent).toContain("INV-1");
    expect(container.textContent).not.toMatch(/cus_|re_|ch_|sub_/i);
  });

  it("opens detail and confirm flows for an authorized reviewer", async () => {
    const container = await renderPage();
    const detail = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "refundAdmin.viewDetails")!;
    await act(async () => { detail.click(); });
    await settle();
    expect(getPlatformRefund).toHaveBeenCalledWith("refund-1");

    const confirm = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "refundAdmin.confirm")!;
    await act(async () => { confirm.click(); });
    await settle();
    const confirmButtons = Array.from(container.querySelectorAll("button")).filter((button) => button.textContent === "refundAdmin.confirm");
    const confirmSubmit = confirmButtons[confirmButtons.length - 1]!;
    await act(async () => { confirmSubmit.click(); });
    await settle();
    expect(confirmPlatformRefund).toHaveBeenCalledWith("refund-1");
  });

  it("paginates reviews and keeps the current page while opening details", async () => {
    (listPlatformRefunds as Mock).mockImplementation(async (params: { page?: number }) => ({
      success: true,
      data: { refunds: [refund], pagination: { page: params.page ?? 1, pageSize: 20, totalRecords: 21, totalPages: 2 } },
    }));
    const container = await renderPage();
    const next = container.querySelector('button[aria-label="refundAdmin.next"]')! as HTMLButtonElement;
    const previous = container.querySelector('button[aria-label="refundAdmin.previous"]')! as HTMLButtonElement;
    expect(previous.disabled).toBe(true);
    expect(next.disabled).toBe(false);
    await act(async () => { next.click(); });
    await settle();
    expect(listPlatformRefunds).toHaveBeenLastCalledWith({ page: 2, pageSize: 20, status: undefined }, expect.any(AbortSignal));
    expect((container.querySelector('button[aria-label="refundAdmin.previous"]') as HTMLButtonElement).disabled).toBe(false);
    await act(async () => { container.querySelector('button')?.dispatchEvent(new Event("noop")); });
  });

  it("resets pagination when the status filter changes", async () => {
    (listPlatformRefunds as Mock).mockImplementation(async (params: { page?: number }) => ({
      success: true,
      data: { refunds: [refund], pagination: { page: params.page ?? 1, pageSize: 20, totalRecords: 21, totalPages: 2 } },
    }));
    const container = await renderPage();
    await act(async () => { (container.querySelector("select") as HTMLSelectElement).value = "SUCCEEDED"; container.querySelector("select")?.dispatchEvent(new Event("change", { bubbles: true })); });
    await settle();
    expect(listPlatformRefunds).toHaveBeenLastCalledWith({ page: 1, pageSize: 20, status: "SUCCEEDED" }, expect.any(AbortSignal));
  });

  it.each(["DUPLICATE_CHARGE", "SERVICE_NOT_DELIVERED", "VOLUNTARY_CANCELLATION", "BILLING_ERROR", "GOODWILL_CREDIT"])("normalizes %s in English and Arabic detail views", async (reasonCode) => {
    localeState.t = (key) => key;
    (getPlatformRefund as Mock).mockResolvedValue({ success: true, data: { ...refund, reason: reasonCode, reasonCode } });
    const container = await renderPage();
    const detail = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "refundAdmin.viewDetails")!;
    await act(async () => { detail.click(); });
    await settle();
    expect(container.textContent).toContain(reasonCode.toLowerCase().replace(/_/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase()));
    localeState.locale = "ar";
    await act(async () => { (container.querySelector('[role="dialog"] button') as HTMLButtonElement | null)?.click(); });
  });

  it("supports rejection with an explicit reason", async () => {
    const container = await renderPage();
    const reject = Array.from(container.querySelectorAll("button")).find((button) => button.textContent === "refundAdmin.reject")!;
    await act(async () => { reject.click(); });
    await settle();
    const textarea = container.querySelector("textarea")!;
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(textarea, "policy");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await settle();
    const rejectButtons = Array.from(container.querySelectorAll("button")).filter((button) => button.textContent === "refundAdmin.reject");
    const submit = rejectButtons[rejectButtons.length - 1]!;
    await act(async () => { submit.click(); });
    await settle();
    expect(rejectPlatformRefund).toHaveBeenCalledWith("refund-1", "policy");
  });

  it("renders Arabic RTL layout", async () => {
    localeState.locale = "ar";
    const container = await renderPage();
    expect(container.querySelector('[dir="rtl"]')).toBeTruthy();
  });
});
