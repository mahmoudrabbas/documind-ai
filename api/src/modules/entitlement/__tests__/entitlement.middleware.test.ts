import { describe, it, expect, beforeEach, vi } from "vitest";
import { createEntitlementGuard, createEntitlementCheckGuard } from "../middlewares/entitlement.middleware.js";
import type { EntitlementGuardOptions } from "../middlewares/entitlement.middleware.js";
import { FakeEntitlementService } from "../ports/fakes/fake-entitlement-service.js";
import type { FakeQuotaCounter } from "../ports/fakes/fake-quota-counter.js";
import { AppError } from "../../../common/errors/AppError.js";
import { ENTITLEMENT_EXCEEDED } from "../../../common/errors/errorCodes.js";
import type { EntitlementDimension } from "../entitlement.types.js";
import type { EntitlementService } from "../entitlement.service.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeGuard(service: FakeEntitlementService, options: EntitlementGuardOptions) {
  return createEntitlementGuard(service as unknown as EntitlementService, options);
}

function currentPeriodKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function createMocks() {
  const headers = new Map<string, string>();
  const req: Record<string, unknown> = {
    tenantId: "test-tenant",
    traceId: "test-trace-id",
    body: {},
    headers: {},
    log: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
    quotaWarning: undefined,
  };
  const res: Record<string, unknown> = {
    setHeader: vi.fn((key: string, value: string) => {
      headers.set(key, value);
    }),
  };
  const next = vi.fn();
  return { req, res, next, headers };
}

async function callGuard(
  middleware: (req: Record<string, unknown>, res: Record<string, unknown>, next: unknown) => Promise<void>,
  req: Record<string, unknown>,
  res: Record<string, unknown>,
  next: unknown,
): Promise<void> {
  await middleware(req, res, next);
}

function expectNextCalledWithAppError(
  next: ReturnType<typeof vi.fn>,
  statusCode: number,
  code: string,
): void {
  expect(next).toHaveBeenCalledTimes(1);
  const error = next.mock.calls[0][0];
  expect(error).toBeInstanceOf(AppError);
  expect(error.statusCode).toBe(statusCode);
  expect(error.code).toBe(code);
}

function expectNextCalledSuccess(next: ReturnType<typeof vi.fn>): void {
  expect(next).toHaveBeenCalledTimes(1);
  expect(next.mock.calls[0][0]).toBeUndefined();
}

// ── Suite ────────────────────────────────────────────────────────────────────

