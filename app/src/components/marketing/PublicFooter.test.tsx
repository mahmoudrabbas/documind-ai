// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { PublicFooter } from "./PublicFooter";

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
        <PublicFooter />
      </I18nProvider>,
    );
  });
  mounted.push({ container, root });
  return container;
}

function link(container: HTMLElement, href: string) {
  return Array.from(container.querySelectorAll("a")).find((item) => item.getAttribute("href") === href);
}

describe("PublicFooter", () => {
  it("renders the English footer with the current brand and verified destinations", () => {
    const container = render("en");
    const footer = container.querySelector("footer");
    const text = container.textContent ?? "";

    expect(footer?.getAttribute("dir")).toBe("ltr");
    expect(text).toContain("DocuMind AI");
    expect(text).toContain("Private, permission-aware AI for company knowledge.");
    expect(text).toContain("Product");
    expect(text).toContain("Access");
    expect(text).toContain("How it works");
    expect(text).toContain("© 2026 DocuMind AI. All rights reserved.");

    for (const href of ["#how-it-works", "#security", "#pricing", "#faq", "/register", "/login"]) {
      expect(link(container, href)).toBeDefined();
    }
    expect(container.querySelectorAll('a[href="#"]').length).toBe(0);
    expect(text).not.toMatch(/About|Blog|Careers|Contact|Privacy Policy|Terms of Service/);
    expect(text).not.toContain("landing.");
  });

  it("renders natural Arabic copy with RTL direction", () => {
    const container = render("ar");
    const footer = container.querySelector("footer");
    const text = container.textContent ?? "";

    expect(footer?.getAttribute("dir")).toBe("rtl");
    expect(text).toContain("DocuMind AI");
    expect(text).toContain("ذكاء اصطناعي خاص بمعرفة مؤسستك");
    expect(text).toContain("المنتج");
    expect(text).toContain("الوصول");
    expect(text).toContain("كيف يعمل");
    expect(text).toContain("© 2026 DocuMind AI. جميع الحقوق محفوظة.");
    expect(container.querySelectorAll('a[href="#"]').length).toBe(0);
    expect(text).not.toContain("landing.");
  });

  it("uses semantic footer navigation landmarks and focusable links", () => {
    const container = render("en");
    const footer = container.querySelector("footer");
    const navs = Array.from(container.querySelectorAll("nav"));

    expect(footer).not.toBeNull();
    expect(navs).toHaveLength(2);
    expect(navs.map((nav) => nav.getAttribute("aria-label"))).toEqual(["Product", "Access"]);
    expect(Array.from(container.querySelectorAll("a")).every((item) => item.getAttribute("href"))).toBe(true);
    expect(container.querySelectorAll("footer h1, footer h2")).toHaveLength(0);
  });
});
