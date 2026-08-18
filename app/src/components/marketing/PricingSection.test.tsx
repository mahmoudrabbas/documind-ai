// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { apiClient } from "@/lib/api-client";
import { PricingSection } from "./PricingSection";
import type { PublicPackage } from "@/types/api/billing.types";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/lib/api-client", () => ({ apiClient: vi.fn() }));

type ApiMock = {
  mockResolvedValue: (value: unknown) => void;
  mockResolvedValueOnce: (value: unknown) => void;
  mockRejectedValueOnce: (value: unknown) => void;
  mockImplementation: (fn: () => Promise<unknown>) => void;
  mockReset: () => void;
};
const apiMock = (apiClient as unknown) as ApiMock;

/* Real shape of the live public packages (Free / DocuMind Pro / DocuMind Ultra). */
const freePackage: PublicPackage = {
  id: "pkg-free",
  name: "Free",
  code: "free",
  description: "Get started with basic document management",
  monthlyPrice: 0,
  annualPrice: 0,
  monthlyPriceCents: 0,
  annualPriceCents: 0,
  currency: "USD",
  trialDays: 0,
  entitlements: { employees: 5, documents: 10, storageMb: 1000, queriesPerMonth: 100 },
  supportedModels: ["basic"],
  analyticsLevel: "basic",
  retentionDays: 90,
  supportLevel: "community",
};

const proPackage: PublicPackage = {
  id: "pkg-pro",
  name: "DocuMind Pro",
  code: "documind-100",
  description: "Professional tier for growing teams",
  monthlyPrice: 500,
  annualPrice: 5000,
  monthlyPriceCents: 500,
  annualPriceCents: 5000,
  currency: "USD",
  trialDays: 0,
  entitlements: { employees: 25, documents: 1000, storageMb: 10240, queriesPerMonth: 1000 },
  supportedModels: ["basic"],
  analyticsLevel: "basic",
  retentionDays: 90,
  supportLevel: "community",
};

const ultraPackage: PublicPackage = {
  id: "pkg-ultra",
  name: "DocuMind Ultra",
  code: "documind-pkg-100",
  description: "Ultra high limits for enterprise workflows",
  monthlyPrice: 1000,
  annualPrice: 10000,
  monthlyPriceCents: 1000,
  annualPriceCents: 10000,
  currency: "USD",
  trialDays: 0,
  entitlements: { employees: 100, documents: 10000, storageMb: 102400, queriesPerMonth: 10000 },
  supportedModels: ["basic"],
  analyticsLevel: "basic",
  retentionDays: 90,
  supportLevel: "community",
};

const PUBLIC_PACKAGES = [freePackage, proPackage, ultraPackage];

const mounted: Array<{ container: HTMLElement; root: ReturnType<typeof createRoot> }> = [];

afterEach(() => {
  for (const item of mounted.splice(0)) {
    act(() => {
      item.root.unmount();
      item.container.remove();
    });
  }
  apiMock.mockReset();
});

function mount(locale: "en" | "ar") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <I18nProvider initialLocale={locale}>
        <PricingSection />
      </I18nProvider>,
    );
  });
  mounted.push({ container, root });
  return { container, root };
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function resolvePackages() {
  apiMock.mockResolvedValue({ success: true, data: PUBLIC_PACKAGES });
}

