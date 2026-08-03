import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../../common/errors/AppError.js";
import { ENTITLEMENT_EXCEEDED } from "../../../common/errors/errorCodes.js";
import { logEntitlementDenial } from "../entitlement-audit.js";
import type { EntitlementService } from "../entitlement.service.js";
import type {
  CapabilityKey,
  CheckResult,
  EntitlementDimension,
  FailMode,
} from "../entitlement.types.js";
// Type-only import — erased at compile time, so the entitlement module keeps
// no load-time runtime dependency on the notifications module (the trigger
// producer itself is loaded lazily via dynamic import inside the guard).
import type { OutboxTriggerPort } from "../../notifications/ports/outboxTrigger.port.js";

// ── Express type augmentation ──────────────────────────────────────────────────
//
// Extend the global Express.Request to carry the quota-warning flag set by
// fail-open guard behaviour. The flag is consumed by downstream middleware
// (e.g. response-logger) to annotate the response.

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      quotaWarning?: boolean;
    }
  }
}

// ── Error codes ───────────────────────────────────────────────────────────────

const ENTITLEMENT_UNAVAILABLE = "ENTITLEMENT_UNAVAILABLE";
const TENANT_ID_MISSING = "TENANT_ID_MISSING";

function safeEntitlementErrorContext(error: unknown): Record<string, string> {
  if (!(error instanceof Error)) {
    return { errorType: typeof error };
  }

  const context: Record<string, string> = { errorName: error.name };
  if ("code" in error && (typeof error.code === "string" || typeof error.code === "number")) {
    context.errorCode = String(error.code);
  }
  return context;
}

function classifyEntitlementFailure(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (/Mongo|Mongoose|Redis|Connection|Network|ServerSelection/i.test(name)) {
    return "DEPENDENCY_UNAVAILABLE";
  }
  if (/BSON|Cast/i.test(name)) {
    return "INVALID_TENANT_CONTEXT";
  }
  return "INTERNAL_FAILURE";
}

// ── Shared denial-payload helpers ────────────────────────────────────────────

/**
 * Resolve the quota reset timestamp for a tenant, defaulting to `null` when the
 * provider is unavailable. The reset is informational only — a guard must never
 * fail the request just because the reset time could not be resolved.
 */
export async function resolvePeriodReset(
  service: EntitlementService,
  tenantId: string,
): Promise<string | null> {
  try {
    return await service.getPeriodReset(tenantId);
  } catch {
    return null;
  }
}

// ── Shared quota-denial error builder ────────────────────────────────────────
//
// Every fail-closed quota denial (guards and service-layer consumers such as
// post-AI-query token accounting) carries the same upgrade-aware AppError
// payload: current/limit usage, the dimension, remaining quota, the period
// reset timestamp, and whether the requester may upgrade their plan.

export interface QuotaExceededErrorInput {
  dimension: EntitlementDimension;
  current: number;
  limit: number;
  remaining: number;
  periodReset: string | null;
  canUpgrade: boolean;
}

/**
 * Build the fail-closed 429 denial error for an exhausted quota dimension.
 */
export function buildQuotaExceededError(
  input: QuotaExceededErrorInput,
): AppError {
  const { dimension, current, limit, remaining, periodReset, canUpgrade } =
    input;
  return new AppError(
    429,
    ENTITLEMENT_EXCEEDED,
    `Quota exceeded for ${dimension}: ${current}/${limit}`,
    {
      current,
      limit,
      dimension,
      remaining,
      periodReset,
      canUpgrade,
    },
  );
}

/**
 * Whether the requesting user personally holds billing permission to upgrade.
 *
 * Issue rule: never surface an upgrade action (e.g. a plan-change CTA) that the
 * current user lacks permission to take. Only SUPER_ADMIN (platform) and
 * COMPANY_ADMIN (tenant) roles may manage the plan; EMPLOYEE sees no upgrade
 * affordance even when quota is exhausted.
 */
function resolveCanUpgrade(req: Request): boolean {
  return (
    req.auth?.role === "SUPER_ADMIN" || req.auth?.role === "COMPANY_ADMIN"
  );
}

/**
 * Human-readable denial message for a capability check, telling the caller what
 * was requested and what the plan actually permits.
 */
function buildCapabilityMessage(
  capability: CapabilityKey,
  value: unknown,
  result: CheckResult,
): string {
  if (capability === "allowedModels") {
    const model = typeof value === "string" ? value : String(value);
    return `Model "${model}" is not included in your current plan (${result.current}/${result.limit} models available)`;
  }
  const days = typeof value === "number" ? value : 0;
  return `Requested retention of ${days} days exceeds your plan limit of ${result.limit} days`;
}

// ── Denial audit helpers ──────────────────────────────────────────────────────

