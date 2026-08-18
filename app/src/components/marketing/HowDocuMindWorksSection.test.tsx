// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { HowDocuMindWorksSection } from "./HowDocuMindWorksSection";

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
        <HowDocuMindWorksSection />
      </I18nProvider>,
    );
  });
  mounted.push({ container, root });
  return container;
}

/** The five stages exist in both the desktop narrative and the mobile rail. */
function stageIndexes(container: HTMLElement): number[] {
  return Array.from(container.querySelectorAll("[data-stage-index]"))
    .map((el) => Number(el.getAttribute("data-stage-index")))
    .filter((v) => Number.isInteger(v))
    .sort();
}

describe("HowDocuMindWorksSection", () => {
  it("renders the English opening, all five stages, and the grounded answer", () => {
    const container = render("en");
    const section = container.querySelector("section#how-it-works");
    expect(section).not.toBeNull();

    const text = container.textContent ?? "";

    // Opening
    expect(text).toContain("How DocuMind works");
    expect(text).toContain("From scattered knowledge");
    expect(text).toContain("to a grounded answer.");
    expect(text).toContain("DocuMind connects your company knowledge");

    // All five stages
    expect(text).toContain("Connect company knowledge");
    expect(text).toContain("Understand and organize");
    expect(text).toContain("Apply access before retrieval");
    expect(text).toContain("Retrieve the right evidence");
    expect(text).toContain("Answer with evidence");

    // The permission story reads before retrieval
    expect(text).toContain("Apply access before retrieval");
    expect(text).toContain("Authorized");
    expect(text).toContain("Restricted");
    expect(text).toContain("Stops here");

    // Final evidence state
    expect(text).toContain("15 minutes");
    expect(text).toContain("P1 incidents require an initial response within 15 minutes.");
    expect(text).toContain("Verified source");
    expect(text).toContain("Customer Support SLA");

    // Closing statement
    expect(text).toContain("The result is not just an answer.");
    expect(text).toContain("It is an answer your organization can trust.");

    // No unresolved translation keys leak into the DOM.
    expect(text).not.toContain("landing.");
  });

  it("renders all five stages on both the desktop narrative and mobile rail", () => {
    const container = render("en");
    const indexes = stageIndexes(container);
    expect(indexes).toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it("renders the full pipeline in the system canvas", () => {
    const container = render("en");
    const text = container.textContent ?? "";

    // One integrated surface, not five cards — the canvas label and the
    // five stage states are present.
    expect(text).toContain("Knowledge path");
    expect(text).toContain("Connect");
    expect(text).toContain("Understand");
    expect(text).toContain("Govern");
    expect(text).toContain("Retrieve");
    expect(text).toContain("Answer");

    // Restricted knowledge does not continue into retrieval.
    expect(text).toContain("What is our P1 initial response target?");
    expect(text).toContain("Selected source");
    expect(text).toContain("Not permitted");

    // Authorized evidence stays attached to the answer.
    expect(text).toContain("Authorized source");
    expect(text).toContain("Grounded answer");
  });

  it("mirrors the layout for Arabic and keeps filenames intact", () => {
    const container = render("ar");
    const section = container.querySelector("section#how-it-works");
    expect(section?.getAttribute("dir")).toBe("rtl");

    const text = container.textContent ?? "";
    expect(text).toContain("كيف يعمل DocuMind");
    expect(text).toContain("من معرفة متناثرة");
    expect(text).toContain("إلى إجابة موثوقة ومدعومة بالدليل");
    expect(text).toContain("اربط معرفة شركتك");
    expect(text).toContain("افهم المعرفة ونظّمها");
    expect(text).toContain("طبّق الصلاحيات قبل الاسترجاع");
    expect(text).toContain("استرجع الأدلة المناسبة");
    expect(text).toContain("أجب مع إرفاق الدليل");
    expect(text).toContain("15 دقيقة");
    expect(text).toContain("مصدر موثّق");
    expect(text).toContain("النتيجة ليست مجرد إجابة");
    expect(text).toContain("بل إجابة يمكن لمؤسستك الوثوق بها");

    // Document names stay LTR and readable inside the RTL document.
    expect(text).toContain("Procurement_Policy.pdf");
    expect(text).toContain("Customer_Support_SLA.pdf");
    expect(text).toContain("Security_Policy.pdf");
    expect(text).toContain("Employee_Handbook.pdf");

    expect(text).not.toContain("landing.");
  });
});