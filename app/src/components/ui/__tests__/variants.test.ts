import { describe, it, expect } from "vitest";
import {
  getButtonClasses,
  getBadgeClasses,
  resolveBadgeStatus,
} from "../variants";

describe("getButtonClasses", () => {
  it("returns primary/md classes by default", () => {
    const classes = getButtonClasses();
    expect(classes).toContain("bg-primary");
    expect(classes).toContain("h-10");
  });

  it("resolves each documented variant to a distinct class set", () => {
    expect(getButtonClasses("secondary")).toContain("bg-surface-container-lowest");
    expect(getButtonClasses("ghost")).toContain("bg-transparent");
    expect(getButtonClasses("outline")).toContain("border");
    expect(getButtonClasses("danger")).toContain("bg-error");
    expect(getButtonClasses("warning")).toContain("bg-warning");
  });

  it("resolves each documented size to a distinct class set", () => {
    expect(getButtonClasses("primary", "sm")).toContain("h-8");
    expect(getButtonClasses("primary", "lg")).toContain("h-12");
  });

  it("falls back to primary/md for invalid variant/size instead of throwing", () => {
    expect(() => getButtonClasses("not-a-variant", "not-a-size")).not.toThrow();
    const classes = getButtonClasses("not-a-variant", "not-a-size");
    expect(classes).toContain("bg-primary");
    expect(classes).toContain("h-10");
  });

  it("falls back to primary/md for non-string input", () => {
    const classes = getButtonClasses(undefined, null);
    expect(classes).toContain("bg-primary");
    expect(classes).toContain("h-10");
  });

  it("primary button has white readable text on dark background", () => {
    const classes = getButtonClasses("primary");
    expect(classes).toContain("text-on-primary");
    expect(classes).toContain("bg-primary");
  });

  it("secondary button has dark readable text on light background", () => {
    const classes = getButtonClasses("secondary");
    expect(classes).toContain("text-primary");
    expect(classes).toContain("bg-surface-container-lowest");
    expect(classes).toContain("border");
  });

  it("warning button has white readable text on amber background", () => {
    const classes = getButtonClasses("warning");
    expect(classes).toContain("text-on-warning");
    expect(classes).toContain("bg-warning");
  });

  it("danger button has white readable text on red background", () => {
    const classes = getButtonClasses("danger");
    expect(classes).toContain("text-on-error");
    expect(classes).toContain("bg-error");
  });

  it("disabled buttons have clear visual disabled treatment", () => {
    const primary = getButtonClasses("primary");
    expect(primary).toContain("disabled:bg-surface-container-high");
    expect(primary).toContain("disabled:cursor-not-allowed");

    const secondary = getButtonClasses("secondary");
    expect(secondary).toContain("disabled:bg-surface-container");
    expect(secondary).toContain("disabled:cursor-not-allowed");

    const danger = getButtonClasses("danger");
    expect(danger).toContain("disabled:bg-error/20");
    expect(danger).toContain("disabled:cursor-not-allowed");

    const warning = getButtonClasses("warning");
    expect(warning).toContain("disabled:bg-warning/20");
    expect(warning).toContain("disabled:cursor-not-allowed");
  });

  it("all button variants include focus-visible ring", () => {
    expect(getButtonClasses("primary")).toContain("focus-visible:ring");
    expect(getButtonClasses("secondary")).toContain("focus-visible:ring");
    expect(getButtonClasses("ghost")).toContain("focus-visible:ring");
    expect(getButtonClasses("outline")).toContain("focus-visible:ring");
    expect(getButtonClasses("danger")).toContain("focus-visible:ring");
    expect(getButtonClasses("warning")).toContain("focus-visible:ring");
  });

  it("danger variant is NOT used for non-destructive actions like archive or preview", () => {
    const dangerClasses = getButtonClasses("danger");
    const secondaryClasses = getButtonClasses("secondary");
    const ghostClasses = getButtonClasses("ghost");
    expect(dangerClasses).toContain("bg-error");
    expect(secondaryClasses).not.toContain("bg-error");
    expect(ghostClasses).not.toContain("bg-error");
  });
});

describe("resolveBadgeStatus", () => {
  it("maps known status words to their semantic status, case-insensitively", () => {
    expect(resolveBadgeStatus("Ready")).toBe("success");
    expect(resolveBadgeStatus("PROCESSING")).toBe("warning");
    expect(resolveBadgeStatus("failed")).toBe("error");
    expect(resolveBadgeStatus("Reviewed")).toBe("info");
  });

  it("trims surrounding whitespace before matching", () => {
    expect(resolveBadgeStatus("  active  ")).toBe("success");
  });

  it("falls back to neutral for unknown labels", () => {
    expect(resolveBadgeStatus("archived")).toBe("neutral");
    expect(resolveBadgeStatus("")).toBe("neutral");
  });

  it("falls back to neutral for non-string input without throwing", () => {
    expect(resolveBadgeStatus(undefined)).toBe("neutral");
    expect(resolveBadgeStatus(null)).toBe("neutral");
    expect(resolveBadgeStatus(404)).toBe("neutral");
    expect(resolveBadgeStatus({})).toBe("neutral");
  });

  it("maps new status words to correct semantic statuses", () => {
    expect(resolveBadgeStatus("current")).toBe("success");
    expect(resolveBadgeStatus("clean")).toBe("success");
    expect(resolveBadgeStatus("allowed")).toBe("success");
    expect(resolveBadgeStatus("uploaded")).toBe("warning");
    expect(resolveBadgeStatus("denied")).toBe("error");
    expect(resolveBadgeStatus("inherited")).toBe("info");
  });
});

describe("getBadgeClasses", () => {
  it("accepts an explicit semantic status", () => {
    expect(getBadgeClasses("error")).toContain("bg-error-container");
  });

  it("accepts a free-text label and resolves it the same way resolveBadgeStatus would", () => {
    expect(getBadgeClasses("Answered")).toBe(getBadgeClasses("success"));
    expect(getBadgeClasses("Refused")).toBe(getBadgeClasses("error"));
  });

  it("never throws for unexpected input", () => {
    expect(() => getBadgeClasses("totally-unknown-status")).not.toThrow();
    expect(getBadgeClasses("totally-unknown-status")).toContain(
      "bg-surface-container-high",
    );
  });

  it("badge status classes include ring for visual consistency", () => {
    expect(getBadgeClasses("success")).toContain("ring-1");
    expect(getBadgeClasses("error")).toContain("ring-1");
    expect(getBadgeClasses("warning")).toContain("ring-1");
    expect(getBadgeClasses("info")).toContain("ring-1");
    expect(getBadgeClasses("neutral")).toContain("ring-1");
  });
});
