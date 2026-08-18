// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { FaqSection } from "./FaqSection";

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
        <FaqSection />
      </I18nProvider>,
    );
  });
  mounted.push({ container, root });
  return container;
}

function buttons(container: HTMLElement) {
  return Array.from(container.querySelectorAll("section#faq h3 button"));
}

function answers(container: HTMLElement) {
  return Array.from(container.querySelectorAll("section#faq [role='region']"));
}

describe("FaqSection", () => {
  it("renders the English section with the stable faq anchor and LTR direction", () => {
    const container = render("en");
    const section = container.querySelector("section#faq");
    expect(section).not.toBeNull();
    expect(section?.getAttribute("dir")).toBe("ltr");

    const text = container.textContent ?? "";
    expect(text).toContain("Questions before you start");
    expect(text).toContain("The questions teams ask");
    expect(text).toContain("before they trust company knowledge to AI.");
    expect(text).toContain("Clear answers about access, sources, documents, language");
    expect(text).toContain("Know what you're bringing in.");

    // No unresolved translation keys leak into the DOM.
    expect(text).not.toContain("landing.");
  });

  it("renders Arabic with RTL direction and natural localized copy", () => {
    const container = render("ar");
    const section = container.querySelector("section#faq");
    expect(section).not.toBeNull();
    expect(section?.getAttribute("dir")).toBe("rtl");

    const text = container.textContent ?? "";
    expect(text).toContain("أسئلة قبل البدء");
    expect(text).toContain("أسئلة تحتاج الفرق إلى إجاباتها");
    expect(text).toContain("قبل الاعتماد على الذكاء الاصطناعي في معرفة الشركة.");
    expect(text).toContain("إجابات واضحة حول الصلاحيات والمصادر والمستندات واللغة");
    expect(text).toContain("اعرف ما تُدخله إلى النظام،");

    // Latin product terms stay intact inside the RTL document.
    expect(text).toContain("DocuMind");
    expect(text).toContain("PDF");
    expect(text).toContain("DOCX");
    expect(text).toContain("TXT");
    expect(text).toContain("OCR");

    expect(text).not.toContain("landing.");
  });

  it("shows all nine verified buyer questions", () => {
    const container = render("en");
    const text = container.textContent ?? "";

    const questions = [
      "How does DocuMind keep one company's knowledge separate from another?",
      "Can every employee search every company document?",
      "How can I verify where an answer came from?",
      "What happens when the available documents do not contain enough information?",
      "What kinds of documents can we add?",
      "Can teams use DocuMind in both Arabic and English?",
      "What happens when company documents change?",
      "What happens when our organization reaches a plan limit?",
      "Can we change our plan later?",
    ];
    for (const q of questions) {
      expect(text).toContain(q);
    }

    expect(container.querySelectorAll("section#faq [data-faq]").length).toBe(9);
  });

  it("protects the product-verified answer language", () => {
    const container = render("en");
    const text = container.textContent ?? "";

    // Tenant isolation — scoped, never "completely secure forever".
    expect(text).toContain("own tenant context");
    expect(text).toContain("scoped to that organization");
    // Access — permission-based, not "everyone can search".
    expect(text).toContain("applies the organization's access rules");
    // Evidence — no absolute "never hallucinates" claim.
    expect(text).toContain("insufficient rather than presenting an unsupported answer");
    // Formats — only the verified set, no Markdown / Excel / SharePoint.
    expect(text).toContain("PDF, DOCX, and TXT files up to 50 MB each");
    expect(text).toContain("Scanned documents are handled with OCR");
    expect(text).not.toContain("Markdown");
    // Limits — real entitlement behavior, no invented grace periods.
    expect(text).toContain("affected action is paused");
  });

  it("uses an accessible accordion: h2 heading, h3 question buttons, aria wiring", () => {
    const container = render("en");

    const h2s = Array.from(container.querySelectorAll("section#faq h2"));
    expect(h2s.length).toBe(1);
    expect(h2s[0]?.id).toBe("faq-heading");

    const btns = buttons(container);
    expect(btns.length).toBe(9);

    const regions = answers(container);
    expect(regions.length).toBe(9);

    for (let i = 0; i < btns.length; i++) {
      const btn = btns[i];
      expect(btn.getAttribute("aria-expanded")).toBeTruthy();
      expect(btn.getAttribute("aria-controls")).toBeTruthy();
      const regionId = btn.getAttribute("aria-controls");
      const region = regions.find((r) => r.id === regionId);
      expect(region).toBeDefined();
      expect(region?.getAttribute("aria-labelledby")).toBe(btn.id);
      expect(region?.getAttribute("role")).toBe("region");
    }

    // Question triggers are real buttons (keyboard operable by default).
    for (const btn of btns) {
      expect(btn.tagName).toBe("BUTTON");
    }
  });

  it("starts with the first question open and the rest closed", () => {
    const container = render("en");
    const btns = buttons(container);

    expect(btns[0]?.getAttribute("aria-expanded")).toBe("true");
    for (let i = 1; i < btns.length; i++) {
      expect(btns[i]?.getAttribute("aria-expanded")).toBe("false");
    }

    // The open answer is exposed; closed answers are inert and hidden.
    const firstAnswer = container.querySelector("#faq-answer-isolation");
    const secondAnswer = container.querySelector("#faq-answer-access");
    expect(firstAnswer?.hasAttribute("inert")).toBe(false);
    expect(firstAnswer?.getAttribute("aria-hidden")).toBe("false");
    expect(secondAnswer?.hasAttribute("inert")).toBe(true);
    expect(secondAnswer?.getAttribute("aria-hidden")).toBe("true");
  });

  it("opens an item when its question is clicked and shows its answer", () => {
    const container = render("en");
    const btns = buttons(container);

    act(() => {
      btns[2]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(btns[2]?.getAttribute("aria-expanded")).toBe("true");
    const third = container.querySelector("#faq-answer-verify");
    expect(third?.hasAttribute("inert")).toBe(false);
    expect(third?.getAttribute("aria-hidden")).toBe("false");
    expect(third?.textContent).toContain("keeps the answer connected to the source");
  });

  it("keeps only one item open at a time when switching", () => {
    const container = render("en");
    const btns = buttons(container);

    // First is open by default.
    expect(btns[0]?.getAttribute("aria-expanded")).toBe("true");

    // Open the middle item — the first must close.
    act(() => {
      btns[4]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(btns[4]?.getAttribute("aria-expanded")).toBe("true");
    expect(btns[0]?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelectorAll("section#faq [data-open='true']").length).toBe(1);

    // Open the last item — the middle must close.
    act(() => {
      btns[8]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(btns[8]?.getAttribute("aria-expanded")).toBe("true");
    expect(btns[4]?.getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelectorAll("section#faq [data-open='true']").length).toBe(1);
  });

  it("allows closing the open item so every answer can be collapsed", () => {
    const container = render("en");
    const btns = buttons(container);

    act(() => {
      btns[0]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    for (const btn of btns) {
      expect(btn.getAttribute("aria-expanded")).toBe("false");
    }
    expect(container.querySelectorAll("section#faq [data-open='true']").length).toBe(0);
  });

  it("renders the Arabic open state correctly and toggles", () => {
    const container = render("ar");
    const btns = buttons(container);

    expect(btns[0]?.getAttribute("aria-expanded")).toBe("true");

    act(() => {
      btns[1]?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(btns[1]?.getAttribute("aria-expanded")).toBe("true");
    expect(btns[0]?.getAttribute("aria-expanded")).toBe("false");

    const second = container.querySelector("#faq-answer-access");
    expect(second?.textContent).toContain("يبحث كل مستخدم داخل نطاق المعرفة المسموح له بالوصول إليه");
  });

  it("keeps the accordion rows as ruled editorial rows, not cards", () => {
    const container = render("en");
    const items = Array.from(container.querySelectorAll("section#faq [data-faq]"));
    expect(items.length).toBe(9);

    // The list is one ruled column (border-t / border-b hairlines), no grid of boxes.
    const ul = container.querySelector("section#faq ul");
    expect(ul?.getAttribute("class")?.includes("border-t")).toBe(true);
    for (const item of items) {
      expect(item.getAttribute("class")?.includes("border-b")).toBe(true);
      expect(item.getAttribute("class")?.includes("rounded")).toBe(false);
    }
  });
});