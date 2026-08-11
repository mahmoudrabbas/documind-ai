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
vi.mock("@/services/super-admin.service", () => ({ listSubscriptions: vi.fn() }));
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
import { listSubscriptions } from "@/services/super-admin.service";
import { listTenants } from "@/services/platform.service";

const tenant = {
  id: "tenant-1",
  name: "Acme Corp",
  slug: "acme",
  status: "active",
  plan: "pro",
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
async function renderPage(): Promise<HTMLElement> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted.push({ container, root });
  await act(async () => { root.render(<TenantsClient />); });
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