describe("EntitlementGuard middleware", () => {
  let service: FakeEntitlementService;
  let counter: FakeQuotaCounter;

  beforeEach(() => {
    service = new FakeEntitlementService();
    counter = service.getCounter();
  });

  // ── 1. Fail-closed: consume within limit → next() called, 200 ───────────────

  describe("fail-closed mode — within limit", () => {
    it("calls next() when quota is sufficient", async () => {
      const { req, res, next } = createMocks();
      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 5,
        failMode: "fail-closed",
      });

      await callGuard(guard, req, res, next);

      expectNextCalledSuccess(next);
      expect(req.quotaWarning).toBeUndefined();

      // Verify counter was incremented
      const key = currentPeriodKey();
      expect(counter._hasCounter("test-tenant", "documents", key)).toBe(true);
    });
  });

  // ── 2. Fail-closed: consume exceeds limit → AppError(429) ───────────────────

  describe("fail-closed mode — quota exceeded", () => {
    it("throws AppError(429) when quota is exhausted", async () => {
      // Seed counter at the limit (default documents limit is 100)
      const key = currentPeriodKey();
      counter._seed("test-tenant", "documents", key, 100);

      const { req, res, next } = createMocks();
      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 1,
        failMode: "fail-closed",
      });

      await callGuard(guard, req, res, next);

      expectNextCalledWithAppError(next, 429, ENTITLEMENT_EXCEEDED);
      expect(req.quotaWarning).toBeUndefined();
    });

    it("includes current, limit, dimension, and remaining in AppError details", async () => {
      const key = currentPeriodKey();
      counter._seed("test-tenant", "documents", key, 100);

      const { req, res, next } = createMocks();
      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 1,
        failMode: "fail-closed",
      });

      await callGuard(guard, req, res, next);

      const error = next.mock.calls[0][0] as AppError;
      expect(error.details).toMatchObject({
        current: 100,
        limit: 100,
        dimension: "documents",
        remaining: 0,
      });
    });
  });

  // ── 3 & 4. Fail-open: consume exceeds limit → req.quotaWarning + next() ─────

  describe("fail-open mode — quota exceeded", () => {
    it("sets req.quotaWarning = true and calls next() when quota is exceeded", async () => {
      const key = currentPeriodKey();
      counter._seed("test-tenant", "documents", key, 100);

      const { req, res, next } = createMocks();
      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 1,
        failMode: "fail-open",
      });

      await callGuard(guard, req, res, next);

      expect(req.quotaWarning).toBe(true);
      expectNextCalledSuccess(next);
    });

    it("passes control through next() without error (→ 200 response)", async () => {
      const key = currentPeriodKey();
      counter._seed("test-tenant", "documents", key, 100);

      const { req, res, next } = createMocks();
      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 1,
        failMode: "fail-open",
      });

      await callGuard(guard, req, res, next);

      // next() called with no args → Express will send 200
      expect(next).toHaveBeenCalledTimes(1);
      expect(next.mock.calls[0][0]).toBeUndefined();
      expect(req.quotaWarning).toBe(true);
    });
  });

  // ── 5. Service error: fail-closed → AppError(503) ──────────────────────────

  describe("service error — fail-closed", () => {
    it("wraps non-AppError as AppError(503) and calls next with it", async () => {
      // Make the service throw a non-AppError
      vi.spyOn(service, "consume").mockRejectedValueOnce(
        new Error("Database connection refused"),
      );

      const { req, res, next } = createMocks();
      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 1,
        failMode: "fail-closed",
      });

      await callGuard(guard, req, res, next);

      expectNextCalledWithAppError(next, 503, "ENTITLEMENT_UNAVAILABLE");
    });
  });

  // ── 6. Service error: fail-open → warning logged, next() called ────────────

  describe("service error — fail-open", () => {
    it("logs warning and calls next() without error", async () => {
      vi.spyOn(service, "consume").mockRejectedValueOnce(
        new Error("Database connection refused"),
      );

      const { req, res, next } = createMocks();
      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 1,
        failMode: "fail-open",
      });

      await callGuard(guard, req, res, next);

      // Warning should be logged
      expect(req.log.warn).toHaveBeenCalledTimes(1);
      expect(req.log.warn.mock.calls[0][1]).toContain(
        "[EntitlementGuard] Service error",
      );

      // Request should continue
      expectNextCalledSuccess(next);
    });
  });

  // ── 7. Soft warning: consume at >80% → x-quota-warning header ──────────────

  describe("soft warning threshold (80%)", () => {
    it("sets X-Quota-Warning header when usage exceeds 80%", async () => {
      // Seed at 85% (85 of 100) then consume 1 → 86% which is >80%
      const key = currentPeriodKey();
      counter._seed("test-tenant", "documents", key, 85);

      const { req, res, next, headers } = createMocks();
      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 1,
        failMode: "fail-closed",
      });

      await callGuard(guard, req, res, next);

      expect(headers.get("X-Quota-Warning")).toBe("true");
      expectNextCalledSuccess(next);
    });

    it("does NOT set X-Quota-Warning when usage is under 80%", async () => {
      const { req, res, next, headers } = createMocks();
      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 1,
        failMode: "fail-closed",
      });

      await callGuard(guard, req, res, next);

      expect(headers.has("X-Quota-Warning")).toBe(false);
      expectNextCalledSuccess(next);
    });

    it("does NOT set X-Quota-Warning when limit is 0", async () => {
      // Override snapshot with limit 0 for queriesPerMonth
      service.setSnapshot("test-tenant", {
        employees: 10,
        admins: 2,
        documents: 0,
        storageMb: 0,
        fileSizeMb: 0,
        queriesPerMonth: 0,
        tokensPerMonth: 0,
        ocrPagesPerMonth: 0,
        supportedModels: ["basic"],
        analyticsLevel: "basic",
        retentionDays: 90,
        supportLevel: "community",
      });

      const { req, res, next, headers } = createMocks();
      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 0,
        failMode: "fail-closed",
      });

      await callGuard(guard, req, res, next);

      expect(headers.has("X-Quota-Warning")).toBe(false);
    });
  });

  // ── 8. Idempotency: same key → second call doesn't decrement ───────────────

  describe("idempotency", () => {
    it("repeated call with same idempotency key does not double-increment", async () => {
      const { req, res, next } = createMocks();
      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 5,
        failMode: "fail-closed",
        idempotencyKey: "fixed-req-key",
      });

      // First call — should consume 5
      await callGuard(guard, req, res, next);
      expectNextCalledSuccess(next);

      // Reset next for second call
      next.mockReset();

      // Second call with same key — should be idempotent
      await callGuard(guard, req, res, next);
      expectNextCalledSuccess(next);

      // Counter must still be 5, not 10
      const _key = currentPeriodKey();
      const usage = await service.getUsage("test-tenant");
      expect(usage.documents).toBe(5);
    });

    it("different idempotency keys each increment", async () => {
      const { req: req1, next: next1 } = createMocks();
      const guard1 = makeGuard(service, {
        dimension: "documents",
        amount: 3,
        failMode: "fail-closed",
        idempotencyKey: "key-a",
      });
      await callGuard(guard1, req1, req1, next1);
      expectNextCalledSuccess(next1);

      const { req: req2, next: next2 } = createMocks();
      const guard2 = makeGuard(service, {
        dimension: "documents",
        amount: 7,
        failMode: "fail-closed",
        idempotencyKey: "key-b",
      });
      await callGuard(guard2, req2, req2, next2);
      expectNextCalledSuccess(next2);

      const usage = await service.getUsage("test-tenant");
      expect(usage.documents).toBe(10);
    });
  });

  // ── 9. Missing tenantId → AppError ────────────────────────────────────────

  describe("missing tenantId", () => {
    it("throws AppError when tenantId is missing from request", async () => {
      const { req, res, next } = createMocks();
      req.tenantId = undefined;

      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 1,
        failMode: "fail-closed",
      });

      await callGuard(guard, req, res, next);

      expectNextCalledWithAppError(next, 500, "TENANT_ID_MISSING");
    });
  });

  // ── 10. Dynamic amount from request body ──────────────────────────────────

  describe("dynamic amount from request body", () => {
    it("resolves amount via function that reads req.body", async () => {
      const { req, res, next } = createMocks();
      req.body = { pages: 7 };

      const guard = makeGuard(service, {
        dimension: "ocrPagesPerMonth",
        amount: (r) => r.body.pages as number,
        failMode: "fail-closed",
      });

      await callGuard(guard, req, res, next);

      expectNextCalledSuccess(next);

      // Should have consumed exactly 7
      const _key = currentPeriodKey();
      const usage = await service.getUsage("test-tenant");
      expect(usage.ocrPagesPerMonth).toBe(7);
    });

    it("dynamic amount resolves to zero when body field is zero", async () => {
      const { req, res, next } = createMocks();
      req.body = { pages: 0 };

      const guard = makeGuard(service, {
        dimension: "ocrPagesPerMonth",
        amount: (r) => r.body.pages as number,
        failMode: "fail-closed",
      });

      await callGuard(guard, req, res, next);

      expectNextCalledSuccess(next);

      // Counter exists but at 0 (no net consumption happened)
      const key = currentPeriodKey();
      expect(counter._hasCounter("test-tenant", "ocrPagesPerMonth", key)).toBe(
        true,
      );
    });
  });

  // ── 11. Static amount ──────────────────────────────────────────────────────

  describe("static amount", () => {
    it("consumes a fixed amount from quota", async () => {
      const { req, res, next } = createMocks();
      const guard = makeGuard(service, {
        dimension: "tokensPerMonth",
        amount: 5000,
        failMode: "fail-closed",
      });

      await callGuard(guard, req, res, next);

      expectNextCalledSuccess(next);

      const usage = await service.getUsage("test-tenant");
      expect(usage.tokensPerMonth).toBe(5000);
    });
  });

  // ── 12. Custom idempotency key from header ────────────────────────────────

  describe("idempotency key from X-Idempotency-Key header", () => {
    it("uses X-Idempotency-Key header when no explicit key is configured", async () => {
      const { req, res, next } = createMocks();
      req.headers["x-idempotency-key"] = "header-key-001";

      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 10,
        failMode: "fail-closed",
        // No explicit idempotencyKey → falls back to header
      });

      // First call
      await callGuard(guard, req, res, next);
      expectNextCalledSuccess(next);

      // Second call with same header — should be idempotent
      next.mockReset();
      await callGuard(guard, req, res, next);
      expectNextCalledSuccess(next);

      const usage = await service.getUsage("test-tenant");
      expect(usage.documents).toBe(10); // not 20
    });

    it("prefers configured idempotencyKey over header", async () => {
      const { req, res, next } = createMocks();
      req.headers["x-idempotency-key"] = "header-key";

      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 5,
        failMode: "fail-closed",
        idempotencyKey: "explicit-key", // should win over header
      });

      // First call with explicit key
      await callGuard(guard, req, res, next);
      expectNextCalledSuccess(next);

      // Second call — same explicit key (same guard instance)
      next.mockReset();
      await callGuard(guard, req, res, next);
      expectNextCalledSuccess(next);

      // Counter should only be 5, not 10 (explicit key won over header)
      const usage = await service.getUsage("test-tenant");
      expect(usage.documents).toBe(5);
    });
  });

  // ── 13. Generated idempotency key from traceId ────────────────────────────

  describe("idempotency key from traceId", () => {
    it("falls back to req.traceId when no key or header is provided", async () => {
      const { req, res, next } = createMocks();
      req.traceId = "generated-trace-123";
      // No idempotencyKey option, no x-idempotency-key header

      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 5,
        failMode: "fail-closed",
        // No idempotencyKey → should fall back to traceId
      });

      // First call
      await callGuard(guard, req, res, next);
      expectNextCalledSuccess(next);

      // Second call with same req (same traceId) — should be idempotent
      next.mockReset();
      await callGuard(guard, req, res, next);
      expectNextCalledSuccess(next);

      const usage = await service.getUsage("test-tenant");
      expect(usage.documents).toBe(5); // not 10
    });
  });

  // ── 14. Multiple guards on same route ──────────────────────────────────────

  describe("multiple guards on same route", () => {
    it("both guards pass when both quotas are sufficient", async () => {
      const { req, res, next } = createMocks();

      const guardDocs = makeGuard(service, {
        dimension: "documents",
        amount: 1,
        failMode: "fail-closed",
      });

      const guardQueries = makeGuard(service, {
        dimension: "queriesPerMonth",
        amount: 5,
        failMode: "fail-closed",
      });

      // Chain guards like Express would
      await new Promise<void>((resolve) => {
        guardDocs(req as Record<string, unknown>, res as Record<string, unknown>, (err?: unknown) => {
          if (err) { next(err); resolve(); return; }
          guardQueries(req as Record<string, unknown>, res as Record<string, unknown>, (err2?: unknown) => {
            if (err2) { next(err2); resolve(); return; }
            next();
            resolve();
          });
        });
      });

      expectNextCalledSuccess(next);

      const usage = await service.getUsage("test-tenant");
      expect(usage.documents).toBe(1);
      expect(usage.queriesPerMonth).toBe(5);
    });

    it("first guard fails — second guard is never reached", async () => {
      const key = currentPeriodKey();
      counter._seed("test-tenant", "documents", key, 100);

      const { req, res, next } = createMocks();
      let secondGuardCalled = false;

      const guardDocs = makeGuard(service, {
        dimension: "documents",
        amount: 1,
        failMode: "fail-closed",
      });

      const guardQueries = makeGuard(service, {
        dimension: "queriesPerMonth",
        amount: 1,
        failMode: "fail-closed",
      });

      // Chain guards
      await callGuard(guardDocs, req, res, (err?: unknown) => {
        if (err) {
          next(err);
          return;
        }
        secondGuardCalled = true;
        void callGuard(guardQueries, req, res, next);
      });

      expect(next).toHaveBeenCalledTimes(1);
      const error = next.mock.calls[0][0];
      expect(error).toBeInstanceOf(AppError);
      expect(error.code).toBe(ENTITLEMENT_EXCEEDED);
      expect(secondGuardCalled).toBe(false);
    });
  });

  // ── 15. Guard with amount=0 → no consumption ──────────────────────────────

  describe("guard with amount=0", () => {
    it("does not consume quota when amount is zero", async () => {
      const { req, res, next } = createMocks();

      const guard = makeGuard(service, {
        dimension: "documents",
        amount: 0,
        failMode: "fail-closed",
      });

      await callGuard(guard, req, res, next);

      expectNextCalledSuccess(next);

      // Counter should have been created with value 0 (no net consumption)
      const key = currentPeriodKey();
      expect(counter._hasCounter("test-tenant", "documents", key)).toBe(true);
    });

    it("does not consume quota when dynamic amount resolves to zero", async () => {
      const { req, res, next } = createMocks();
      req.body = { items: 0 };

      const guard = makeGuard(service, {
        dimension: "documents",
        amount: (r) => r.body.items as number,
        failMode: "fail-closed",
      });

      await callGuard(guard, req, res, next);

      expectNextCalledSuccess(next);

      // Counter exists but value is 0
      const _key = currentPeriodKey();
      const usage = await service.getUsage("test-tenant");
      expect(usage.documents).toBe(0);
    });
  });
});

