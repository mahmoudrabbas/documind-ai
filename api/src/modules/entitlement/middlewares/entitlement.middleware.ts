import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../../common/errors/AppError.js";
import { ENTITLEMENT_EXCEEDED } from "../../../common/errors/errorCodes.js";
import type { EntitlementService } from "../entitlement.service.js";
import type { CheckResult, EntitlementDimension, FailMode } from "../entitlement.types.js";

// ── Express type augmentation ──────────────────────────────────────────────────
//
// Extend the global Express.Request to carry the quota-warning flag set by
// fail-open guard behaviour. The flag is consumed by downstream middleware
// (e.g. response-logger) to annotate the response.

declare global {
  namespace Express {
    interface Request {
      quotaWarning?: boolean;
    }
  }
}

// ── Error codes ───────────────────────────────────────────────────────────────

const ENTITLEMENT_UNAVAILABLE = "ENTITLEMENT_UNAVAILABLE";
const TENANT_ID_MISSING = "TENANT_ID_MISSING";

// ── Public types ──────────────────────────────────────────────────────────────

export interface EntitlementGuardOptions {
  /** The counter dimension to check and consume quota against. */
  dimension: EntitlementDimension;

  /**
   * Amount of quota to consume.
   * - Static: a fixed number
   * - Dynamic: a function that receives the Express request and returns number
   */
  amount: number | ((req: Request) => number);

  /**
   * Behaviour when quota is denied:
   * - "fail-closed" → throw AppError (HTTP 429)
   * - "fail-open"   → set `req.quotaWarning = true` and continue
   */
  failMode: FailMode;

  /**
   * Idempotency key for at-least-once semantics.
   * - Static string, or
   * - Function that receives the Express request and returns a string.
   *
   * When omitted the middleware falls back to the `X-Idempotency-Key` header
   * and then to `req.traceId`.
   */
  idempotencyKey?: string | ((req: Request) => string);
}

export interface EntitlementCheckGuardOptions {
  /** The counter dimension to check quota against. */
  dimension: EntitlementDimension;
  /** Behaviour when quota is denied */
  failMode: FailMode;
}

// ── Factory ───────────────────────────────────────────────────────────────────

/**
 * Creates an Express middleware that enforces entitlement quota limits.
 *
 * The middleware calls `entitlementService.consume()` to atomically check and
 * increment the counter for the given dimension. When the quota is exhausted
 * the configured fail-mode determines whether the request is blocked or allowed
 * with a warning.
 *
 * @param entitlementService - Injected EntitlementService instance.
 * @param options            - Guard configuration (dimension, amount, failMode…).
 *
 * @example
 * ```typescript
 * const ocrGuard = createEntitlementGuard(entitlementService, {
 *   dimension: "ocrPagesPerMonth",
 *   amount: 1,
 *   failMode: "fail-closed",
 * });
 * router.post("/ocr", authenticate, tenantScoping, ocrGuard, ocrController);
 * ```
 */
