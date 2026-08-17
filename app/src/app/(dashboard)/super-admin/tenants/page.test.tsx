// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { TenantsClient } from "./tenants-client";
import { Permission } from "@/types/api/permissions.types";

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "ar", t: (key: string) => key }));
const navState = vi.hoisted(() => ({ params: new URLSearchParams("") }));
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
  listPackages: vi.fn(),
  listSubscriptions: vi.fn(),
}));
vi.mock("@/services/platform.service", () => ({
  buildTenantListSearch: vi.fn(() => ""),
  listTenants: vi.fn(),
  parseTenantListQuery: vi.fn(() => ({ page: 1, pageSize: 20, search: "", status: "", plan: "" })),
  updateTenant: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), back: vi.fn(), forward: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
  useSearchParams: () => navState.params,
}));
vi.mock("next/link", async () => {
  const React = await import("react");
  return { default: (props: { href: string; children: React.ReactNode }) => React.createElement("a", props) };
});

import { usePermissions } from "@/providers/permission-provider";
import { listPackages, listSubscriptions } from "@/services/super-admin.service";
import { listTenants } from "@/services/platform.service";

const tenant = {
  id: "tenant-1",
  name: "Acme Corp",
  slug: "acme",
  status: "active",
  plan: "pro",
  effectivePackageId: "pkg-1",
  effectivePackageName: "Professional",
  effectiveSubscriptionStatus: "active",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  stats: { users: 3, documents: 5, questions: 12 },
};

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
async function renderPage(
  view?: "companies" | "tenants",
): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ container, root });
  await act(async () => {
    root.render(<TenantsClient view={view} />);
  });
  await settle();
  return container;
}

describe("TenantsClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (usePermissions as Mock).mockReturnValue({
      status: "ready",
      can: vi.fn((permission: string) => permission === Permission.BILLING_READ || permission === Permission.BILLING_MANAGE || permission === Permission.COMPANY_SETTINGS_UPDATE),
      refreshPermissions: vi.fn(),
    });
    (listTenants as Mock).mockResolvedValue({
      success: true,
      data: { tenants: [tenant], pagination: { page: 1, pageSize: 20, totalPages: 1, totalRecords: 1 } },
    });
    (listPackages as Mock).mockResolvedValue({
      success: true,
      data: [{ _id: "pkg-1", name: "Professional" }],
    });
    (listSubscriptions as Mock).mockResolvedValue({
      success: true,
      data: { subscriptions: [subscription], pagination: { page: 1, pageSize: 100, totalPages: 1, totalRecords: 1 } },
    });
  });

  afterEach(() => {
    for (const item of mounted.splice(0)) {
      act(() => item.root.unmount());
      item.container.remove();
    }
  });

  it("renders tenant rows and a subscription badge when present", async () => {
    const container = await renderPage();
    expect(container.textContent).toContain("Acme Corp");
    expect(container.textContent).toContain("acme");
    expect(container.textContent).toContain("Professional");
  });

  it("renders without throwing and shows a dash badge when a subscription's tenantId is null", async () => {
    const orphan = { ...subscription, _id: "sub-orphan", tenantId: null };
    (listSubscriptions as Mock).mockResolvedValue({
      success: true,
      data: { subscriptions: [orphan], pagination: { page: 1, pageSize: 100, totalPages: 1, totalRecords: 1 } },
    });
    const container = await renderPage();
    expect(container.textContent).toContain("Acme Corp");
    expect(container.textContent).toContain("—");
    // The orphan's package must not surface anywhere, as it is not attached.
    expect(container.textContent).not.toContain("Professional");
  });
});