// ── Check guard suite ─────────────────────────────────────────────────────────

describe("EntitlementCheckGuard middleware", () => {
  let service: FakeEntitlementService;
  let counter: FakeQuotaCounter;

  beforeEach(() => {
    service = new FakeEntitlementService();
    counter = service.getCounter();
  });

  function makeCheckGuard(
    svc: FakeEntitlementService,
    options: { dimension: EntitlementDimension; failMode: "fail-closed" | "fail-open" },
  ) {
    return createEntitlementCheckGuard(svc as unknown as EntitlementService, options);
  }

  // ── 1. Within limit → next() ──────────────────────────────────────────────

  it("calls next() when quota is within limit", async () => {
    const key = currentPeriodKey();
    counter._seed("test-tenant", "documents", key, 5);

    const { req, res, next } = createMocks();
    const guard = makeCheckGuard(service, {
      dimension: "documents",
      failMode: "fail-closed",
    });

    await callGuard(guard, req, res, next);

    expectNextCalledSuccess(next);
    expect(req.quotaWarning).toBeUndefined();
  });

  // ── 2. Exceeded + fail-closed → AppError(429) ─────────────────────────────

  it("throws 429 when quota is exceeded and failMode=fail-closed", async () => {
    const key = currentPeriodKey();
    counter._seed("test-tenant", "documents", key, 100);

    const { req, res, next } = createMocks();
    const guard = makeCheckGuard(service, {
      dimension: "documents",
      failMode: "fail-closed",
    });

    await callGuard(guard, req, res, next);

    expectNextCalledWithAppError(next, 429, ENTITLEMENT_EXCEEDED);
  });

  // ── 3. Exceeded + fail-open → req.quotaWarning + next() ───────────────────

  it("sets quotaWarning when quota is exceeded and failMode=fail-open", async () => {
    const key = currentPeriodKey();
    counter._seed("test-tenant", "documents", key, 100);

    const { req, res, next } = createMocks();
    const guard = makeCheckGuard(service, {
      dimension: "documents",
      failMode: "fail-open",
    });

    await callGuard(guard, req, res, next);

    expect(req.quotaWarning).toBe(true);
    expectNextCalledSuccess(next);
  });

  // ── 4. Soft warning header at >80% ────────────────────────────────────────

  it("sets X-Quota-Warning header at >80% threshold", async () => {
    const key = currentPeriodKey();
    counter._seed("test-tenant", "documents", key, 90);

    const { req, res, next, headers } = createMocks();
    const guard = makeCheckGuard(service, {
      dimension: "documents",
      failMode: "fail-closed",
    });

    await callGuard(guard, req, res, next);

    expect(headers.get("X-Quota-Warning")).toBe("true");
    expectNextCalledSuccess(next);
  });

  // ── 5. Missing tenantId → AppError(500) ───────────────────────────────────

  it("throws 500 when tenantId is missing", async () => {
    const { req, res, next } = createMocks();
    req.tenantId = undefined;

    const guard = makeCheckGuard(service, {
      dimension: "documents",
      failMode: "fail-closed",
    });

    await callGuard(guard, req, res, next);

    expectNextCalledWithAppError(next, 500, "TENANT_ID_MISSING");
  });

  // ── 6a. Service error — fail-closed → AppError(503) ───────────────────────

  it("handles service error: fail-closed returns 503", async () => {
    vi.spyOn(service, "check").mockRejectedValueOnce(
      new Error("Database connection refused"),
    );

    const { req, res, next } = createMocks();
    const guard = makeCheckGuard(service, {
      dimension: "documents",
      failMode: "fail-closed",
    });

    await callGuard(guard, req, res, next);

    expectNextCalledWithAppError(next, 503, "ENTITLEMENT_UNAVAILABLE");
  });

  // ── 6b. Service error — fail-open → warning logged, next() ────────────────

  it("handles service error: fail-open continues with warning", async () => {
    vi.spyOn(service, "check").mockRejectedValueOnce(
      new Error("Database connection refused"),
    );

    const { req, res, next } = createMocks();
    const guard = makeCheckGuard(service, {
      dimension: "documents",
      failMode: "fail-open",
    });

    await callGuard(guard, req, res, next);

    // Warning should be logged
    expect(req.log.warn).toHaveBeenCalledTimes(1);
    expect(req.log.warn.mock.calls[0][1]).toContain(
      "[EntitlementCheckGuard] Service error",
    );

    // Request should continue
    expectNextCalledSuccess(next);
  });
});
