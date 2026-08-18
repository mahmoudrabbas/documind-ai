// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { HeroSection } from "./HeroSection";

vi.mock("next/link", () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

const mounted: Array<{ container: HTMLElement; root: ReturnType<typeof createRoot> }> = [];

afterEach(() => {
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount());
    item.container.remove();
  }
});

function render(locale: "en" | "ar") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <I18nProvider initialLocale={locale}>
        <HeroSection />
      </I18nProvider>,
    );
  });
  mounted.push({ container, root });
  return container;
}

describe("HeroSection", () => {
  it("renders the full English hero copy with working CTA links", () => {
    const container = render("en");
    const text = container.textContent ?? "";

    expect(text).toContain("Enterprise Knowledge Intelligence");
    expect(text).toContain("Turn company knowledge");
    expect(text).toContain("into trusted intelligence.");
    expect(text).toContain("Connect your documents, respect access permissions");
    expect(text).toContain("Start Free");
    expect(text).toContain("See DocuMind in action");
    expect(text).toContain("Permission-aware");
    expect(text).toContain("Source-grounded");
    expect(text).toContain("Bilingual");
    expect(text).toContain("Auditable");

    expect(text).toContain("What is our P1 initial response target?");
    expect(text).toContain("15 minutes");
    expect(text).toContain("P1 incidents require an initial response within 15 minutes.");
    expect(text).toContain("Verified source");
    expect(text).toContain("Customer Support SLA");

    const primaryCta = container.querySelector('a[href="/register"]');
    expect(primaryCta).not.toBeNull();
    const secondaryCta = container.querySelector('a[href="#how-it-works"]');
    expect(secondaryCta).not.toBeNull();

    // No unresolved translation keys should leak into the DOM.
    expect(text).not.toContain("landing.");
  });

  it("mirrors the layout for Arabic and keeps Latin filenames LTR", () => {
    const container = render("ar");
    const section = container.querySelector("section");
    expect(section?.getAttribute("dir")).toBe("rtl");

    const text = container.textContent ?? "";
    expect(text).toContain("ذكاء المعرفة للمؤسسات");
    expect(text).toContain("حوّل معرفة شركتك");
    expect(text).toContain("15 دقيقة");
    expect(text).toContain("مصدر موثق");
    expect(text).not.toContain("landing.");

    // Latin filenames and source names stay visually LTR inside the RTL page.
    const latinSpans = Array.from(container.querySelectorAll('[dir="ltr"]'));
    const latinText = latinSpans.map((el) => el.textContent ?? "").join(" | ");
    expect(latinText).toContain("Customer_Support_SLA.pdf");
    expect(latinText).toContain("Security_Policy.pdf");
    expect(latinText).toContain("Customer Support SLA");
    expect(latinText).toContain("P1 Incident Response");
  });
});