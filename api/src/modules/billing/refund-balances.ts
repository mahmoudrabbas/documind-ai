export function calculateRemainingRefundableMinor(input: {
  amountPaidMinor: number;
  retainedConsumedMinor: number;
  confirmedRefundedMinor: number;
  pendingReservedMinor: number;
}): number {
  const value = BigInt(Math.max(0, Math.trunc(input.amountPaidMinor)))
    - BigInt(Math.max(0, Math.trunc(input.retainedConsumedMinor)))
    - BigInt(Math.max(0, Math.trunc(input.confirmedRefundedMinor)))
    - BigInt(Math.max(0, Math.trunc(input.pendingReservedMinor)));
  return Number(value > 0n ? value : 0n);
}

/** Mongo aggregation equivalent of calculateRemainingRefundableMinor. */
export function remainingRefundableMinorExpression() {
  return {
    $max: [
      0,
      {
        $subtract: [
          { $ifNull: ["$amountPaidMinor", 0] },
          {
            $add: [
              { $ifNull: ["$retainedConsumedMinor", 0] },
              { $ifNull: ["$refundedAmountMinor", 0] },
              { $ifNull: ["$reservedRefundAmountMinor", 0] },
            ],
          },
        ],
      },
    ],
  } as const;
}
