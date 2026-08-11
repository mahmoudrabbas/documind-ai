// @vitest-environment jsdom
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { PlatformState } from "./platform-ui";

const localeState = vi.hoisted(() => ({ locale: "en" as "en" | "ar", t: (key: string) => key }));
vi.mock("@/providers/i18n-provider", async () => {
  const { t: translate, tPlural: pluralize } = await import("@/lib/i18n/i18n.utils");
  const dictionaries = (await import("@/lib/i18n/translations")).default;
  return {
    useI18n: () => ({
      locale: localeState.locale,
      dir: localeState.locale === "ar" ? "rtl" : "ltr",
      t: (key: string, params?: Record<string, string>) => {
        if (key === "common.loading") return "Loading";
        return translate(dictionaries[localeState.locale], key, params);
      },
      tPlural: (key: string, count: number) => pluralize(dictionaries[localeState.locale], localeState.locale, key, count),
      setLocale: vi.fn(),
    }),
    useIntlLocale: () => "en",
  };
});

function renderState(overrides: {
  loading?: boolean;
  refreshing?: boolean;
  error?: string;
  onRetry?: () => void;
}) {
  const onRetry = overrides.onRetry ?? vi.fn();
  const view = render(
    <PlatformState
      loading={overrides.loading ?? false}
      refreshing={overrides.refreshing}
      error={overrides.error ?? ""}
      onRetry={onRetry}
    />,
  );
  return { ...view, onRetry };
}

describe("PlatformState", () => {
  it("renders the full skeleton panel on initial load", () => {
    const { container } = renderState({ loading: true });

    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(3);
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("renders a subtle progress bar instead of a skeleton swap while refreshing", () => {
    const { container } = renderState({ loading: false, refreshing: true });

    expect(screen.getByRole("progressbar")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(0);
    const bar = screen.getByRole("progressbar").querySelector("div");
    expect(bar).toHaveClass("h-0.5");
    expect(bar).toHaveClass("bg-primary");
    expect(screen.getByText("Loading")).toBeInTheDocument();
  });

  it("does not render content when idle (no loading, no refreshing, no error)", () => {
    const { container } = renderState({});

    expect(container).toBeEmptyDOMElement();
  });

  it("renders the retry alert and fires onRetry on error", () => {
    const { onRetry } = renderState({
      loading: false,
      error: "Unable to load platform data. Please try again.",
    });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
