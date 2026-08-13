// @vitest-environment jsdom
declare global {
  // eslint-disable-next-line no-var
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import PlatformUsersPage from "./page";

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
vi.mock("@/services/super-admin.service", () => ({
  listPlatformUsers: vi.fn(),
}));

import { listPlatformUsers } from "@/services/super-admin.service";

const user = {
  _id: "user-1",
  name: "Alice Admin",
  email: "alice@acme.com",
  role: "company_admin",
  status: "active",
  emailVerified: true,
  tenantId: { _id: "tenant-1", name: "Acme Corp", slug: "acme" },
  createdAt: "2026-07-20T00:00:00.000Z",
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
  await act(async () => { root.render(<PlatformUsersPage />); });
  await settle();
  return container;
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent === text)! as HTMLButtonElement;
}

describe("PlatformUsersPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listPlatformUsers as Mock).mockResolvedValue({
      success: true,
      data: {
        users: [user],
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

  it("renders user rows from the first page of data", async () => {
    const container = await renderPage();
    expect(container.textContent).toContain("Platform Users");
    expect(container.textContent).toContain("Alice Admin");
    expect(container.textContent).toContain("alice@acme.com");
    expect(container.textContent).toContain("Acme Corp");
    expect(container.textContent).toContain("company admin");
    expect(container.textContent).toContain("active");
    expect(container.textContent).toContain("Yes");
    expect(container.textContent).toContain("Page 1 of 1");
    expect(listPlatformUsers).toHaveBeenCalledWith(
      { page: 1, pageSize: 20 },
      expect.any(AbortSignal),
    );
  });

  it("disables Previous on page 1 and Next on the last page", async () => {
    const container = await renderPage();
    expect(buttonByText(container, "Previous").disabled).toBe(true);
    expect(buttonByText(container, "Next").disabled).toBe(true);
  });

  it("pages forward with Next and refetches with page 2", async () => {
    (listPlatformUsers as Mock).mockImplementation(async (params: { page: number }) => ({
      success: true,
      data: {
        users: params.page === 1
          ? [user]
          : [{ ...user, _id: "user-2", name: "Bob Admin", email: "bob@acme.com" }],
        pagination: { page: params.page, pageSize: 20, totalRecords: 150, totalPages: 2 },
      },
    }));
    const container = await renderPage();
    const next = buttonByText(container, "Next");
    await act(async () => { next.click(); });
    await settle();
    expect(listPlatformUsers).toHaveBeenLastCalledWith(
      { page: 2, pageSize: 20 },
      expect.any(AbortSignal),
    );
    expect(container.textContent).toContain("Bob Admin");
    expect(container.textContent).not.toContain("Alice Admin");
    expect(container.textContent).toContain("Page 2 of 2");
    expect(buttonByText(container, "Next").disabled).toBe(true);
    expect(buttonByText(container, "Previous").disabled).toBe(false);
  });
});
