// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { FinalCtaSection } from "./FinalCtaSection";

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
        <FinalCtaSection />
      </I18nProvider>,
    );
  });
  mounted.push({ container, root });
  return container;
}

function link(container: HTMLElement, href: string) {
  return Array.from(container.querySelectorAll("a")).find((a) => a.getAttribute("href") === href);
}

describe("FinalCtaSection", () => {
  it("renders the English closing CTA with the get-started anchor and LTR direction", () => {
    const container = render("en");
    const section = container.querySelector("section#get-started");
    expect(section).not.toBeNull();
    expect(section?.getAttribute("dir")).toBe("ltr");

    const text = container.textContent ?? "";
    expect(text).toContain("Ready when your knowledge is");
    expect(text).toContain("Bring your company knowledge together.");
    expect(text).toContain("Make every answer easier to trust.");
    expect(text).toContain("Start building a governed knowledge workspace");

    // The signature resolution labels render from real keys.
    expect(text).toContain("Verified evidence");
    expect(text).toContain("15 minutes");

    // No unresolved translation keys leak into the DOM.
    expect(text).not.toContain("landing.");
  });

  it("renders Arabic with RTL direction and natural localized copy", () => {
    const container = render("ar");
    const section = container.querySelector("section#get-started");
    expect(section).not.toBeNull();
    expect(section?.getAttribute("dir")).toBe("rtl");

    const text = container.textContent ?? "";
    expect(text).toContain("ابدأ من معرفة شركتك");
    expect(text).toContain("اجمع معرفة شركتك في مكان واحد.");
    expect(text).toContain("واجعل كل إجابة أسهل في التحقق والثقة.");
    expect(text).toContain("ابدأ ببناء مساحة معرفة محكومة");
    expect(text).toContain("تسجيل الدخول");
    expect(text).toContain("أدلة موثّقة");
    expect(text).toContain("15 دقيقة");

    // Latin product identifiers stay intact inside the RTL document.
    expect(text).toContain("Customer_Support_SLA.pdf");

    expect(text).not.toContain("landing.");
  });

  it("uses a semantic section, an h2 heading, and aria-labelledby wiring", () => {
    const container = render("en");
    const section = container.querySelector("section#get-started");
    const h2s = Array.from(container.querySelectorAll("section#get-started h2"));
    expect(h2s.length).toBe(1);
    expect(h2s[0]?.id).toBe("get-started-heading");
    expect(section?.getAttribute("aria-labelledby")).toBe("get-started-heading");
  });

  it("primary CTA links to the real /register route", () => {
    const container = render("en");
    const cta = link(container, "/register");
    expect(cta).toBeDefined();
    expect(cta?.textContent).toContain("Start Free");
    // On dark field the primary is a light button with dark text.
    expect(cta?.getAttribute("class")).toContain("bg-white");
  });

  it("secondary Sign In links to the real /login route", () => {
    const container = render("en");
    const signIn = link(container, "/login");
    expect(signIn).toBeDefined();
    expect(signIn?.textContent).toContain("Sign in");
  });

  it("shows the verified trust line and keeps it quiet", () => {
    const container = render("en");
    const text = container.textContent ?? "";
    for (const item of ["Permission-aware", "Source-grounded", "Bilingual", "Auditable"]) {
      expect(text).toContain(item);
    }
  });

  it("renders the source filenames inside a decorative, non-semantic signature", () => {
    const container = render("en");
    const svg = container.querySelector("section#get-started svg");
    expect(svg).not.toBeNull();
    expect(svg?.getAttribute("role")).toBe("presentation");
    expect(svg?.getAttribute("aria-hidden")).toBe("true");

    const text = container.textContent ?? "";
    expect(text).toContain("Procurement_Policy.pdf");
    expect(text).toContain("Customer_Support_SLA.pdf");
    expect(text).toContain("Security_Policy.pdf");
  });

  it("does not repeat the unverified 30-day / credit-card trial claims", () => {
    const container = render("en");
    const text = container.textContent ?? "";
    expect(text).not.toContain("30-day");
    expect(text).not.toContain("30 day");
    expect(text).not.toContain("No credit card");
    expect(text).not.toContain("No commitment");
    expect(text).not.toContain("Ready to Transform");
  });

  it("keeps Arabic free of the legacy trial copy too", () => {
    const container = render("ar");
    const text = container.textContent ?? "";
    expect(text).not.toContain("30 يوم");
    expect(text).not.toContain("بطاقة ائتمان");
    expect(text).not.toContain("لا التزام");
    expect(text).not.toContain("تحويل معرفة شركتك");
  });
});