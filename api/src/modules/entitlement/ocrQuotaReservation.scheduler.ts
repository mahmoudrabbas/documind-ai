import { logger } from "../../common/logger/logger.js";
import { releaseExpiredOcrReservations } from "./ocrQuotaReservation.repository.js";

export interface OcrQuotaReservationSchedulerOptions {
  intervalMs?: number;
  batchSize?: number;
}

export const OCR_QUOTA_RESERVATION_SWEEP_DEFAULT_INTERVAL_MS = 30_000;
export const OCR_QUOTA_RESERVATION_SWEEP_DEFAULT_BATCH_SIZE = 100;

export function startOcrQuotaReservationScheduler(
  opts: OcrQuotaReservationSchedulerOptions = {},
): NodeJS.Timeout {
  const intervalMs = resolveIntervalMs(opts.intervalMs);
  const batchSize = resolveBatchSize(opts.batchSize);

  const runOnce = async (): Promise<void> => {
    try {
      const result = await releaseExpiredOcrReservations(
        new Date(),
        batchSize,
      );

      if (result.examined > 0) {
        logger.info(
          {
            examined: result.examined,
            released: result.released,
            refundedPages: result.refundedPages,
          },
          "Expired OCR quota reservations reconciled",
        );
      }
    } catch (error) {
      logger.error(
        { err: error },
        "Expired OCR quota reservation sweep failed",
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
    process.env.OCR_QUOTA_RESERVATION_SWEEP_INTERVAL_MS,
  );

  if (Number.isFinite(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }

  return OCR_QUOTA_RESERVATION_SWEEP_DEFAULT_INTERVAL_MS;
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
    process.env.OCR_QUOTA_RESERVATION_SWEEP_BATCH_SIZE,
  );

  if (Number.isInteger(fromEnv) && fromEnv > 0) {
    return fromEnv;
  }

  return OCR_QUOTA_RESERVATION_SWEEP_DEFAULT_BATCH_SIZE;
}
