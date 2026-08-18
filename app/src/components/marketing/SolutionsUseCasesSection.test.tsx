// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { SolutionsUseCasesSection } from "./SolutionsUseCasesSection";

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
        <SolutionsUseCasesSection />
      </I18nProvider>,
    );
  });
  mounted.push({ container, root });
  return container;
}

describe("SolutionsUseCasesSection", () => {
  it("renders the English section with all four team scenarios", () => {
    const container = render("en");
    const section = container.querySelector("section#solutions");
    expect(section).not.toBeNull();

    const text = container.textContent ?? "";

    // Opening
    expect(text).toContain("Solutions across your company");
    expect(text).toContain("One knowledge layer.");
    expect(text).toContain("Different teams.");
    expect(text).toContain("DocuMind helps each team reach the company knowledge");
    expect(text).toContain("Company knowledge");

    // Four scenarios: team, question, outcome, supporting line
    expect(text).toContain("Customer Support");
    expect(text).toContain("What is our P1 initial response target?");
    expect(text).toContain("15 minutes");
    expect(text).toContain("Support teams can retrieve SLA guidance");

    expect(text).toContain("Human Resources");
    expect(text).toContain("When can an employee work remotely?");
    expect(text).toContain("Eligibility and manager approval");
    expect(text).toContain("outdated copies or email threads");

    expect(text).toContain("Procurement");
    expect(text).toContain("When is a purchase order required?");
    expect(text).toContain("The relevant purchase-order rule");

    expect(text).toContain("Operations");
    expect(text).toContain("When should an expense report be submitted?");
    expect(text).toContain("The applicable submission deadline");

    // All four source filenames stay readable and stable
    expect(text).toContain("Customer_Support_SLA.pdf");
    expect(text).toContain("Remote_Work_Policy.pdf");
    expect(text).toContain("Procurement_Policy.pdf");
    expect(text).toContain("Travel_Expense_Policy.pdf");

    // Closing bridge
    expect(text).toContain("Different questions.");
    expect(text).toContain("One governed source of truth.");

    // No unresolved translation keys leak into the DOM.
    expect(text).not.toContain("landing.");
  });

  it("mirrors the layout for Arabic and keeps source identifiers intact", () => {
    const container = render("ar");
    const section = container.querySelector("section#solutions");
    expect(section?.getAttribute("dir")).toBe("rtl");

    const text = container.textContent ?? "";

    expect(text).toContain("حلول لفرق شركتك");
    expect(text).toContain("معرفة موحّدة لشركتك.");
    expect(text).toContain("وإجابات تناسب عمل كل فريق.");
    expect(text).toContain("معرفة الشركة");

    // Four scenarios in Arabic
    expect(text).toContain("دعم العملاء");
    expect(text).toContain("ما هو هدف زمن الاستجابة الأولية لحوادث P1؟");
    expect(text).toContain("15 دقيقة");

    expect(text).toContain("الموارد البشرية");
    expect(text).toContain("متى يمكن للموظف العمل عن بُعد؟");
    expect(text).toContain("الأهلية وموافقة المدير");

    expect(text).toContain("المشتريات");
    expect(text).toContain("متى يلزم إصدار أمر شراء؟");
    expect(text).toContain("القاعدة المعتمدة لأوامر الشراء");

    expect(text).toContain("العمليات");
    expect(text).toContain("متى يجب تقديم تقرير المصروفات؟");
    expect(text).toContain("الموعد المحدد في السياسة");

    // Source identifiers stay LTR and readable inside the RTL document.
    expect(text).toContain("Customer_Support_SLA.pdf");
    expect(text).toContain("Remote_Work_Policy.pdf");
    expect(text).toContain("Procurement_Policy.pdf");
    expect(text).toContain("Travel_Expense_Policy.pdf");

    // Closing bridge
    expect(text).toContain("تختلف الأسئلة،");
    expect(text).toContain("لكن المعرفة الموثوقة تبقى موحّدة ومحكومة بالصلاحيات.");

    expect(text).not.toContain("landing.");
  });

  it("renders four distinct scenario bands as editorial rows, not cards", () => {
    const container = render("en");
    const rows = Array.from(container.querySelectorAll("section#solutions [data-scenario]"));
    expect(rows.length).toBe(4);

    const ids = rows.map((r) => r.getAttribute("data-scenario"));
    expect(ids).toEqual(["support", "hr", "procurement", "operations"]);

    // Each band carries an index, an h3 question, a source, and an outcome
    for (const row of rows) {
      expect(row.querySelector("h3")).not.toBeNull();
      expect(row.querySelector('[dir="ltr"]')).not.toBeNull();
    }

    // The section heading is the only h2; questions are h3s.
    const h2s = Array.from(container.querySelectorAll("section#solutions h2"));
    const h3s = Array.from(container.querySelectorAll("section#solutions h3"));
    expect(h2s.length).toBe(1);
    expect(h3s.length).toBe(4);
  });
});