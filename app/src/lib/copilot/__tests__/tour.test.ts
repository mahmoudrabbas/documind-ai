import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  TOUR_OFFER_WINDOW_DAYS,
  TOUR_FLOW_ID,
  isNewcomer,
  shouldShowTourOffer,
  markTourStarted,
  dismissTourOffer,
  markTourCompleted,
} from "@/lib/copilot/tour";

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse("2026-01-01T00:00:00.000Z");

function createdAtDaysAgo(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString();
}

function storageKey(flag: "started" | "dismissed" | "completed"): string {
  return `documind.tour.user-1.${flag}`;
}

function installWindowStorage() {
  const store = new Map<string, string>();
  const stub = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, value),
    removeItem: (key: string) => void store.delete(key),
    clear: () => store.clear(),
    key: (index: number) => [...store.keys()][index] ?? null,
    get length() {
      return store.size;
    },
  };
  Object.defineProperty(globalThis, "window", {
    value: { localStorage: stub },
    configurable: true,
    writable: true,
  });
}

describe("tour newcomer detection", () => {
  it("treats accounts younger than the window as newcomers", () => {
    expect(isNewcomer(createdAtDaysAgo(0), NOW)).toBe(true);
    expect(isNewcomer(createdAtDaysAgo(TOUR_OFFER_WINDOW_DAYS - 1), NOW)).toBe(true);
  });

  it("treats accounts older than the window as not newcomers", () => {
    expect(isNewcomer(createdAtDaysAgo(TOUR_OFFER_WINDOW_DAYS), NOW)).toBe(false);
    expect(isNewcomer(createdAtDaysAgo(365), NOW)).toBe(false);
  });

  it("rejects invalid dates and future dates", () => {
    expect(isNewcomer("not-a-date", NOW)).toBe(false);
    expect(isNewcomer(new Date(NOW + DAY_MS).toISOString(), NOW)).toBe(false);
  });

  it("exposes the tour flow id and window for the panel", () => {
    expect(TOUR_FLOW_ID).toBe("platform.tour");
    expect(TOUR_OFFER_WINDOW_DAYS).toBe(30);
  });
});

describe("tour offer flags", () => {
  beforeEach(() => {
    installWindowStorage();
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, "window");
  });

  it("shows the offer for a newcomer with no flags", () => {
    expect(shouldShowTourOffer("user-1", createdAtDaysAgo(2), NOW)).toBe(true);
  });

  it("hides the offer for non-newcomers", () => {
    expect(shouldShowTourOffer("user-1", createdAtDaysAgo(200), NOW)).toBe(false);
  });

  it("hides the offer after starting, dismissing, or completing", () => {
    expect(shouldShowTourOffer("user-1", createdAtDaysAgo(2), NOW)).toBe(true);

    markTourStarted("user-1");
    expect(window.localStorage.getItem(storageKey("started"))).toBe("1");
    expect(shouldShowTourOffer("user-1", createdAtDaysAgo(2), NOW)).toBe(false);
    window.localStorage.clear();

    dismissTourOffer("user-1");
    expect(window.localStorage.getItem(storageKey("dismissed"))).toBe("1");
    expect(shouldShowTourOffer("user-1", createdAtDaysAgo(2), NOW)).toBe(false);
    window.localStorage.clear();

    markTourCompleted("user-1");
    expect(window.localStorage.getItem(storageKey("completed"))).toBe("1");
    expect(shouldShowTourOffer("user-1", createdAtDaysAgo(2), NOW)).toBe(false);
  });

  it("scopes flags per user id", () => {
    markTourStarted("user-1");
    expect(shouldShowTourOffer("user-2", createdAtDaysAgo(2), NOW)).toBe(true);
  });
});
