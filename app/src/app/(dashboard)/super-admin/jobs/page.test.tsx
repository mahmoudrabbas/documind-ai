// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import JobsPage from "./page";

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
  listPlatformJobs: vi.fn(),
}));

import { listPlatformJobs } from "@/services/super-admin.service";

const job = {
  _id: "job-1",
  fileName: "hr-policy.pdf",
  status: "processing",
  tenantId: { _id: "tenant-1", name: "Acme Corp", slug: "acme", status: "active" },
  createdAt: "2026-07-20T00:00:00.000Z",
  updatedAt: "2026-07-21T00:00:00.000Z",
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
  await act(async () => { root.render(<JobsPage />); });
  await settle();
  return container;
}

function buttonByText(container: HTMLElement, text: string): HTMLButtonElement {
  return Array.from(container.querySelectorAll("button")).find((button) => button.textContent === text)! as HTMLButtonElement;
}

describe("JobsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (listPlatformJobs as Mock).mockResolvedValue({
      success: true,
      data: {
        jobs: [job],
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

  it("renders job rows from page-1 data", async () => {
    const container = await renderPage();
    expect(container.textContent).toContain("hr-policy.pdf");
    expect(container.textContent).toContain("Acme Corp");
    expect(container.textContent).toContain("processing");
    expect(container.textContent).toContain("Page 1 of 1");
    expect(listPlatformJobs).toHaveBeenNthCalledWith(
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

  it("pages forward with Next and refetches with page 2", async () => {
    const page2Job = { ...job, _id: "job-2", fileName: "onboarding.docx" };
    (listPlatformJobs as Mock).mockImplementation(async (params: { page?: number }) => ({
      success: true,
      data: {
        jobs: params.page === 2 ? [page2Job] : [job],
        pagination: { page: params.page ?? 1, pageSize: 20, totalRecords: 25, totalPages: 2 },
      },
    }));
    const container = await renderPage();
    const next = buttonByText(container, "Next");
    await act(async () => { next.click(); });
    await settle();
    expect(listPlatformJobs).toHaveBeenLastCalledWith(
      { page: 2, pageSize: 20 },
      expect.any(AbortSignal),
    );
    expect(container.textContent).toContain("onboarding.docx");
    expect(container.textContent).toContain("Page 2 of 2");
    expect(buttonByText(container, "Next").disabled).toBe(true);
    expect(buttonByText(container, "Previous").disabled).toBe(false);
  });
});
