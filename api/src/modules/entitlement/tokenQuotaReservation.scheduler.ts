import { logger } from "../../common/logger/logger.js";
import { releaseExpiredTokenReservations } from "./tokenQuotaReservation.repository.js";

export interface TokenQuotaReservationSchedulerOptions {
  intervalMs?: number;
  batchSize?: number;
}

export const TOKEN_QUOTA_RESERVATION_SWEEP_DEFAULT_INTERVAL_MS = 30_000;
export const TOKEN_QUOTA_RESERVATION_SWEEP_DEFAULT_BATCH_SIZE = 100;

export function startTokenQuotaReservationScheduler(
  opts: TokenQuotaReservationSchedulerOptions = {},
): NodeJS.Timeout {
  const intervalMs = resolveIntervalMs(opts.intervalMs);
  const batchSize = resolveBatchSize(opts.batchSize);

  const runOnce = async (): Promise<void> => {
    try {
      const result = await releaseExpiredTokenReservations(
        new Date(),
        batchSize,
      );

      if (result.examined > 0) {
        logger.info(
          {
            examined: result.examined,
            released: result.released,
            refundedTokens: result.refundedTokens,
          },
          "Expired token quota reservations reconciled",
        );
      }
    } catch (error) {
      logger.error(
        { err: error },
        "Expired token quota reservation sweep failed",
      );
    }
  };

  return setInterval(() => {
    void runOnce();
  }, intervalMs);
}

function resolveIntervalMs(intervalMs?: number): number {
  if (
    typeof intervalMs === "number" &&
    Number.isFinite(intervalMs) &&
    intervalMs > 0
  ) {
    return intervalMs;
  }

  const fromEnv = Number(
    process.env.TOKEN_QUOTA_RESERVATION_SWEEP_INTERVAL_MS,
  );

  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }

  return TOKEN_QUOTA_RESERVATION_SWEEP_DEFAULT_INTERVAL_MS;
}

function resolveBatchSize(batchSize?: number): number {
  if (
    typeof batchSize === "number" &&
    Number.isInteger(batchSize) &&
    batchSize > 0
  ) {
    return batchSize;
  }

  const fromEnv = Number(
    process.env.TOKEN_QUOTA_RESERVATION_SWEEP_BATCH_SIZE,
  );

  if (Number.isInteger(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }

  return TOKEN_QUOTA_RESERVATION_SWEEP_DEFAULT_BATCH_SIZE;
}
