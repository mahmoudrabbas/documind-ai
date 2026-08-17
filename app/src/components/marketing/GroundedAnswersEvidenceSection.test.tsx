// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { GroundedAnswersEvidenceSection } from "./GroundedAnswersEvidenceSection";

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
        <GroundedAnswersEvidenceSection />
      </I18nProvider>,
    );
  });
  mounted.push({ container, root });
  return container;
}

describe("GroundedAnswersEvidenceSection", () => {
  it("renders the English section with the supported answer and its evidence", () => {
    const container = render("en");
    const section = container.querySelector("section#grounded-answers");
    expect(section).not.toBeNull();

    const text = container.textContent ?? "";

    // Opening
    expect(text).toContain("Grounded answers");
    expect(text).toContain("Every answer should show");
    expect(text).toContain("why it can be trusted.");
    expect(text).toContain("DocuMind keeps answers connected to the company evidence");

    // The evidence trace — question → answer → citation → verified source
    expect(text).toContain("Evidence trace");
    expect(text).toContain("What is our P1 initial response target?");
    expect(text).toContain("15 minutes");
    expect(text).toContain("P1 incidents require an initial response within 15 minutes.");
    expect(text).toContain("Customer Support SLA");
    expect(text).toContain("Verified source");
    expect(text).toContain("Customer_Support_SLA.pdf");
    expect(text).toContain("P1 Incident Response");
    expect(text).toContain("Policy");
    expect(text).toContain("Authorized source");

    // Editorial statement + principles
    expect(text).toContain("Traceability changes how people use AI.");
    expect(text).toContain("Answers stay connected to their sources.");
    expect(text).toContain("Evidence can be inspected and verified.");
    expect(text).toContain("No evidence means no fabricated answer.");

    // No unresolved translation keys leak into the DOM.
    expect(text).not.toContain("landing.");
  });

  it("switches to the insufficient-evidence state without fabricating an answer", () => {
    const container = render("en");
    const buttons = Array.from(
      container.querySelectorAll("section#grounded-answers button[aria-pressed]"),
    ) as HTMLButtonElement[];

    expect(buttons.length).toBe(2);

    const insufficient = buttons.find((b) =>
      (b.textContent ?? "").includes("Insufficient evidence"),
    );
    expect(insufficient).toBeDefined();

    act(() => insufficient!.click());

    const text = container.textContent ?? "";
    expect(text).toContain("What is our reimbursement policy for home office furniture?");
    expect(text).toContain("Evidence unavailable");
    expect(text).toContain("I couldn't find enough information in the authorized company sources");
    expect(text).toContain("No source found");

    // No fabricated answer and no source are shown in the refusal state.
    expect(text).not.toContain("15 minutes");
    expect(text).not.toContain("Customer_Support_SLA.pdf");
    expect(text).not.toContain("What is our P1 initial response target?");

    // The switch reflects the active state.
    expect(insufficient!.getAttribute("aria-pressed")).toBe("true");
    expect(text).not.toContain("landing.");
  });

  it("mirrors the layout for Arabic and keeps source identifiers intact", () => {
    const container = render("ar");
    const section = container.querySelector("section#grounded-answers");
    expect(section?.getAttribute("dir")).toBe("rtl");

    const text = container.textContent ?? "";
    expect(text).toContain("إجابات مدعومة بالأدلة");
    expect(text).toContain("كل إجابة يجب أن توضّح");
    expect(text).toContain("لماذا يمكن الوثوق بها.");
    expect(text).toContain("مسار الأدلة");
    expect(text).toContain("ما هو هدف زمن الاستجابة الأولية لحوادث P1؟");
    expect(text).toContain("15 دقيقة");
    expect(text).toContain("تتطلب حوادث P1 استجابة أولية خلال 15 دقيقة.");
    expect(text).toContain("مصدر موثّق");
    expect(text).toContain("Customer_Support_SLA.pdf");
    expect(text).toContain("الاستجابة لحوادث P1");
    expect(text).toContain("سياسة");
    expect(text).toContain("مصدر مصرّح");
    expect(text).toContain("إمكانية تتبّع الإجابة تغيّر طريقة استخدام الذكاء الاصطناعي.");
    expect(text).toContain("تظل الإجابات مرتبطة بمصادرها.");
    expect(text).toContain("يمكن مراجعة الأدلة والتحقق منها.");
    expect(text).toContain("عند غياب الدليل، لا تُختلق الإجابة.");

    // Source identifiers stay LTR and readable inside the RTL document.
    expect(text).toContain("Customer_Support_SLA.pdf");
    expect(text).toContain("Customer Support SLA");

    expect(text).not.toContain("landing.");
  });

  it("renders the Arabic insufficient-evidence refusal calmly", () => {
    const container = render("ar");
    const buttons = Array.from(
      container.querySelectorAll("section#grounded-answers button[aria-pressed]"),
    ) as HTMLButtonElement[];
    const insufficient = buttons.find((b) => (b.textContent ?? "").includes("أدلة غير كافية"));
    expect(insufficient).toBeDefined();

    act(() => insufficient!.click());

    const text = container.textContent ?? "";
    expect(text).toContain("الأدلة غير متوفرة");
    expect(text).toContain("لم أجد معلومات كافية في مصادر الشركة المسموح بها");
    expect(text).toContain("لم يُعثر على مصدر");
    expect(text).not.toContain("15 دقيقة");
    expect(text).not.toContain("Customer_Support_SLA.pdf");
    expect(text).not.toContain("landing.");
  });
});