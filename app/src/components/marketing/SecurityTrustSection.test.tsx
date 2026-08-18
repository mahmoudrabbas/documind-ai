// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { SecurityTrustSection } from "./SecurityTrustSection";

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
        <SecurityTrustSection />
      </I18nProvider>,
    );
  });
  mounted.push({ container, root });
  return container;
}

describe("SecurityTrustSection", () => {
  it("renders the English section with the stable security anchor", () => {
    const container = render("en");
    const section = container.querySelector("section#security");
    expect(section).not.toBeNull();
    expect(section?.getAttribute("dir")).toBe("ltr");

    const text = container.textContent ?? "";

    // Opening
    expect(text).toContain("Security & Trust");
    expect(text).toContain("Your company knowledge");
    expect(text).toContain("should stay");
    expect(text).toContain("your company knowledge.");
    expect(text).toContain("organizational isolation, controlled access");

    // Two illustrative organizations
    expect(text).toContain("ACME Corp");
    expect(text).toContain("Northstar Ltd");
    expect(text).toContain("Isolated scope");

    // Tenant-isolation story
    expect(text).toContain("Organization boundary");
    expect(text).toContain("One platform. Separate knowledge spaces.");

    // Controlled-access story
    expect(text).toContain("Access follows the organization");
    expect(text).toContain("assigned scope");

    // Audit / trace story — the events the platform actually records
    expect(text).toContain("Activity trace");
    expect(text).toContain("Recorded in the platform audit log.");
    expect(text).toContain("Knowledge queried");
    expect(text).toContain("Authorized source retrieved");
    expect(text).toContain("Document indexed");

    // Traceable knowledge nods to section 5 without duplicating it
    expect(text).toContain("Traceable knowledge");
    expect(text).toContain("Verified source");

    // Three principles
    expect(text).toContain("Organization boundaries stay isolated.");
    expect(text).toContain("Access follows identity and scope.");
    expect(text).toContain("Important activity stays traceable.");

    // Closing
    expect(text).toContain("Trust is not one feature.");
    expect(text).toContain("It is how the system is built.");

    // No unresolved translation keys leak into the DOM.
    expect(text).not.toContain("landing.");
  });

  it("mirrors the layout for Arabic and keeps identifiers intact", () => {
    const container = render("ar");
    const section = container.querySelector("section#security");
    expect(section).not.toBeNull();
    expect(section?.getAttribute("dir")).toBe("rtl");

    const text = container.textContent ?? "";

    expect(text).toContain("الأمان والثقة");
    expect(text).toContain("معرفة شركتك");
    expect(text).toContain("يجب أن تبقى");
    expect(text).toContain("داخل نطاق شركتك.");

    // Tenant-isolation story in Arabic
    expect(text).toContain("حدود المؤسسة");
    expect(text).toContain("نطاق معزول");
    expect(text).toContain("منصة واحدة. مساحات معرفية منفصلة.");

    // Controlled access
    expect(text).toContain("يتبع الوصول نطاق المؤسسة والصلاحيات الممنوحة للمستخدم.");

    // Audit trace
    expect(text).toContain("سجل النشاط");
    expect(text).toContain("يُسجَّل ذلك في سجل تدقيق المنصة.");
    expect(text).toContain("استعلام عن المعرفة");

    // Company names and filenames stay Latin/LTR and readable
    expect(text).toContain("ACME Corp");
    expect(text).toContain("Northstar Ltd");
    expect(text).toContain("Customer_Support_SLA.pdf");
    expect(text).toContain("Operations_Manual.pdf");
    expect(text).toContain("Supplier_Policy.pdf");

    // Principles + closing
    expect(text).toContain("تظل حدود كل مؤسسة معزولة عن غيرها.");
    expect(text).toContain("يرتبط الوصول بهوية المستخدم ونطاق صلاحياته.");
    expect(text).toContain("تبقى الأنشطة المهمة قابلة للتتبّع.");
    expect(text).toContain("الثقة ليست ميزة منفردة،");
    expect(text).toContain("بل جزء من طريقة بناء النظام.");

    expect(text).not.toContain("landing.");
  });

  it("renders two isolated organizational regions with no cross-organization connector", () => {
    const container = render("en");
    const regions = Array.from(container.querySelectorAll("section#security [data-org]"));
    expect(regions.length).toBe(2);

    const ids = regions.map((r) => r.getAttribute("data-org"));
    expect(ids).toEqual(["acme", "northstar"]);

    // Each region carries its own documents and users, and an isolated-scope marker
    for (const region of regions) {
      expect(region.querySelector('[dir="ltr"]')).not.toBeNull();
      expect(region.textContent).toContain("Isolated scope");
      expect(region.textContent).toContain("Knowledge");
      expect(region.textContent).toContain("Users");
    }

    // The boundary label exists as the isolation story
    expect(container.textContent).toContain("Organization boundary");

    // No line/element literally bridges the two regions' content rows: each
    // region is a sibling node in the layout, with the boundary between them.
    const acme = container.querySelector('[data-org="acme"]');
    const northstar = container.querySelector('[data-org="northstar"]');
    expect(acme).not.toBeNull();
    expect(northstar).not.toBeNull();
    expect(acme?.nextElementSibling).not.toBe(northstar);
  });

  it("keeps the audit trace to the three supported activity rows", () => {
    const container = render("en");
    const rows = Array.from(container.querySelectorAll("section#security [data-trace-row]"));
    expect(rows.length).toBe(3);
    const ids = rows.map((r) => r.getAttribute("data-trace-row"));
    expect(ids).toEqual(["queried", "retrieved", "indexed"]);

    // Every row has an LTR timestamp and an LTR identifier where one is present
    for (const row of rows) {
      expect(row.querySelector('[dir="ltr"]')).not.toBeNull();
    }
    expect(container.querySelectorAll('section#security [dir="ltr"]').length).toBeGreaterThan(0);
  });

  it("uses editorial ruled rows for the three trust principles, not cards", () => {
    const container = render("en");
    const principles = Array.from(container.querySelectorAll("section#security [data-principle]"));
    expect(principles.length).toBe(3);

    // The section heading is the only h2; principles are h3s.
    const h2s = Array.from(container.querySelectorAll("section#security h2"));
    const h3s = Array.from(container.querySelectorAll("section#security h3"));
    expect(h2s.length).toBe(1);
    expect(h3s.length).toBe(3);
  });
});