describe("PricingSection", () => {
  it("renders real public plans with section id and LTR (EN)", async () => {
    resolvePackages();
    const { container } = mount("en");
    await flush();

    const section = container.querySelector("#pricing");
    expect(section).toBeTruthy();
    expect(section?.getAttribute("dir")).toBe("ltr");

    const plans = container.querySelectorAll("[data-plan]");
    expect(plans.length).toBe(3);

    const text = container.textContent ?? "";
    expect(text).toContain("Free");
    expect(text).toContain("DocuMind Pro");
    expect(text).toContain("DocuMind Ultra");
    expect(text).not.toContain("landing.");
  });

  it("renders real monthly prices as the actionable figure", async () => {
    resolvePackages();
    const { container } = mount("en");
    await flush();

    const text = container.textContent ?? "";
    expect(text).toContain("$5");
    expect(text).toContain("$10");
    expect(text).toContain("/ month");
    expect(text).toContain("Free");
  });

  it("shows real annual totals as truthful, non-interactive information", async () => {
    resolvePackages();
    const { container } = mount("en");
    await flush();

    const text = container.textContent ?? "";
    expect(text).toContain("or $50 / year");
    expect(text).toContain("or $100 / year");
    expect(text).toContain("Save 17% annually");

    const annualLines = container.querySelectorAll("[data-annual-price]");
    expect(annualLines.length).toBe(2);
    expect(annualLines[0]?.textContent).toContain("$50");
    expect(annualLines[1]?.textContent).toContain("$100");

    const savings = container.querySelectorAll("[data-annual-save]");
    expect(savings.length).toBe(2);

    // No interactive billing selector exists — annual cannot be pre-selected.
    expect(container.querySelector('[data-billing-toggle]')).toBeNull();
    expect(container.querySelector('[role="group"]')).toBeNull();
  });

  it("does not fabricate annual information when annual is not configured", async () => {
    apiMock.mockResolvedValue({
      success: true,
      data: [
        freePackage,
        { ...proPackage, annualPrice: 0, annualPriceCents: 0 },
        { ...ultraPackage, annualPrice: 0, annualPriceCents: 0 },
      ],
    });
    const { container } = mount("en");
    await flush();

    expect(container.querySelectorAll("[data-annual-price]").length).toBe(0);
    expect(container.querySelectorAll("[data-annual-save]").length).toBe(0);
    expect(container.textContent ?? "").not.toContain("/ year");
  });

  it("keeps the Free plan untouched (no price, no units, no savings)", async () => {
    resolvePackages();
    const { container } = mount("en");
    await flush();

    const freeCell = container.querySelector('[data-plan="free"]');
    expect(freeCell?.textContent).toContain("Free");
    expect(freeCell?.textContent).not.toContain("$0");
    expect(freeCell?.textContent).not.toContain("/ year");
    expect(freeCell?.querySelector('[data-annual-price]')).toBeNull();
    expect(freeCell?.querySelector('[data-annual-save]')).toBeNull();
  });

  it("renders Arabic with localized plan names, RTL prices, and annual info", async () => {
    resolvePackages();
    const { container } = mount("ar");
    await flush();

    const section = container.querySelector("#pricing");
    expect(section?.getAttribute("dir")).toBe("rtl");

    const text = container.textContent ?? "";
    expect(text).toContain("الخطة المجانية");
    expect(text).toContain("دوكيوميند بروفيشينال");
    expect(text).toContain("دوكيوميند ألترا");
    expect(text).toContain("/ شهر");
    expect(text).toContain("قارن بين الأساسيات");
    expect(text).toContain("أو");
    expect(text).toContain("/ سنة");
    expect(text).toContain("وفّر 17% مع الدفع السنوي");
    expect(text).not.toContain("landing.");

    const currencySpans = container.querySelectorAll('[data-plan] span[dir="ltr"]');
    const spanText = [...currencySpans].map((s) => s.textContent).join(" ");
    expect(spanText).toContain("US$");

    const annualLines = container.querySelectorAll("[data-annual-price]");
    expect(annualLines.length).toBe(2);
    expect(annualLines[0]?.querySelector('span[dir="ltr"]')?.textContent).toContain("US$");

    const freeCell = container.querySelector('[data-plan="free"]');
    expect(freeCell?.textContent).toContain("الخطة المجانية");
    expect(freeCell?.textContent).toContain("مجاني");
    expect(freeCell?.textContent).not.toContain("/ سنة");
  });

  it("uses real registration routes preserving package codes", async () => {
    resolvePackages();
    const { container } = mount("en");
    await flush();

    const hrefs = [...container.querySelectorAll("a")]
      .map((a) => a.getAttribute("href"))
      .filter(Boolean);
    expect(hrefs).toContain("/register");
    expect(hrefs).toContain("/register?package=documind-100");
    expect(hrefs).toContain("/register?package=documind-pkg-100");
    expect(hrefs).not.toContain("#");
  });

  it("shows the real comparison dimensions without a spreadsheet grid", async () => {
    resolvePackages();
    const { container } = mount("en");
    await flush();

    const text = container.textContent ?? "";
    expect(text).toContain("Documents");
    expect(text).toContain("Knowledge queries / month");
    expect(text).toContain("Team members");
    expect(text).toContain("Storage");
    expect(text).toContain("Support");
    expect(text).toContain("10,000");
    expect(text).toContain("1,000");

    const desktopRows = container.querySelectorAll("[data-compare-row]");
    expect(desktopRows.length).toBe(5);
    const mobileBlocks = container.querySelectorAll("[data-compare-mobile-row]");
    expect(mobileBlocks.length).toBe(5);
    expect(container.querySelectorAll("[data-compare-plan-name]").length).toBe(15);
    expect(container.querySelectorAll("[data-compare-value]").length).toBe(15);
  });

  it("supports dynamic public plan counts (1 and 4 plans)", async () => {
    apiMock.mockResolvedValue({ success: true, data: [proPackage] });
    const { container: one } = mount("en");
    await flush();
    expect(one.querySelectorAll("[data-plan]").length).toBe(1);

    apiMock.mockResolvedValue({
      success: true,
      data: [
        freePackage,
        proPackage,
        ultraPackage,
        { ...ultraPackage, id: "pkg-4", code: "documind-enterprise" },
      ],
    });
    const { container: four } = mount("en");
    await flush();
    expect(four.querySelectorAll("[data-plan]").length).toBe(4);
  });

  it("shows restrained skeleton geometry while loading", async () => {
    let resolveFn: (value: unknown) => void = () => {};
    apiMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          resolveFn = resolve;
        }),
    );
    const { container } = mount("en");

    expect(container.querySelector('[role="status"]')).toBeTruthy();
    expect(container.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(container.querySelectorAll("[data-plan]").length).toBe(0);

    await act(async () => {
      resolveFn({ success: true, data: PUBLIC_PACKAGES });
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelectorAll("[data-plan]").length).toBe(3);
  });

  it("shows a calm error state on failure and retries", async () => {
    apiMock.mockRejectedValueOnce(new Error("boom"));
    const { container } = mount("en");
    await flush();

    const alert = container.querySelector('[role="alert"]');
    expect(alert).toBeTruthy();
    expect(container.textContent).toContain("Pricing is temporarily unavailable.");
    expect(container.textContent).toContain("Please try again shortly.");

    apiMock.mockResolvedValueOnce({ success: true, data: PUBLIC_PACKAGES });
    const retry = [...container.querySelectorAll("button")].find(
      (b) => b.textContent?.trim() === "Retry",
    );
    expect(retry).toBeTruthy();
    await act(async () => {
      retry?.click();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(container.querySelectorAll("[data-plan]").length).toBe(3);
  });
});