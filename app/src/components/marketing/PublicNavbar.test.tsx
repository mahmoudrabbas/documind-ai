// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { PublicNavbar } from "./PublicNavbar";

vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/components/ui", () => ({
  LanguageSwitcher: (props: React.HTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props}>Language</button>
  ),
}));

const mounted: Array<{ container: HTMLElement; root: ReturnType<typeof createRoot> }> = [];

afterEach(() => {
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount());
    item.container.remove();
  }
  document.body.style.overflow = "";
  vi.restoreAllMocks();
});

function render(reducedMotion = false) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: vi.fn().mockImplementation(() => ({
      matches: reducedMotion,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  });
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => {
    root.render(
      <I18nProvider initialLocale="en">
        <PublicNavbar />
      </I18nProvider>,
    );
  });
  mounted.push({ container, root });
  return container;
}

describe("PublicNavbar", () => {
  it("closes the mobile menu with Escape and restores focus", () => {
    const container = render();
    const toggle = container.querySelector('button[aria-controls="public-nav-mobile-menu"]') as HTMLButtonElement;

    act(() => toggle.click());
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(document.body.style.overflow).toBe("hidden");

    act(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
    expect(document.body.style.overflow).toBe("");
  });

  it("uses instant anchor scrolling when reduced motion is requested", () => {
    const container = render(true);
    const target = document.createElement("section");
    target.id = "how-it-works";
    document.body.appendChild(target);
    const scrollIntoView = vi.fn();
    target.scrollIntoView = scrollIntoView;

    const solutions = Array.from(container.querySelectorAll("button")).find(
      (button) => button.textContent?.trim() === "Solutions",
    );
    act(() => solutions?.click());

    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto" });
    target.remove();
  });
});
