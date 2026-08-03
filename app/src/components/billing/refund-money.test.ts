import { describe, expect, it } from "vitest";
import { parseRefundAmountMinor } from "./refund-money";

describe("parseRefundAmountMinor", () => {
  it("converts 0.50 exactly to fifty minor units", () => expect(parseRefundAmountMinor("0.50", "en")).toBe(50));
  it("supports Arabic digits and decimal separator", () => expect(parseRefundAmountMinor("٠٫٥٠", "ar")).toBe(50));
  it.each(["0", "-1", "0.001", "1e2", "", "1.2.3"])("rejects invalid money %s", (value) => expect(parseRefundAmountMinor(value, "en")).toBeNull());
});
