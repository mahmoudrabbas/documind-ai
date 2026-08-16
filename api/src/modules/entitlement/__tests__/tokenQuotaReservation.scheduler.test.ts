import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const { releaseExpiredTokenReservations } = vi.hoisted(() => ({
  releaseExpiredTokenReservations: vi.fn(),
}));

vi.mock("../tokenQuotaReservation.repository.js", () => ({
  releaseExpiredTokenReservations,
}));

vi.mock("../../../common/logger/logger.js", () => ({
  logger: {
    info: vi.fn(),
    error: vi.fn(),
  },
}));

import {
  startTokenQuotaReservationScheduler,
} from "../tokenQuotaReservation.scheduler.js";

describe("token quota reservation scheduler", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();

    releaseExpiredTokenReservations.mockResolvedValue({
      examined: 0,
      released: 0,
      refundedTokens: 0,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs expired reservation cleanup on the configured interval", async () => {
    const timer = startTokenQuotaReservationScheduler({
      intervalMs: 100,
      batchSize: 17,
    });

    try {
      expect(releaseExpiredTokenReservations).not.toHaveBeenCalled();

      await vi.advanceTimersByTimeAsync(100);

      expect(releaseExpiredTokenReservations).toHaveBeenCalledTimes(1);
      expect(releaseExpiredTokenReservations).toHaveBeenCalledWith(
        expect.any(Date),
        17,
      );

      await vi.advanceTimersByTimeAsync(200);

      expect(releaseExpiredTokenReservations).toHaveBeenCalledTimes(3);
    } finally {
      clearInterval(timer);
    }
  });

  it("isolates repository failures and keeps scheduling future sweeps", async () => {
    releaseExpiredTokenReservations
      .mockRejectedValueOnce(new Error("database unavailable"))
      .mockResolvedValue({
        examined: 0,
        released: 0,
        refundedTokens: 0,
      });

    const timer = startTokenQuotaReservationScheduler({
      intervalMs: 100,
      batchSize: 10,
    });

    try {
      await vi.advanceTimersByTimeAsync(100);

      expect(releaseExpiredTokenReservations).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(100);

      expect(releaseExpiredTokenReservations).toHaveBeenCalledTimes(2);
    } finally {
      clearInterval(timer);
    }
  });
});
