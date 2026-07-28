import { describe, expect, it } from "vitest";
import { formatMoneyMinor } from "./money";

describe("formatMoneyMinor", () => {
  it("formats USD cents without treating them as dollars", () => {
    expect(formatMoneyMinor(200, "USD")).toBe("$2.00");
    expect(formatMoneyMinor(1500, "USD")).toBe("$15.00");
  });
});
