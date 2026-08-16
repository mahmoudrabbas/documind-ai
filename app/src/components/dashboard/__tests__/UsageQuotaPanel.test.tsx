// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import UsageQuotaPanel from "../UsageQuotaPanel";

/* ── Module mocks (hoisted by vitest) ───────────────────────────────── */

/* Resolve against the real English dictionary rather than echoing keys, so
   the assertions below check rendered copy instead of a passthrough stub. */
vi.mock("@/providers/i18n-provider", async () => {
  const { default: dictionaries } = await import("@/lib/i18n/translations");
  const utils = await import("@/lib/i18n/i18n.utils");
  return {
    useI18n: () => ({
      locale: "en" as const,
      dir: "ltr" as const,
      t: (key: string, params?: Record<string, string>) =>
        utils.t(dictionaries.en, key, params),
      tPlural: (key: string, count: number, params?: Record<string, string>) =>
        utils.tPlural(dictionaries.en, "en", key, count, params),
      setLocale: vi.fn(),
    }),
    useIntlLocale: () => "en-US",
  };
});
vi.mock("@/services/entitlement.service", () => ({
  getCompanyUsage: vi.fn(),
}));

/* ── Imports (resolved after hoisted mocks) ─────────────────────────── */

import { getCompanyUsage } from "@/services/entitlement.service";

/* ── Helpers ────────────────────────────────────────────────────────── */

const MB = 1024 * 1024;

function usageResponse(opts: {
  storageLimitMb: number;
  storageUsedMb: number;
  documents?: number;
  documentLimit?: number;
  questions?: number;
}) {
  return {
    success: true as const,
    data: {
      current: {},
      limit: {
        documents: opts.documentLimit ?? 100,
        storageMb: opts.storageLimitMb,
        queriesPerMonth: 500,
      },
      actual: {
        documents: opts.documents ?? 10,
        storageBytes: opts.storageUsedMb * MB,
        questions: opts.questions ?? 4321,
      },
      periodStart: "2026-08-01T00:00:00.000Z",
      periodEnd: null,
    },
  };
}

async function renderAndSettle() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  await act(async () => {
    root.render(<UsageQuotaPanel />);
  });
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  return { container, root };
}

/* ── Tests ──────────────────────────────────────────────────────────── */

describe("UsageQuotaPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Regression: usage was divided by 1024 while the limit's base was inferred
   * per plan, so a tenant at exactly 100% of a decimal-authored plan read
   * "4.9 GB / 5 GB" beside a full progress bar.
   */
  it("renders a full decimal-authored storage quota as equal figures", async () => {
    (getCompanyUsage as Mock).mockResolvedValue(
      usageResponse({ storageLimitMb: 5000, storageUsedMb: 5000 }),
    );

    const { container, root } = await renderAndSettle();
    const text = container.textContent ?? "";

    expect(text).toContain("5 GB / 5 GB");
    expect(text).not.toContain("4.9 GB");

    await act(async () => root.unmount());
  });

  it("keeps a binary-authored plan on the binary base for both figures", async () => {
    (getCompanyUsage as Mock).mockResolvedValue(
      usageResponse({ storageLimitMb: 5120, storageUsedMb: 5120 }),
    );

    const { container, root } = await renderAndSettle();
    expect(container.textContent).toContain("5 GB / 5 GB");

    await act(async () => root.unmount());
  });

  /**
   * Regression: the questions row suppresses its limit because the figure is
   * an all-time total with no comparable monthly cap. Labelling that
   * "Unlimited" asserted the plan had no cap, which is not what it means.
   */
  it("labels the uncapped questions row as an all-time total, not unlimited", async () => {
    (getCompanyUsage as Mock).mockResolvedValue(
      usageResponse({ storageLimitMb: 5000, storageUsedMb: 100 }),
    );

    const { container, root } = await renderAndSettle();
    const text = container.textContent ?? "";

    expect(text).toContain("All-time total");
    expect(text).not.toContain("Unlimited");

    await act(async () => root.unmount());
  });

  it("shows a progress bar only for capped dimensions", async () => {
    (getCompanyUsage as Mock).mockResolvedValue(
      usageResponse({ storageLimitMb: 5000, storageUsedMb: 2500 }),
    );

    const { container, root } = await renderAndSettle();

    // documents + storage are capped; questions is not.
    const bars = container.querySelectorAll('[role="progressbar"]');
    expect(bars).toHaveLength(2);

    await act(async () => root.unmount());
  });
});
