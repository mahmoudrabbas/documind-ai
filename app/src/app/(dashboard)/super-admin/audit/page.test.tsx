// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import AuditPage from "./page";

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
vi.mock("@/lib/audit-formatters", () => ({
  actionLabel: (action: string) => action.replaceAll("_", " "),
  resourceLabel: (resourceType: string) => resourceType,
  describeChanges: () => "changed",
}));
vi.mock("@/services/super-admin.service", () => ({
  listPlatformAudit: vi.fn(),
}));

import { listPlatformAudit } from "@/services/super-admin.service";

const log = {
  _id: "log-1",
  action: "USER_UPDATED",
  actorEmail: "admin@acme.com",
  actorRole: "SUPER_ADMIN",
  outcome: "SUCCESS",
  resourceType: "User",
  resourceId: "user-1",
  changes: { role: { before: "member", after: "admin" } },
  createdAt: "2026-07-20T10:30:00.000Z",
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
  await act(async () => { root.render(<AuditPage />); });
  await settle();
  return container;
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent === text)! as HTMLButtonElement;
}

describe("AuditPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listPlatformAudit as Mock).mockResolvedValue({
      success: true,
      data: { logs: [log], pagination: { page: 1, pageSize: 20, totalRecords: 1, totalPages: 1 } },
    });
  });

  afterEach(() => {
    for (const item of mounted.splice(0)) {
      act(() => item.root.unmount());
      item.container.remove();
    }
  });

  it("renders audit log rows from the page-1 data", async () => {
    const container = await renderPage();
    expect(container.textContent).toContain("admin@acme.com");
    expect(container.textContent).toContain("user-1");
    expect(container.textContent).toContain("Page 1 of 1");
    expect(listPlatformAudit).toHaveBeenNthCalledWith(
      1,
      { page: 1, pageSize: 20 },
      expect.any(AbortSignal),
    );
  });

  it("disables Previous and Next on a single-page result", async () => {
    const container = await renderPage();
    expect(buttonByText(container, "Previous").disabled).toBe(true);
    expect(buttonByText(container, "Next").disabled).toBe(true);
  });

  it("pages forward with Next and refetches page 2", async () => {
    (listPlatformAudit as Mock).mockImplementation(async (params: { page?: number }) => ({
      success: true,
      data: {
        logs: [{ ...log, _id: `log-${params.page ?? 1}`, actorEmail: `admin-${params.page ?? 1}@acme.com` }],
        pagination: { page: params.page ?? 1, pageSize: 20, totalRecords: 25, totalPages: 2 },
      },
    }));
    const container = await renderPage();
    const next = buttonByText(container, "Next");
    await act(async () => { next.click(); });
    await settle();
    expect(listPlatformAudit).toHaveBeenLastCalledWith(
      { page: 2, pageSize: 20 },
      expect.any(AbortSignal),
    );
    expect(container.textContent).toContain("Page 2 of 2");
    expect(container.textContent).toContain("admin-2@acme.com");
    expect(buttonByText(container, "Next").disabled).toBe(true);
    expect(buttonByText(container, "Previous").disabled).toBe(false);
  });
});
