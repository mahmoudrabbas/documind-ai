// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
} from "vitest";
import { render, screen, fireEvent, act, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { I18nProvider } from "@/providers/i18n-provider";
import {
  ToastProvider,
  useToasts,
  EXIT_ANIMATION_MS,
  type ToastOptions,
} from "@/providers/toast-provider";
import { Toaster } from "../Toaster";

function PushHarness({ options }: { options: ToastOptions }) {
  const { toast } = useToasts();
  return (
    <button type="button" onClick={() => toast(options)}>
      push
    </button>
  );
}

function renderToaster(options: ToastOptions) {
  return render(
    <I18nProvider>
      <ToastProvider>
        <PushHarness options={options} />
        <Toaster />
      </ToastProvider>
    </I18nProvider>,
  );
}

describe("Toaster", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("renders nothing until a toast is pushed", () => {
    renderToaster({ title: "Hello" });
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("renders a toast with title and description", () => {
    renderToaster({ title: "Document ready", description: "OCR finished." });

    fireEvent.click(screen.getByRole("button", { name: "push" }));

    expect(screen.getByText("Document ready")).toBeInTheDocument();
    expect(screen.getByText("OCR finished.")).toBeInTheDocument();
  });

  it("uses role=status for info toasts and role=alert for errors", () => {
    const info = renderToaster({ title: "Info" });
    fireEvent.click(within(info.container).getByRole("button", { name: "push" }));
    expect(within(info.container).getByRole("status")).toBeInTheDocument();

    const error = renderToaster({ title: "Error", variant: "error" });
    fireEvent.click(within(error.container).getByRole("button", { name: "push" }));
    expect(within(error.container).getByRole("alert")).toBeInTheDocument();
    expect(within(error.container).queryByRole("status")).not.toBeInTheDocument();
  });

  it("dismisses a toast when the close button is clicked", () => {
    renderToaster({ title: "Dismiss me" });

    fireEvent.click(screen.getByRole("button", { name: "push" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    // The card stays in the DOM while its exit animation plays…
    const card = screen.getByText("Dismiss me").closest("[data-testid]")!;
    expect(card).toHaveClass("animate-toast-out");

    // …and is removed once the animation finishes.
    act(() => {
      vi.advanceTimersByTime(EXIT_ANIMATION_MS + 1);
    });

    expect(screen.queryByText("Dismiss me")).not.toBeInTheDocument();
  });

  it("runs onAction when the action button is clicked", () => {
    const onAction = vi.fn();
    renderToaster({
      title: "Retry",
      actionLabel: "View",
      onAction,
    });

    fireEvent.click(screen.getByRole("button", { name: "push" }));
    fireEvent.click(screen.getByRole("button", { name: "View" }));

    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("auto-dismisses after the configured duration", () => {
    renderToaster({ title: "Timed", durationMs: 5_000 });

    fireEvent.click(screen.getByRole("button", { name: "push" }));
    expect(screen.getByText("Timed")).toBeInTheDocument();

    act(() => {
      vi.advanceTimersByTime(5_001 + EXIT_ANIMATION_MS);
    });

    expect(screen.queryByText("Timed")).not.toBeInTheDocument();
  });

  it("keeps a toast alive when durationMs is 0", () => {
    renderToaster({ title: "Sticky", durationMs: 0 });

    fireEvent.click(screen.getByRole("button", { name: "push" }));

    act(() => {
      vi.advanceTimersByTime(60_000);
    });

    expect(screen.getByText("Sticky")).toBeInTheDocument();
  });
});