/** Copies the quota fields from an AppError denial payload (unknown shape). */
function extractDenialDetails(
  details: unknown,
): {
  current?: number;
  limit?: number;
  remaining?: number;
  canUpgrade?: boolean;
  periodReset?: string | null;
} {
  if (typeof details !== "object" || details === null) return {};
  const record = details as Record<string, unknown>;
  const result: {
    current?: number;
    limit?: number;
    remaining?: number;
    canUpgrade?: boolean;
    periodReset?: string | null;
  } = {};
  if (typeof record.current === "number") result.current = record.current;
  if (typeof record.limit === "number") result.limit = record.limit;
  if (typeof record.remaining === "number") result.remaining = record.remaining;
  if (typeof record.canUpgrade === "boolean") {
    result.canUpgrade = record.canUpgrade;
  }
  if (typeof record.periodReset === "string") {
    result.periodReset = record.periodReset;
  }
  return result;
}

/**
 * Fire-and-forget audit of an entitlement denial (429 quota exceeded or 503
 * unavailable). Never blocks the response — `logEntitlementDenial` swallows
 * all audit-write failures internally.
 */
function auditDenial(
  req: Request,
  dimension: string,
  denialType: 429 | 503,
  details: ReturnType<typeof extractDenialDetails> = {},
): void {
  logEntitlementDenial({
    dimension,
    denialType,
    tenantId: req.tenantId,
    actorId: req.auth?.userId,
    actorEmail: req.auth?.email ?? null,
    actorRole: req.auth?.role ?? null,
    traceId: req.traceId,
    ...details,
  });
}

/**
 * Fire-and-forget quota_exceeded outbox trigger for a fail-closed 429 denial
 * (T18). Never throws and never blocks the response — the denial is already
 * enforced by the time this runs, and every failure path is swallowed and
 * logged via `req.log.warn`. Skips publishing when: no trigger port is wired,
 * usage/limit are unavailable, or the period reset could not be resolved
 * (the strict metadata schema requires an ISO-8601 resetAt). The trigger
 * producer module is loaded lazily (dynamic import) so the entitlement module
 * keeps no load-time dependency on the notifications module.
 */
async function publishQuotaExceededSideEffect(
  req: Request,
  capability: CapabilityKey,
  error: AppError,
  triggerPort: CapabilityGuardOptions["triggerPort"],
): Promise<void> {
  if (!triggerPort) return;
  const details = extractDenialDetails(error.details);
  if (
    typeof details.current !== "number" ||
    typeof details.limit !== "number" ||
    details.periodReset === null ||
    details.periodReset === undefined
  ) {
    return;
  }
  const port = triggerPort();
  if (!port) return;
  try {
    const { publishQuotaExceededTrigger } = await import(
      "../../notifications/triggers/quotaExceeded.trigger.js"
    );
    await publishQuotaExceededTrigger(port, {
      tenantId: req.tenantId ?? "",
      actorId: req.auth?.userId ?? "",
      capability,
      usage: details.current,
      limit: details.limit,
      resetAt: details.periodReset,
      traceId: req.traceId,
    });
  } catch (err) {
    req.log?.warn?.(
      { err, capability },
      "[CapabilityGuard] Failed to publish quota_exceeded trigger — denial still enforced",
    );
  }
}

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

export interface CapabilityGuardOptions {
  /** The capability key to check against the tenant snapshot. */
  capability: CapabilityKey;

  /**
   * Value to validate against the capability.
   * - Static: a fixed string
   * - Dynamic: a function that receives the Express request and returns unknown
   */
  value: string | ((req: Request) => unknown);

  /**
   * Behaviour when the capability is denied:
   * - "fail-closed" → throw AppError (HTTP 429)
   * - "fail-open"   → set `req.quotaWarning = true` and continue
   */
  failMode: FailMode;

