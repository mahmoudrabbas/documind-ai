// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { PermissionAwareIntelligenceSection } from "./PermissionAwareIntelligenceSection";

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
        <PermissionAwareIntelligenceSection />
      </I18nProvider>,
    );
  });
  mounted.push({ container, root });
  return container;
}

describe("PermissionAwareIntelligenceSection", () => {
  it("renders the English opening and the access-before-retrieval message", () => {
    const container = render("en");
    const section = container.querySelector("section#permission-aware");
    expect(section).not.toBeNull();

    const text = container.textContent ?? "";

    // Opening
    expect(text).toContain("Permission-aware intelligence");
    expect(text).toContain("Company knowledge should respect");
    expect(text).toContain("company boundaries.");
    expect(text).toContain("DocuMind applies tenant, role, department, and document access rules");

    // One identity with its resolved scope
    expect(text).toContain("User access context");
    expect(text).toContain("Support Manager");
    expect(text).toContain("ACME Corp");
    expect(text).toContain("Support scope");
    expect(text).toContain("Role access");
    expect(text).toContain("Department scope");
    expect(text).toContain("Document policy");

    // Authorized vs out-of-scope knowledge
    expect(text).toContain("Company knowledge");
    expect(text).toContain("Customer_Support_SLA.pdf");
    expect(text).toContain("Support_Runbook.pdf");
    expect(text).toContain("Security_Policy.pdf");
    expect(text).toContain("Employee_Handbook.pdf");
    expect(text).toContain("Authorized knowledge");
    expect(text).toContain("Outside current access");

    // The permission boundary resolves before retrieval
    expect(text).toContain("Authorization boundary");
    expect(text).toContain("Identity + access rules applied here");
    expect(text).toContain("Authorized for retrieval");
    expect(text).toContain("The access boundary resolves first");

    // Editorial supporting block and principles
    expect(text).toContain("Access is not an afterthought.");
    expect(text).toContain("Tenant boundaries stay isolated.");
    expect(text).toContain("Roles and departments shape accessible knowledge.");
    expect(text).toContain("Document access is enforced before retrieval.");

    // Closing
    expect(text).toContain("The right answer starts with the right access.");

    // No unresolved translation keys leak into the DOM.
    expect(text).not.toContain("landing.");
  });

  it("shows a single resolved identity — no scope switcher or admin chrome", () => {
    const container = render("en");
    const text = container.textContent ?? "";

    // No buttons at all: the section is a statement, not a configuration surface.
    expect(container.querySelectorAll("section#permission-aware button").length).toBe(0);

    // The HR identity and the legacy four-check surface are gone.
    expect(text).not.toContain("HR Specialist");
    expect(text).not.toContain("Organization scope");
    expect(text).not.toContain("Not in scope");
    expect(text).not.toContain("Eligible for retrieval");
    expect(text).not.toContain("Continues toward retrieval");
    expect(text).not.toContain("Apply boundary before retrieval");
  });

  it("mirrors the layout for Arabic and keeps filenames intact", () => {
    const container = render("ar");
    const section = container.querySelector("section#permission-aware");
    expect(section?.getAttribute("dir")).toBe("rtl");

    const text = container.textContent ?? "";
    expect(text).toContain("ذكاء يراعي صلاحيات الوصول");
    expect(text).toContain("معرفة شركتك يجب أن تحترم");
    expect(text).toContain("حدود الصلاحيات داخلها");
    expect(text).toContain("سياق وصول المستخدم");
    expect(text).toContain("مدير الدعم");
    expect(text).toContain("ACME Corp");
    expect(text).toContain("نطاق الدعم");
    expect(text).toContain("الوصول حسب الدور");
    expect(text).toContain("حدود الصلاحيات");
    expect(text).toContain("المعرفة المصرّح بها");
    expect(text).toContain("الصلاحيات ليست خطوة لاحقة");
    expect(text).toContain("تظل معرفة كل مؤسسة معزولة عن غيرها");
    expect(text).toContain("الإجابة الموثوقة تبدأ من نطاق وصول صحيح.");

    // Document names stay LTR and readable inside the RTL document.
    expect(text).toContain("Customer_Support_SLA.pdf");
    expect(text).toContain("Support_Runbook.pdf");
    expect(text).toContain("Security_Policy.pdf");
    expect(text).toContain("Employee_Handbook.pdf");
    expect(text).toContain("Procurement_Policy.pdf");

    expect(text).not.toContain("landing.");
  });

  it("resolves only the authorized source as eligible for retrieval", () => {
    const container = render("en");
    const text = container.textContent ?? "";

    // The eligible source is the one that crossed the boundary.
    expect(text).toContain("Authorized for retrieval");
    expect(text).toContain("Customer_Support_SLA.pdf");

    // The permission message is present as a boundary, applied before search.
    expect(text).toContain("Identity + access rules applied here");
    expect(text).not.toContain("landing.");
  });
});