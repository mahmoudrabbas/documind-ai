import { describe, expect, it } from "vitest";
import { calculateRemainingRefundableMinor } from "../refund-balances.js";
import { refundInvoiceSummary } from "../refund.service.js";

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

describe("remaining refundable balance with pending retained consumption", () => {
  it("charges pending retained consumption from pending refunds against the remainder", () => {
    expect(calculateRemainingRefundableMinor({ amountPaidMinor: 500, retainedConsumedMinor: 0, pendingRetainedConsumedMinor: 12, confirmedRefundedMinor: 0, pendingReservedMinor: 488 })).toBe(0);
  });

  it("uses the higher of retained and pending retained consumption as the floor", () => {
    expect(calculateRemainingRefundableMinor({ amountPaidMinor: 500, retainedConsumedMinor: 12, pendingRetainedConsumedMinor: 13, confirmedRefundedMinor: 0, pendingReservedMinor: 400 })).toBe(87);
    expect(calculateRemainingRefundableMinor({ amountPaidMinor: 500, retainedConsumedMinor: 13, pendingRetainedConsumedMinor: 12, confirmedRefundedMinor: 0, pendingReservedMinor: 400 })).toBe(87);
  });

  it("ignores pending retained consumption when no refund carries one", () => {
    expect(calculateRemainingRefundableMinor({ amountPaidMinor: 500, retainedConsumedMinor: 0, confirmedRefundedMinor: 0, pendingReservedMinor: 400 })).toBe(100);
  });
});

describe("refund invoice summary projection", () => {
  it("reports zero remaining refundable balance for an invoice fully carved out by a reserved refund with pending retained consumption", () => {
    const summary = refundInvoiceSummary(
      { _id: "inv", status: "paid", amountPaidMinor: 500, refundedAmountMinor: 0, reservedRefundAmountMinor: 488, retainedConsumedMinor: 0 },
      [{ retainedConsumedMinor: 12 }],
    );
    expect(summary).toMatchObject({
      remainingRefundableMinor: 0,
      reservedRefundAmountMinor: 488,
      grossUnrefundedMinor: 12,
      canRequestRefund: false,
      settlementCompleted: false,
    });
  });

  it("keeps a positive remaining balance when the reserved amount leaves room after the consumed floor", () => {
    const summary = refundInvoiceSummary(
      { _id: "inv", status: "paid", amountPaidMinor: 500, refundedAmountMinor: 0, reservedRefundAmountMinor: 400, retainedConsumedMinor: 0 },
      [{ retainedConsumedMinor: 12 }],
    );
    expect(summary).toMatchObject({
      remainingRefundableMinor: 88,
      reservedRefundAmountMinor: 400,
      canRequestRefund: true,
    });
  });
});