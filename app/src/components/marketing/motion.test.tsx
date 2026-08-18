// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
import { act, useRef } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useRevealOnView } from "./motion";

const mounted: Array<{ container: HTMLElement; root: ReturnType<typeof createRoot> }> = [];

afterEach(() => {
  for (const item of mounted.splice(0)) {
    act(() => item.root.unmount());
    item.container.remove();
  }
  vi.unstubAllGlobals();
});

function Probe() {
  const ref = useRef<HTMLDivElement>(null);
  const { revealed, reducedMotion } = useRevealOnView(ref);
  return <div ref={ref} data-revealed={revealed} data-reduced={reducedMotion} />;
}

function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Probe />));
  mounted.push({ container, root });
  return container.firstElementChild as HTMLElement;
}

describe("useRevealOnView", () => {
  it("renders the resolved state immediately for reduced motion", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: true,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });

    const probe = render();
    expect(probe.dataset.revealed).toBe("true");
    expect(probe.dataset.reduced).toBe("true");
  });

  it("falls back to visible content when IntersectionObserver is unavailable", () => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockReturnValue({
        matches: false,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
      }),
    });
    vi.stubGlobal("IntersectionObserver", undefined);

    const probe = render();
    expect(probe.dataset.revealed).toBe("true");
    expect(probe.dataset.reduced).toBe("false");
  });
});