export function createEntitlementGuard(
  entitlementService: EntitlementService,
  options: EntitlementGuardOptions,
) {
  const { dimension, amount, failMode } = options;

  /**
   * Resolve the idempotency key to pass to the consume call.
   *
   * Priority:
   * 1. Explicit `idempotencyKey` option (string or extractor function)
   * 2. `X-Idempotency-Key` request header
   * 3. `req.traceId` (always set by the request-context middleware)
   */
  function resolveIdempotencyKey(req: Request): string | undefined {
    if (options.idempotencyKey !== undefined) {
      return typeof options.idempotencyKey === "function"
        ? options.idempotencyKey(req)
        : options.idempotencyKey;
    }

    const headerKey = req.headers["x-idempotency-key"];
    if (headerKey !== undefined) {
      return Array.isArray(headerKey) ? headerKey[0] : headerKey;
    }

    return req.traceId;
  }

  return async function entitlementGuard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      // 1. Extract tenantId (set by tenant-scoping middleware)
      if (!req.tenantId) {
        throw new AppError(500, TENANT_ID_MISSING, "Tenant ID not found on request — is tenant-scoping middleware in place?");
      }

      // 2. Resolve amount (static or dynamic from request)
      const resolvedAmount = typeof amount === "function" ? amount(req) : amount;

      // 3. Resolve idempotency key
      const resolvedKey = resolveIdempotencyKey(req);

      // 4. Atomically check and consume quota
      const result = await entitlementService.consume(
        req.tenantId,
        dimension,
        resolvedAmount,
        resolvedKey,
      );

      // 5. Handle denial
      if (!result.committed) {
        if (failMode === "fail-closed") {
          throw new AppError(
            429,
            ENTITLEMENT_EXCEEDED,
            `Quota exceeded for ${dimension}: ${result.current}/${result.limit}`,
            {
              current: result.current,
              limit: result.limit,
              dimension,
              remaining: result.remaining,
            },
          );
        }

        // fail-open: allow with warning flag
        req.quotaWarning = true;
        next();
        return;
      }

      // 6. Soft warning at >80% threshold
      if (result.limit > 0 && result.current / result.limit > 0.8) {
        res.setHeader("X-Quota-Warning", "true");
      }

      next();
    } catch (error) {
      // Already an AppError — forward to Express error handler
      if (error instanceof AppError) {
        next(error);
        return;
      }

      // Unexpected service error
      if (failMode === "fail-closed") {
        next(
          new AppError(
            503,
            ENTITLEMENT_UNAVAILABLE,
            "Entitlement service is temporarily unavailable",
          ),
        );
      } else {
        // fail-open on service error: log and continue
        req.log?.warn?.(
          { err: error, dimension, failMode },
          "[EntitlementGuard] Service error — allowing request in fail-open mode",
        );
        next();
      }
    }
  };
}

// ── Check guard factory ─────────────────────────────────────────────────────

/**
 * Creates an Express middleware that checks entitlement quota without consuming.
 *
 * The middleware calls `entitlementService.check()` which is read-only and never
 * mutates counters. Useful for pre-request quota validation before expensive
 * operations.
 *
 * @param entitlementService - Injected EntitlementService instance.
 * @param options            - Guard configuration (dimension, failMode).
 *
 * @example
 * ```typescript
 * const ocrCheck = createEntitlementCheckGuard(entitlementService, {
 *   dimension: "ocrPagesPerMonth",
 *   failMode: "fail-closed",
 * });
 * router.post("/ocr", authenticate, tenantScoping, ocrCheck, ocrController);
 * ```
 */
export function createEntitlementCheckGuard(
  entitlementService: EntitlementService,
  options: EntitlementCheckGuardOptions,
) {
  const { dimension, failMode } = options;

  return async function entitlementCheckGuard(
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> {
    try {
      // 1. Extract tenantId (set by tenant-scoping middleware)
      if (!req.tenantId) {
        throw new AppError(
          500,
          TENANT_ID_MISSING,
          "Tenant ID not found on request — is tenant-scoping middleware in place?",
        );
      }

      // 2. Read-only quota check (never mutates counters)
      const result = await entitlementService.check(req.tenantId, dimension);

      // 3. Handle denial
      if (!result.allowed) {
        if (failMode === "fail-closed") {
          throw new AppError(
            429,
            ENTITLEMENT_EXCEEDED,
            `Quota exceeded for ${dimension}: ${result.current}/${result.limit}`,
            {
              current: result.current,
              limit: result.limit,
              dimension,
              remaining: 0,
            },
          );
        }

        // fail-open: allow with warning flag
        req.quotaWarning = true;
        next();
        return;
      }

      // 4. Soft warning at >80% threshold
      if (result.limit > 0 && result.current / result.limit > 0.8) {
        res.setHeader("X-Quota-Warning", "true");
      }

      next();
    } catch (error) {
      // Already an AppError — forward to Express error handler
      if (error instanceof AppError) {
        next(error);
        return;
      }

      // Unexpected service error
      if (failMode === "fail-closed") {
        next(
          new AppError(
            503,
            ENTITLEMENT_UNAVAILABLE,
            "Entitlement service is temporarily unavailable",
          ),
        );
      } else {
        // fail-open on service error: log and continue
        req.log?.warn?.(
          { err: error, dimension, failMode },
          "[EntitlementCheckGuard] Service error — allowing request in fail-open mode",
        );
        next();
      }
    }
  };
}
