// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { BuriedKnowledgeSection } from "./BuriedKnowledgeSection";

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
        <BuriedKnowledgeSection />
      </I18nProvider>,
    );
  });
  mounted.push({ container, root });
  return container;
}

describe("BuriedKnowledgeSection", () => {
  it("opens on the buried-knowledge statement and lists the four problems", () => {
    const container = render("en");
    const text = container.textContent ?? "";

    expect(text).toContain("The buried-knowledge problem");
    expect(text).toContain("Your company already has the answers.");
    expect(text).toContain("buried.");

    expect(text).toContain("Scattered across documents");
    expect(text).toContain("No single source of truth");
    expect(text).toContain("Locked behind permissions");
    expect(text).toContain("Trust without evidence");

    expect(text).toContain("DocuMind reads every document");
    expect(text).toContain("See how DocuMind works");

    // The four problems are numbered 01–04.
    const indexes = Array.from(container.querySelectorAll("span"))
      .map((el) => (el.textContent ?? "").trim())
      .filter((t) => /^0[1-4]$/.test(t));
    expect(indexes).toEqual(["01", "02", "03", "04"]);

    // The closing pivot links to how-it-works.
    expect(container.querySelector('a[href="#how-it-works"]')).not.toBeNull();

    // No unresolved translation keys leak into the DOM.
    expect(text).not.toContain("landing.");
  });

  it("mirrors the layout for Arabic and reads naturally", () => {
    const container = render("ar");
    const section = container.querySelector("section");
    expect(section?.getAttribute("dir")).toBe("rtl");

    const text = container.textContent ?? "";
    expect(text).toContain("مشكلة المعرفة المدفونة");
    expect(text).toContain("الإجابات موجودة بالفعل داخل شركتك");
    expect(text).toContain("مدفونة بين المستندات");
    expect(text).toContain("متناثرة بين المستندات");
    expect(text).toContain("لا يوجد مصدر موحّد وموثوق");
    expect(text).toContain("مقيّدة بصلاحيات الوصول");
    expect(text).toContain("الثقة تحتاج إلى دليل");
    expect(text).toContain("اكتشف كيف يعمل DocuMind");
    expect(text).not.toContain("landing.");
  });
});