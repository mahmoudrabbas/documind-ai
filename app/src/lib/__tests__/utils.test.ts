import { describe, it, expect } from "vitest";
import { cn, formatDate, formatRelativeTime, truncate, sleep } from "../utils";

/* ── cn() ──────────────────────────────────────────────── */

describe("cn", () => {
  it("merges multiple string classes", () => {
    expect(cn("px-4", "py-2")).toBe("px-4 py-2");
  });

  it("drops falsy values", () => {
    const showHidden = false;
    expect(cn("base", showHidden && "hidden", null, undefined, 0 as unknown as string)).toBe("base");
  });

  it("handles conditional classes (boolean)", () => {
    const isActive = true;
    const isInactive = false;
    expect(cn("base", isActive && "active")).toBe("base active");
    expect(cn("base", isInactive && "inactive")).toBe("base");
  });

  it("resolves Tailwind conflicts via twMerge (last wins)", () => {
    expect(cn("px-4", "px-8")).toBe("px-8");
  });

  it("resolves color conflicts", () => {
    expect(cn("text-red-500", "text-blue-600")).toBe("text-blue-600");
  });

  it("resolves padding conflicts selectively", () => {
    expect(cn("p-4", "px-8")).toBe("p-4 px-8");
  });

  it("handles object syntax", () => {
    expect(cn({ "bg-blue-500": true, hidden: false })).toBe("bg-blue-500");
  });

  it("handles arrays", () => {
    expect(cn(["a", "b"])).toBe("a b");
  });

  it("handles nested arrays", () => {
    expect(cn(["a", ["b", "c"]])).toBe("a b c");
  });

  it("handles mixed arrays and objects", () => {
    expect(cn(["a", { b: true, c: false }])).toBe("a b");
  });

  it("returns empty string for no args", () => {
    expect(cn()).toBe("");
  });

  it("allows className prop to override base styles", () => {
    expect(cn("p-4", "p-2")).toBe("p-2");
  });

  it("merges non-conflicting classes from both args", () => {
    const result = cn("p-4 text-red-500", "bg-blue-500");
    expect(result).toContain("p-4");
    expect(result).toContain("text-red-500");
    expect(result).toContain("bg-blue-500");
  });
});

/* ── formatDate() ──────────────────────────────────────── */

describe("formatDate", () => {
  it("formats a Date object", () => {
    const d = new Date(2026, 0, 15); // Jan 15, 2026
    expect(formatDate(d)).toBe("Jan 15, 2026");
  });

  it("formats an ISO string", () => {
    expect(formatDate("2026-06-01T12:00:00Z")).toBe("Jun 1, 2026");
  });

  it("formats a timestamp number", () => {
    expect(formatDate(1767052800000)).toMatch(/^\w{3} \d{1,2}, \d{4}$/);
  });

  it("respects custom options overriding defaults", () => {
    const d = new Date(2026, 11, 25);
    expect(formatDate(d, { day: undefined, month: "long", year: "numeric" })).toBe("December 2026");
  });
});

/* ── formatRelativeTime() ──────────────────────────────── */

describe("formatRelativeTime", () => {
  it('returns "just now" for dates less than 60s ago', () => {
    expect(formatRelativeTime(new Date())).toBe("just now");
  });

  it('returns "5m ago" for 5 minutes ago', () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    expect(formatRelativeTime(fiveMinAgo)).toBe("5m ago");
  });

  it('returns "2h ago" for 2 hours ago', () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 3600 * 1000);
    expect(formatRelativeTime(twoHoursAgo)).toBe("2h ago");
  });

  it('returns "3d ago" for 3 days ago', () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 86400 * 1000);
    expect(formatRelativeTime(threeDaysAgo)).toBe("3d ago");
  });

  it("returns a formatted date for 2 weeks ago", () => {
    const twoWeeksAgo = new Date(Date.now() - 14 * 86400 * 1000);
    const result = formatRelativeTime(twoWeeksAgo);
    expect(result).toMatch(/^\w{3} \d{1,2}, \d{4}$/);
  });
});

/* ── truncate() ────────────────────────────────────────── */

describe("truncate", () => {
  it("returns the string unchanged when shorter than maxLength", () => {
    expect(truncate("hello", 10)).toBe("hello");
  });

  it("truncates and appends ellipsis", () => {
    expect(truncate("hello world", 5)).toBe("hello…");
  });

  it("truncates at a word boundary", () => {
    expect(truncate("hello world foo", 10)).toBe("hello…");
  });

  it("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });

  it("handles string equal to maxLength", () => {
    expect(truncate("hello", 5)).toBe("hello");
  });
});

/* ── sleep() ───────────────────────────────────────────── */

describe("sleep", () => {
  it("resolves after the specified ms", async () => {
    const start = Date.now();
    await sleep(30);
    expect(Date.now() - start).toBeGreaterThanOrEqual(25);
  });
});