describe("TenantsClient — companies view", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (usePermissions as Mock).mockReturnValue({
      status: "ready",
      can: vi.fn((permission: string) => permission === Permission.BILLING_READ || permission === Permission.BILLING_MANAGE || permission === Permission.COMPANY_SETTINGS_UPDATE),
      refreshPermissions: vi.fn(),
    });
    (listTenants as Mock).mockResolvedValue({
      success: true,
      data: { tenants: [tenant], pagination: { page: 1, pageSize: 20, totalPages: 1, totalRecords: 1 } },
    });
    (listPackages as Mock).mockResolvedValue({
      success: true,
      data: [{ _id: "pkg-1", name: "Professional" }],
    });
    (listSubscriptions as Mock).mockResolvedValue({
      success: true,
      data: { subscriptions: [subscription], pagination: { page: 1, pageSize: 100, totalPages: 1, totalRecords: 1 } },
    });
  });

  afterEach(() => {
    for (const item of mounted.splice(0)) {
      act(() => item.root.unmount());
      item.container.remove();
    }
  });

  it("exposes the slimmed company-facing column set and hides billing internals", async () => {
    const container = await renderPage("companies");
    const text = container.textContent ?? "";

    expect(text).toContain("Company");
    expect(text).toContain("Plan");
    expect(text).toContain("Subscription");
    expect(text).toContain("Users");
    expect(text).toContain("Documents");
    expect(text).toContain("Questions");
    expect(text).toContain("Created");
    expect(text).toContain("Actions");

    // Removed / relabelled columns must not appear in the Companies view.
    expect(text).not.toContain("Tenant");
    expect(text).not.toContain("Effective Plan");
    expect(text).not.toContain("Period Start");
    expect(text).not.toContain("Period End");
    expect(text).not.toContain("Plan (legacy)");

    // Company identity + effective plan value still render.
    expect(text).toContain("Acme Corp");
    expect(text).toContain("acme");
    expect(text).toContain("Professional");

    // Count label uses company terminology.
    expect(text).toContain("1 company");
    expect(text).not.toContain("1 tenant");
  });

  it("renders the search filter as 'Search companies' and the Plan filter without legacy wording", async () => {
    const container = await renderPage("companies");
    const text = container.textContent ?? "";

    expect(text).toContain("Search companies");
    // Plan filter label is the clean "Plan", not "Plan (legacy)".
    expect(text).not.toContain("Plan (legacy)");
    expect(text).toContain("Clear filters");
  });

  it("keeps row identity sticky while neutralising repeated primary actions", async () => {
    const container = await renderPage("companies");

    // Company column sticky at the logical start, Actions sticky at the end.
    const startCells = container.querySelectorAll<HTMLElement>("td.sticky.start-0, th.sticky.start-0");
    const endCells = container.querySelectorAll<HTMLElement>("td.sticky.end-0, th.sticky.end-0");
    expect(startCells.length).toBeGreaterThan(0);
    expect(endCells.length).toBeGreaterThan(0);

    // The "View" navigation link must be a subtle outline action, not the
    // repeated filled primary button from the legacy view.
    const viewLink = container.querySelector('a[href="/super-admin/companies/tenant-1"]');
    expect(viewLink?.textContent).toContain("View");
    expect(viewLink?.className).not.toMatch(/bg-blue-700/);
    expect(viewLink?.className).toMatch(/border/);

    // No saturated primary button anywhere on the page for this view.
    expect(container.querySelector(".bg-blue-700")).toBeNull();
  });

  it("renders exactly one Status filter and a package-based Plan filter", async () => {
    const container = await renderPage("companies");
    const statusLabels = Array.from(container.querySelectorAll("label")).filter(
      (label) => label.textContent?.startsWith("Status"),
    );
    expect(statusLabels).toHaveLength(1);

    const selects = container.querySelectorAll(
      "section[aria-label='Company filters'] select",
    );
    expect(selects.length).toBe(2); // Status + Plan
    const planSelect = selects[1];
    expect(planSelect?.textContent).toContain("All plans");
    // Plan options come from the authoritative package list.
    expect(planSelect?.textContent).toContain("Professional");
    expect((planSelect?.firstElementChild as HTMLOptionElement).value).toBe("");
  });

  it("aligns nine headers with nine row cells and shows the effective plan once", async () => {
    const container = await renderPage("companies");
    const thead = container.querySelector("thead tr");
    const tbody = container.querySelector("tbody tr");
    expect(thead?.querySelectorAll("th")).toHaveLength(9);
    expect(tbody?.querySelectorAll("td")).toHaveLength(9);

    // Plan column shows the authoritative effective package name exactly once;
    // the Subscription column shows only the status badge, never a package name.
    const texts = Array.from(tbody!.querySelectorAll("td")).map((td) => td.textContent ?? "");
    const planText = texts[2];
    expect(planText).toContain("Professional");
    const subscriptionText = texts[3];
    expect(subscriptionText).not.toContain("Professional");
    expect(subscriptionText).toContain("active");
    expect(texts.join("|")).not.toContain("Professional|Professional");
  });

  it("shows only a View action and no Manage action in the companies view", async () => {
    const container = await renderPage("companies");
    const actionsCell = container.querySelector("tbody tr td:last-child");
    expect(actionsCell?.querySelectorAll("a")).toHaveLength(1);
    expect(actionsCell?.textContent).toContain("View");
    expect(actionsCell?.textContent).not.toContain("Manage");
  });

  it("keeps the legacy tenants view intact with its plan filter and Manage action", async () => {
    const container = await renderPage();
    const text = container.textContent ?? "";

    // Legacy plan filter label + values survive.
    expect(text).toContain("Plan (legacy)");
    expect(text).toContain("All plans");
    // Legacy Manage action still present for the tenants view.
    expect(text).toContain("Manage");
  });
});
