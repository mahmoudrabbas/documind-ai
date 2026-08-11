// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import SubscriptionsPage from "./page";
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
vi.mock("@/services/super-admin.service", () => ({
  getSubscriptionDetail: vi.fn(),
  listPackages: vi.fn(),
  listSubscriptions: vi.fn(),
}));
vi.mock("@/services/platform.service", () => ({ listTenants: vi.fn() }));
vi.mock("@/services/billing.service", () => ({ syncSubscriptionFromStripe: vi.fn() }));

import { usePermissions } from "@/providers/permission-provider";
import {
  getSubscriptionDetail,
  listPackages,
  listSubscriptions,
} from "@/services/super-admin.service";
import { listTenants } from "@/services/platform.service";

const subscription = {
  _id: "sub-1",
  tenantId: { _id: "tenant-1", name: "Acme Corp", slug: "acme", status: "active" },
  packageId: { _id: "pkg-1", name: "Professional" },
  packageVersion: 1,
  status: "active",
  providerManaged: false,
  version: 1,
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
  await act(async () => { root.render(<SubscriptionsPage />); });
  await settle();
  return container;
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent === text)! as HTMLButtonElement;
}

function searchInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector("input")!;
}

function statusSelect(container: HTMLElement): HTMLSelectElement {
  return Array.from(container.querySelectorAll("select")).find((select) => select.textContent?.includes("All statuses"))! as HTMLSelectElement;
}

function setNativeValue(element: HTMLInputElement | HTMLSelectElement, value: string) {
  const prototype = element instanceof HTMLSelectElement
    ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, "value")!.set!;
  setter.call(element, value);
  element.dispatchEvent(new Event(element instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
}

describe("SubscriptionsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (usePermissions as Mock).mockReturnValue({
      status: "ready",
      can: vi.fn((permission: string) => permission === Permission.BILLING_READ || permission === Permission.BILLING_MANAGE),
      refreshPermissions: vi.fn(),
    });
    (listPackages as Mock).mockResolvedValue({ success: true, data: [] });
    (listTenants as Mock).mockResolvedValue({
      success: true,
      data: { tenants: [], pagination: { page: 1, pageSize: 100, totalRecords: 0, totalPages: 0 } },
    });
    (getSubscriptionDetail as Mock).mockResolvedValue({ success: true, data: null });
    (listSubscriptions as Mock).mockResolvedValue({
      success: true,
      data: {
        subscriptions: [subscription],
        pagination: { page: 1, pageSize: 20, totalRecords: 1, totalPages: 1 },
      },
    });
  });

  afterEach(() => {
    for (const item of mounted.splice(0)) {
      act(() => item.root.unmount());
      item.container.remove();
    }
  });

  it("renders header and rows from the server page data", async () => {
    const container = await renderPage();
    expect(container.textContent).toContain("Subscriptions");
    expect(container.textContent).toContain("Acme Corp");
    expect(container.textContent).toContain("acme");
    expect(container.textContent).toContain("Professional");
    expect(container.textContent).toContain("active");
    expect(container.textContent).toContain("Page 1 of 1");
    expect(listSubscriptions).toHaveBeenNthCalledWith(
      1,
      { page: 1, pageSize: 20, search: "", status: "" },
      expect.any(AbortSignal),
    );
    // The meta loader (operation-panel map) fetches the full 100-cap list once.
    expect(listSubscriptions).toHaveBeenNthCalledWith(
      2,
      { page: 1, pageSize: 100 },
      expect.any(AbortSignal),
    );
  });

  it("disables Previous and Next on a single-page result", async () => {
    const container = await renderPage();
    expect(buttonByText(container, "Previous").disabled).toBe(true);
    expect(buttonByText(container, "Next").disabled).toBe(true);
  });

  it("pages forward with Next and refetches with page 2", async () => {
    (listSubscriptions as Mock).mockImplementation(async (params: { page?: number }) => ({
      success: true,
      data: {
        subscriptions: [subscription],
        pagination: { page: params.page ?? 1, pageSize: 20, totalRecords: 25, totalPages: 2 },
      },
    }));
    const container = await renderPage();
    const next = buttonByText(container, "Next");
    await act(async () => { next.click(); });
    await settle();
    expect(listSubscriptions).toHaveBeenLastCalledWith(
      { page: 2, pageSize: 20, search: "", status: "" },
      expect.any(AbortSignal),
    );
    expect(container.textContent).toContain("Page 2 of 2");
    expect(buttonByText(container, "Next").disabled).toBe(true);
    expect(buttonByText(container, "Previous").disabled).toBe(false);
  });

  it("debounces the search draft into a server search param", async () => {
    const container = await renderPage();
    await act(async () => { setNativeValue(searchInput(container), "acme"); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    await settle();
    expect(listSubscriptions).toHaveBeenLastCalledWith(
      { page: 1, pageSize: 20, search: "acme", status: "" },
      expect.any(AbortSignal),
    );
  });

  it("re-fetches with the selected status filter", async () => {
    const container = await renderPage();
    await act(async () => { setNativeValue(statusSelect(container), "active"); });
    await settle();
    expect(listSubscriptions).toHaveBeenLastCalledWith(
      { page: 1, pageSize: 20, search: "", status: "active" },
      expect.any(AbortSignal),
    );
  });

  it("shows distinct empty states for unprovisioned vs filtered", async () => {
    (listSubscriptions as Mock).mockResolvedValue({
      success: true,
      data: { subscriptions: [], pagination: { page: 1, pageSize: 20, totalRecords: 0, totalPages: 0 } },
    });
    const container = await renderPage();
    expect(container.textContent).toContain("No subscriptions have been provisioned.");
    await act(async () => { setNativeValue(searchInput(container), "zzz"); });
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 400)); });
    await settle();
    expect(container.textContent).toContain("No subscriptions match these filters.");
  });

  it("renders a dash for subscriptions whose tenant is missing", async () => {
    const orphan = { ...subscription, _id: "sub-orphan", tenantId: null };
    (listSubscriptions as Mock).mockResolvedValue({
      success: true,
      data: {
        subscriptions: [subscription, orphan],
        pagination: { page: 1, pageSize: 20, totalRecords: 2, totalPages: 1 },
      },
    });
    const container = await renderPage();
    expect(container.textContent).toContain("Acme Corp");
    expect(container.textContent).toContain("—");
  });
});