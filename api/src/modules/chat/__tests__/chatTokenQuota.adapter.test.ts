import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const mocks = vi.hoisted(() => ({
  getUsage: vi.fn(),
  getEffectiveLimit: vi.fn(),
  getCounterPeriodKey: vi.fn(),
  getPeriodReset: vi.fn(),
  reserveTokenQuota: vi.fn(),
  commitTokenQuotaReservation: vi.fn(),
  releaseTokenQuotaReservation: vi.fn(),
}));

vi.mock("../../entitlement/entitlement.service.js", () => ({
  getEntitlementService: () => ({
    getUsage: mocks.getUsage,
    getEffectiveLimit: mocks.getEffectiveLimit,
    getCounterPeriodKey: mocks.getCounterPeriodKey,
    getPeriodReset: mocks.getPeriodReset,
  }),
}));

vi.mock(
  "../../entitlement/tokenQuotaReservation.repository.js",
  () => ({
    reserveTokenQuota: mocks.reserveTokenQuota,
    commitTokenQuotaReservation:
      mocks.commitTokenQuotaReservation,
    releaseTokenQuotaReservation:
      mocks.releaseTokenQuotaReservation,
  }),
);

import {
  createProductionChatTokenQuotaPort,
} from "../chatTokenQuota.adapter.js";

const TENANT_ID = "507f1f77bcf86cd799439011";

describe("production Chat token quota adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.getUsage.mockResolvedValue({
      tokensPerMonth: 0,
    });

    mocks.getEffectiveLimit.mockResolvedValue(100_000);
    mocks.getCounterPeriodKey.mockResolvedValue("2026-08");
    mocks.getPeriodReset.mockResolvedValue(
      "2026-09-01T00:00:00.000Z",
    );

    mocks.reserveTokenQuota.mockResolvedValue({
      reservationId: "tqr_test",
      reservedAmount: 50_000,
      expiresAt: new Date(),
    });

    mocks.commitTokenQuotaReservation.mockResolvedValue({
      committed: true,
      reservedAmount: 50_000,
      actualAmount: 1200,
      refundedAmount: 48_800,
    });

    mocks.releaseTokenQuotaReservation.mockResolvedValue({
      released: true,
      refundedAmount: 50_000,
    });
  });

  it("reserves only the remaining monthly quota when it is below the workflow ceiling", async () => {
    mocks.getUsage.mockResolvedValue({
      tokensPerMonth: 8_000,
    });
    mocks.getEffectiveLimit.mockResolvedValue(10_000);

    mocks.reserveTokenQuota.mockResolvedValue({
      reservationId: "tqr_remaining",
      reservedAmount: 2_000,
      expiresAt: new Date(),
    });

    const port = createProductionChatTokenQuotaPort();

    const result = await port.reserve({
      tenantId: TENANT_ID,
      requestId: "request-remaining",
      maxAmount: 50_000,
    });

    expect(result).toEqual({
      allowed: true,
      reservation: {
        reservationId: "tqr_remaining",
        reservedAmount: 2_000,
      },
    });

    expect(mocks.reserveTokenQuota).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      requestId: "request-remaining",
      periodStart: "2026-08",
      amount: 2_000,
      limit: 10_000,
      ttlSeconds: 300,
    });
  });

  it("returns null without creating a reservation when monthly quota is exhausted", async () => {
    mocks.getUsage.mockResolvedValue({
      tokensPerMonth: 10_000,
    });
    mocks.getEffectiveLimit.mockResolvedValue(10_000);

    const port = createProductionChatTokenQuotaPort();

    const result = await port.reserve({
      tenantId: TENANT_ID,
      requestId: "request-exhausted",
      maxAmount: 50_000,
    });

    expect(result).toEqual({
      allowed: false,
      current: 10_000,
      limit: 10_000,
      remaining: 0,
      periodReset: "2026-09-01T00:00:00.000Z",
    });

    expect(mocks.reserveTokenQuota).not.toHaveBeenCalled();
  });

  it("re-reads remaining quota once after losing a concurrent reservation race", async () => {
    mocks.getUsage
      .mockResolvedValueOnce({
        tokensPerMonth: 5_000,
      })
      .mockResolvedValueOnce({
        tokensPerMonth: 9_000,
      });

    mocks.getEffectiveLimit.mockResolvedValue(10_000);

    mocks.reserveTokenQuota
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        reservationId: "tqr_retry",
        reservedAmount: 1_000,
        expiresAt: new Date(),
      });

    const port = createProductionChatTokenQuotaPort();

    const result = await port.reserve({
      tenantId: TENANT_ID,
      requestId: "request-race",
      maxAmount: 50_000,
    });

    expect(result).toEqual({
      allowed: true,
      reservation: {
        reservationId: "tqr_retry",
        reservedAmount: 1_000,
      },
    });

    expect(mocks.reserveTokenQuota).toHaveBeenCalledTimes(2);

    expect(mocks.reserveTokenQuota.mock.calls[0]?.[0]).toMatchObject({
      amount: 5_000,
      limit: 10_000,
    });

    expect(mocks.reserveTokenQuota.mock.calls[1]?.[0]).toMatchObject({
      amount: 1_000,
      limit: 10_000,
    });
  });

  it("maps commit and release to the durable reservation repository", async () => {
    const port = createProductionChatTokenQuotaPort();

    await port.commit({
      tenantId: TENANT_ID,
      reservationId: "tqr_test",
      actualAmount: 1200,
    });

    expect(
      mocks.commitTokenQuotaReservation,
    ).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      reservationId: "tqr_test",
      actualAmount: 1200,
    });

    await port.release({
      tenantId: TENANT_ID,
      reservationId: "tqr_test",
    });

    expect(
      mocks.releaseTokenQuotaReservation,
    ).toHaveBeenCalledWith({
      tenantId: TENANT_ID,
      reservationId: "tqr_test",
    });
  });
});
