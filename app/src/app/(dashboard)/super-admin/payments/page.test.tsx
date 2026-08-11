// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import PaymentDiagnosticsPage from "./page";
import { Permission } from "@/types/api/permissions.types";

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "ar", t: (key: string) => key }));
vi.mock("@/providers/i18n-provider", async () => {
  const { t: translate, tPlural: pluralize } = await import("@/lib/i18n/i18n.utils");
  const dictionaries = (await import("@/lib/i18n/translations")).default;
  return {
    useI18n: () => ({
      locale: localeState.locale,
      dir: localeState.locale === "ar" ? "rtl" : "ltr",
      t: (key: string, params?: Record<string, string>) => translate(dictionaries[localeState.locale], key, params),
      tPlural: (key: string, count: number) => pluralize(dictionaries[localeState.locale], localeState.locale, key, count),
      setLocale: vi.fn(),
    }),
    useIntlLocale: () => "en",
  };
});
vi.mock("@/lib/i18n/code-label", () => ({ codeLabel: (_t: unknown, _namespace: string, code: string) => code.replaceAll("_", " "), humanizeCode: (code: string) => code.replaceAll("_", " ") }));
vi.mock("@/providers/permission-provider", () => ({ usePermissions: vi.fn() }));
vi.mock("@/services/billing.service", () => ({
  listPaymentEvents: vi.fn(),
  reprocessPaymentEvent: vi.fn(),
  triggerReconciliation: vi.fn(),
}));

import { usePermissions } from "@/providers/permission-provider";
import { listPaymentEvents, reprocessPaymentEvent, triggerReconciliation } from "@/services/billing.service";

const event = {
  _id: "evt-1",
  eventId: "evt_123",
  eventType: "checkout.session.completed",
  provider: "stripe",
  status: "processed",
  processingErrors: [],
  processedAt: "2026-07-20T00:00:00.000Z",
  tenantId: "tenant-1",
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-20T00:00:00.000Z",
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
  await act(async () => { root.render(<PaymentDiagnosticsPage />); });
  await settle();
  return container;
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent === text)! as HTMLButtonElement;
}

describe("PaymentDiagnosticsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (usePermissions as Mock).mockReturnValue({
      status: "ready",
      can: vi.fn((permission: string) => permission === Permission.BILLING_READ || permission === Permission.BILLING_MANAGE),
      refreshPermissions: vi.fn(),
    });
    (listPaymentEvents as Mock).mockResolvedValue({ success: true, data: { events: [event], pagination: { page: 1, pageSize: 20, totalRecords: 1, totalPages: 1 } } });
    (reprocessPaymentEvent as Mock).mockResolvedValue({ success: true, data: { reprocessed: true } });
    (triggerReconciliation as Mock).mockResolvedValue({ success: true, data: { subscriptions: { examined: 0, mismatched: [] }, invoices: { examined: 0, created: 0, updated: 0, failed: 0 }, refundSettlements: { indexInvariant: { status: "READY", issues: [], effectiveDuplicateTenantCount: 0 }, examined: 0, eligibleForTransitionRepair: 0, transitionOperationsCreated: 0, transitionsCompleted: 0, transitionsRetryable: 0, failed: 0 }, subscriptionIndex: { status: "READY", issues: [], effectiveDuplicateTenantCount: 0 }, providerCancellations: { created: 0, confirmed: 0, retryable: 0 } } });
  });

  afterEach(() => {
    for (const item of mounted.splice(0)) {
      act(() => item.root.unmount());
      item.container.remove();
    }
  });

  it("renders the header and rows from mocked payment events", async () => {
    const container = await renderPage();
    expect(container.textContent).toContain("Payment Diagnostics");
    expect(container.textContent).toContain("evt_123");
    expect(container.textContent).toContain("checkout.session.completed");
    expect(container.textContent).toContain("processed");
    expect(container.textContent).toContain("Page 1 of 1");
  });

  it("disables Previous on page 1 and keeps Next enabled", async () => {
    (listPaymentEvents as Mock).mockResolvedValue({ success: true, data: { events: [event], pagination: { page: 1, pageSize: 20, totalRecords: 51, totalPages: 2 } } });
    const container = await renderPage();
    expect(buttonByText(container, "Previous").disabled).toBe(true);
    expect(buttonByText(container, "Next").disabled).toBe(false);
  });

  it("pages to the last page and disables Next there", async () => {
    (listPaymentEvents as Mock).mockImplementation(async (params: { page?: number }) => ({
      success: true,
      data: { events: [event], pagination: { page: params.page ?? 1, pageSize: 20, totalRecords: 51, totalPages: 2 } },
    }));
    const container = await renderPage();
    const next = buttonByText(container, "Next");
    await act(async () => { next.click(); });
    await settle();
    expect(listPaymentEvents).toHaveBeenLastCalledWith({ page: 2, pageSize: 20 }, expect.any(AbortSignal));
    expect(container.textContent).toContain("Page 2 of 2");
    expect(buttonByText(container, "Next").disabled).toBe(true);
    expect(buttonByText(container, "Previous").disabled).toBe(false);
  });

  it("reprocesses a failed event and reloads the list", async () => {
    const failedEvent = { ...event, _id: "evt-2", eventId: "evt_failed", status: "failed", processingErrors: ["webhook timeout"] };
    (listPaymentEvents as Mock).mockResolvedValue({ success: true, data: { events: [failedEvent], pagination: { page: 1, pageSize: 20, totalRecords: 1, totalPages: 1 } } });
    const container = await renderPage();
    const reprocess = buttonByText(container, "Reprocess");
    await act(async () => { reprocess.click(); });
    await settle();
    expect(reprocessPaymentEvent).toHaveBeenCalledWith("evt_failed");
    expect(listPaymentEvents).toHaveBeenCalledTimes(2);
    expect(container.textContent).toContain("Event evt_failed reprocessed.");
  });

  it("runs reconciliation and shows the notice", async () => {
    const container = await renderPage();
    const reconcile = buttonByText(container, "Run reconciliation");
    await act(async () => { reconcile.click(); });
    await settle();
    expect(triggerReconciliation).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain("Reconciliation complete.");
  });
});