  /**
   * Optional lazy accessor for the notifications outbox trigger port. When
   * wired, a fail-closed quota denial (429 / ENTITLEMENT_EXCEEDED) fires a
   * fire-and-forget quota_exceeded trigger as a side effect. Function
   * indirection keeps the entitlement module free of a load-time dependency
   * on the notifications module — the port is injected lazily, never
   * hard-imported at module load.
   */
  triggerPort?: () => OutboxTriggerPort;
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
          const periodReset = await resolvePeriodReset(
            entitlementService,
            req.tenantId,
          );
          throw buildQuotaExceededError({
            dimension,
            current: result.current,
            limit: result.limit,
            remaining: result.remaining,
            periodReset,
            canUpgrade: resolveCanUpgrade(req),
          });
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
        // 429 (quota exceeded) / 503 (unavailable) are denials: audit them
        // fire-and-forget. Other AppErrors (e.g. TENANT_ID_MISSING) are not.
        if (error.statusCode === 429 && error.code === ENTITLEMENT_EXCEEDED) {
          auditDenial(req, dimension, 429, extractDenialDetails(error.details));
        } else if (
          error.statusCode === 503 &&
          error.code === ENTITLEMENT_UNAVAILABLE
        ) {
          auditDenial(req, dimension, 503);
        }
        next(error);
        return;
      }

      // Unexpected service error
      if (failMode === "fail-closed") {
        req.log?.error?.(
          {
            ...safeEntitlementErrorContext(error),
            dimension,
            requestId: req.requestId,
          },
          "[EntitlementGuard] Service error — denying request fail-closed",
        );
        auditDenial(req, dimension, 503);
        next(
          new AppError(
            503,
            ENTITLEMENT_UNAVAILABLE,
            "Entitlement service is temporarily unavailable",
            { failureClass: classifyEntitlementFailure(error) },
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
          const periodReset = await resolvePeriodReset(
            entitlementService,
            req.tenantId,
          );
          throw buildQuotaExceededError({
            dimension,
            current: result.current,
            limit: result.limit,
            remaining: 0,
            periodReset,
            canUpgrade: resolveCanUpgrade(req),
          });
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
        // 429 (quota exceeded) / 503 (unavailable) are denials: audit them
        // fire-and-forget. Other AppErrors (e.g. TENANT_ID_MISSING) are not.
        if (error.statusCode === 429 && error.code === ENTITLEMENT_EXCEEDED) {
          auditDenial(req, dimension, 429, extractDenialDetails(error.details));
        } else if (
          error.statusCode === 503 &&
          error.code === ENTITLEMENT_UNAVAILABLE
        ) {
          auditDenial(req, dimension, 503);
        }
        next(error);
        return;
      }

      // Unexpected service error
      if (failMode === "fail-closed") {
        auditDenial(req, dimension, 503);
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

// ── Capability guard factory ─────────────────────────────────────────────────

/**
 * Creates an Express middleware that enforces a capability gate from the
 * tenant's entitlement snapshot (e.g. allowed models, retention days).
 *
 * Unlike `createEntitlementGuard` / `createEntitlementCheckGuard`, capability
 * keys are NOT counted resources — they are enforced directly from snapshot
 * metadata via `entitlementService.checkCapability()`. When the capability is
 * denied the configured fail-mode determines whether the request is blocked or
 * allowed with a warning.
 *
 * @param entitlementService - Injected EntitlementService instance.
 * @param options            - Guard configuration (capability, value, failMode).
 *
 * @example
 * ```typescript
 * const modelGuard = createCapabilityGuard(entitlementService, {
 *   capability: "allowedModels",
 *   value: (req) => req.body?.model ?? "",
 *   failMode: "fail-closed",
 * });
 * router.patch("/ai-configuration", authenticate, tenantScoping, modelGuard, controller);
 * ```
 */
export function createCapabilityGuard(
  entitlementService: EntitlementService,
  options: CapabilityGuardOptions,
) {
  const { capability, value, failMode } = options;

  return async function capabilityGuard(
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

      // 2. Resolve value (static or dynamic from request)
      const resolvedValue = typeof value === "function" ? value(req) : value;

      // 3. Check the capability against the tenant snapshot
      const result = await entitlementService.checkCapability(
        req.tenantId,
        capability,
        resolvedValue,
      );

      // 4. Handle denial
      if (!result.allowed) {
        if (failMode === "fail-closed") {
          const periodReset = await resolvePeriodReset(
            entitlementService,
            req.tenantId,
          );
          throw new AppError(
            429,
            ENTITLEMENT_EXCEEDED,
            buildCapabilityMessage(capability, resolvedValue, result),
            {
              current: result.current,
              limit: result.limit,
              dimension: capability,
              remaining: Math.max(0, result.limit - result.current),
              periodReset,
              canUpgrade: resolveCanUpgrade(req),
            },
          );
        }

        // fail-open: allow with warning flag
        req.quotaWarning = true;
        next();
        return;
      }

      // 5. Soft warning at >80% threshold
      if (result.limit > 0 && result.current / result.limit > 0.8) {
        res.setHeader("X-Quota-Warning", "true");
      }

      next();
    } catch (error) {
      // Already an AppError — forward to Express error handler
      if (error instanceof AppError) {
        // 429 (quota exceeded) / 503 (unavailable) are denials: audit them
        // fire-and-forget. Other AppErrors (e.g. TENANT_ID_MISSING) are not.
        if (error.statusCode === 429 && error.code === ENTITLEMENT_EXCEEDED) {
          auditDenial(req, capability, 429, extractDenialDetails(error.details));
          // Side-effect quota_exceeded trigger (T18) — never throws, never
          // affects the denial response (publish failures are logged).
          await publishQuotaExceededSideEffect(
            req,
            capability,
            error,
            options.triggerPort,
          );
        } else if (
          error.statusCode === 503 &&
          error.code === ENTITLEMENT_UNAVAILABLE
        ) {
          auditDenial(req, capability, 503);
        }
        next(error);
        return;
      }

      // Unexpected service error
      if (failMode === "fail-closed") {
        auditDenial(req, capability, 503);
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
          { err: error, capability, failMode },
          "[CapabilityGuard] Service error — allowing request in fail-open mode",
        );
        next();
      }
    }
  };
}
