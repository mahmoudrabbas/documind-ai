import { describe, expect, it } from "vitest";
import { calculateRemainingRefundableMinor } from "../refund-balances.js";

describe("system settlement balances", () => {
  it("does not treat retained consumed value as refundable", () => {
    expect(calculateRemainingRefundableMinor({ amountPaidMinor: 1000, retainedConsumedMinor: 1, confirmedRefundedMinor: 999, pendingReservedMinor: 0 })).toBe(0);
  });

  it("keeps gross unrefunded cents out of the customer balance", () => {
    expect(calculateRemainingRefundableMinor({ amountPaidMinor: 200, retainedConsumedMinor: 1, confirmedRefundedMinor: 199, pendingReservedMinor: 0 })).toBe(0);
  });

  it("subtracts prior refunds and pending reservations exactly once", () => {
    expect(calculateRemainingRefundableMinor({ amountPaidMinor: 1000, retainedConsumedMinor: 10, confirmedRefundedMinor: 500, pendingReservedMinor: 490 })).toBe(0);
  });

  it("never returns a negative balance", () => {
    expect(calculateRemainingRefundableMinor({ amountPaidMinor: 1000, retainedConsumedMinor: 1, confirmedRefundedMinor: 1000, pendingReservedMinor: 10 })).toBe(0);
  });
});
