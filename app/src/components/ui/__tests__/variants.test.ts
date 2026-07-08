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
    expect(getButtonClasses("secondary")).toContain("bg-on-tertiary-container");
    expect(getButtonClasses("ghost")).toContain("bg-transparent");
    expect(getButtonClasses("outline")).toContain("border");
    expect(getButtonClasses("danger")).toContain("bg-error");
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
});
