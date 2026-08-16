// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { QuotaProgressBar, formatStorageMb } from "../QuotaProgressBar";

/* Resolve against the real English dictionary rather than echoing keys, so
   the rendered copy (including the translated "MB" unit) is verified. */
vi.mock("@/providers/i18n-provider", async () => {
  const { default: dictionaries } = await import("@/lib/i18n/translations");
  const utils = await import("@/lib/i18n/i18n.utils");
  return {
    useI18n: () => ({
      locale: "en" as const,
      dir: "ltr" as const,
      t: (key: string, params?: Record<string, string>) =>
        utils.t(dictionaries.en, key, params),
      tPlural: () => "",
    }),
    useIntlLocale: () => "en-US",
  };
});

function renderBar(dimension: string, current: number, limit: number) {
  return render(
    <QuotaProgressBar label="Label" current={current} limit={limit} dimension={dimension} />,
  );
}

/** Text of the "X / Y" usage row (the last flex row inside the card). */
function detailText(container: HTMLElement): string | null {
  const rows = container.querySelectorAll(
    "div.flex.items-center.justify-between",
  );
  const detail = rows[rows.length - 1];
  return detail ? detail.textContent : null;
}

describe("formatStorageMb", () => {
  it("keeps fractional megabytes and trims trailing zeros", () => {
    expect(formatStorageMb(0.21, "en-US")).toBe("0.21");
    expect(formatStorageMb(0, "en-US")).toBe("0");
    expect(formatStorageMb(1, "en-US")).toBe("1");
    expect(formatStorageMb(1.5, "en-US")).toBe("1.5");
    expect(formatStorageMb(25.34, "en-US")).toBe("25.34");
    expect(formatStorageMb(1.0, "en-US")).toBe("1");
    expect(formatStorageMb(25.0, "en-US")).toBe("25");
  });

  it("groups thousands on the quota limit", () => {
    expect(formatStorageMb(1000, "en-US")).toBe("1,000");
    expect(formatStorageMb(1000.5, "en-US")).toBe("1,000.5");
  });

  it("never emits NaN or Infinity", () => {
    expect(formatStorageMb(Number.NaN, "en-US")).toBe("0");
    expect(formatStorageMb(Number.POSITIVE_INFINITY, "en-US")).toBe("0");
  });
});

describe("QuotaProgressBar storageMb display", () => {
  it("renders the fractional value with the MB unit and a grouped limit", () => {
    const { container } = renderBar("storageMb", 0.21, 1000);

    expect(screen.getByText("0.21")).toBeTruthy();
    expect(detailText(container)).toBe("0.21 / 1,000 MB");
  });

  it("renders whole-MB storage values without a decimal point", () => {
    const { container } = renderBar("storageMb", 1, 1000);
    expect(detailText(container)).toBe("1 / 1,000 MB");
  });

  it("calculates the progress from the raw value, not a rounded display value", () => {
    const { container } = renderBar("storageMb", 0.21, 1000);

    const bar = container.querySelector('[role="progressbar"]');
    const fill = container.querySelector('[role="progressbar"] > div');

    // aria-valuenow carries the raw fractional usage.
    expect(bar?.getAttribute("aria-valuenow")).toBe("0.21");
    expect(bar?.getAttribute("aria-valuemax")).toBe("1000");

    // 0.21 / 1000 * 100 = 0.021% — a rounded "0" current would render 0%.
    const width = fill ? parseFloat((fill as HTMLElement).style.width) : 0;
    expect(width).toBeCloseTo(0.021, 4);
    expect(width).not.toBe(0);
  });
});

describe("QuotaProgressBar non-storage dimensions", () => {
  it("keeps the historical whole-number rounding and omits the MB unit", () => {
    const { container } = renderBar("queriesPerMonth", 1.5, 100);

    expect(detailText(container)).toBe("2 / 100");
    expect(screen.queryByText(/MB/)).toBeNull();

    const bar = container.querySelector('[role="progressbar"]');
    expect(bar?.getAttribute("aria-valuenow")).toBe("1.5");
  });

  it("renders an unlimited quota without a limit value", () => {
    renderBar("documents", 3, 0);
    expect(screen.getByText("3")).toBeTruthy();
    expect(screen.queryByText(/MB/)).toBeNull();
  });
});