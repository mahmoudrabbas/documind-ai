import { describe, it, expect } from "vitest";
import { getInitials } from "../Avatar";

describe("getInitials", () => {
  it("returns two initials for a two-word name", () => {
    expect(getInitials("Sarah Jenkins")).toBe("SJ");
  });

  it("returns one initial for a single-word name", () => {
    expect(getInitials("Cher")).toBe("C");
  });

  it("ignores extra whitespace between words", () => {
    expect(getInitials("  Mark   Thompson  ")).toBe("MT");
  });

  it("uses only the first two words for a long name", () => {
    expect(getInitials("Jean Claude Van Damme")).toBe("JC");
  });

  it('falls back to "?" for empty or whitespace-only input', () => {
    expect(getInitials("")).toBe("?");
    expect(getInitials("   ")).toBe("?");
  });

  it('falls back to "?" for null/undefined without throwing', () => {
    expect(() => getInitials(null)).not.toThrow();
    expect(getInitials(null)).toBe("?");
    expect(getInitials(undefined)).toBe("?");
  });
});
