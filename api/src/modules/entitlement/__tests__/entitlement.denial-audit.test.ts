import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import type { NextFunction, Request, Response } from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import {
  createCapabilityGuard,
  createEntitlementCheckGuard,
  createEntitlementGuard,
  type EntitlementGuardOptions,
} from "../middlewares/entitlement.middleware.js";
import type { EntitlementService } from "../entitlement.service.js";
import type {
  CapabilityKey,
  EntitlementDimension,
} from "../entitlement.types.js";
import { FakeEntitlementService } from "../ports/fakes/fake-entitlement-service.js";
import type { FakeQuotaCounter } from "../ports/fakes/fake-quota-counter.js";
import { AppError } from "../../../common/errors/AppError.js";
import { ENTITLEMENT_EXCEEDED } from "../../../common/errors/errorCodes.js";
import {
  InMemoryAuditWriter,
  MongoAuditWriter,
} from "../../../common/observability/auditWriter.js";
import { setAuditWriter } from "../../../common/observability/index.js";
import { logger } from "../../../common/logger/logger.js";
import AuditLogModel from "../../../db/models/auditLog.model.js";

// ── Fixtures ────────────────────────────────────────────────────────────────

interface MockRequest {
  tenantId?: string;
  traceId: string;
  body: Record<string, unknown>;
  headers: Record<string, unknown>;
  quotaWarning?: boolean;
  log: { warn: ReturnType<typeof vi.fn> };
  auth?: { userId: string; tenantId: string; role: string; email?: string };
}

function createMocks(overrides: Partial<MockRequest> = {}) {
  const req: MockRequest = {
    tenantId: "test-tenant",
    traceId: "audit-test-trace",
    body: {},
    headers: {},
    log: { warn: vi.fn() },
    ...overrides,
  };
  const res = { setHeader: vi.fn() };
  const next = vi.fn();
  return { req, res, next };
}

function makeGuard(
  service: FakeEntitlementService,
  options: EntitlementGuardOptions,
) {
  return createEntitlementGuard(
    service as unknown as EntitlementService,
    options,
  );
}

function makeCheckGuard(
  service: FakeEntitlementService,
  dimension: EntitlementDimension,
) {
  return createEntitlementCheckGuard(
    service as unknown as EntitlementService,
    { dimension, failMode: "fail-closed" },
  );
}

function makeCapabilityGuard(
  service: FakeEntitlementService,
  capability: CapabilityKey,
  value: string,
) {
  return createCapabilityGuard(
    service as unknown as EntitlementService,
    { capability, value, failMode: "fail-closed" },
  );
}

async function callGuard(
  middleware: (req: Request, res: Response, next: NextFunction) => Promise<void>,
  req: MockRequest,
  res: { setHeader: ReturnType<typeof vi.fn> },
  next: ReturnType<typeof vi.fn>,
): Promise<void> {
  await middleware(
    req as unknown as Request,
    res as unknown as Response,
    next as unknown as NextFunction,
  );
}

function currentPeriodKey(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

async function expectAppError(
  next: ReturnType<typeof vi.fn>,
  statusCode: number,
  code: string,
): Promise<AppError> {
  expect(next).toHaveBeenCalledTimes(1);
  const error = next.mock.calls[0]?.[0] as AppError;
  expect(error).toBeInstanceOf(AppError);
  expect(error.statusCode).toBe(statusCode);
  expect(error.code).toBe(code);
  return error;
}

// ── In-memory Mongo fixture (real persistence of the audit event) ────────────

let mongoServer: MongoMemoryServer | null = null;

beforeAll(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "entitlement-denial-audit-test",
    });
  } else {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      instance: {
        launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000),
      },
    });
    await mongoose.connect(mongoServer.getUri(), {
      dbName: "entitlement-denial-audit-test",
    });
  }
});

afterAll(async () => {
  setAuditWriter(null);
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

beforeEach(async () => {
  await AuditLogModel.deleteMany({});
});

// ── Suite ────────────────────────────────────────────────────────────────────

describe("EntitlementGuard denial audit", () => {
  let service: FakeEntitlementService;
  let counter: FakeQuotaCounter;
  let writer: InMemoryAuditWriter;

  beforeEach(() => {
    service = new FakeEntitlementService();
    counter = service.getCounter();
    writer = new InMemoryAuditWriter();
    setAuditWriter(writer);
  });

  // ── (a) Quota exceeded → 429 audit event with full payload ─────────────────

  it("writes an entitlement.denial audit event for a 429 quota denial", async () => {
    const key = currentPeriodKey();
    counter._seed("test-tenant", "documents", key, 100);

    const { req, res, next } = createMocks({
      auth: {
        userId: "user-123",
        tenantId: "test-tenant",
        role: "COMPANY_ADMIN",
        email: "admin@example.test",
      },
    });
    const guard = makeGuard(service, {
      dimension: "documents",
      amount: 1,
      failMode: "fail-closed",
    });

    await callGuard(guard, req, res, next);

    const error = await expectAppError(next, 429, ENTITLEMENT_EXCEEDED);
    expect(error.details).toMatchObject({
      current: 100,
      limit: 100,
      dimension: "documents",
      remaining: 0,
    });

    expect(writer.events).toHaveLength(1);
    const event = writer.events[0]!;
    expect(event.action).toBe("entitlement.denial");
    expect(event.resourceType).toBe("documents");
    expect(event.resourceId).toBe(`documents:${key}`);
    expect(event.tenantId).toBe("test-tenant");
    expect(event.actorId).toBe("user-123");
    expect(event.actorEmail).toBe("admin@example.test");
    expect(event.actorRole).toBe("COMPANY_ADMIN");
    expect(event.outcome).toBe("DENIED");
    expect(event.metadata).toMatchObject({
      dimension: "documents",
      denialType: 429,
      traceId: "audit-test-trace",
      current: 100,
      limit: 100,
      remaining: 0,
      canUpgrade: true,
    });
    expect(typeof event.metadata?.periodReset).toBe("string");
  });

  it("omits actorId when the request is unauthenticated (429)", async () => {
    const key = currentPeriodKey();
    counter._seed("test-tenant", "documents", key, 100);

    const { req, res, next } = createMocks();
    const guard = makeGuard(service, {
      dimension: "documents",
      amount: 1,
      failMode: "fail-closed",
    });

    await callGuard(guard, req, res, next);

    await expectAppError(next, 429, ENTITLEMENT_EXCEEDED);
    expect(writer.events).toHaveLength(1);
    expect(writer.events[0]?.actorId).toBeUndefined();
    expect(writer.events[0]?.metadata).toMatchObject({
      dimension: "documents",
      denialType: 429,
    });
  });

  // ── (b) Unavailable → 503 audit event ─────────────────────────────────────

  it("writes an entitlement.denial audit event with denialType 503 on service error", async () => {
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

    await expectAppError(next, 503, "ENTITLEMENT_UNAVAILABLE");
    expect(writer.events).toHaveLength(1);
    expect(writer.events[0]?.action).toBe("entitlement.denial");
    expect(writer.events[0]?.metadata).toMatchObject({
      dimension: "documents",
      denialType: 503,
      traceId: "audit-test-trace",
    });
  });

  it("writes denialType 503 when the service throws ENTITLEMENT_UNAVAILABLE AppError", async () => {
    vi.spyOn(service, "consume").mockRejectedValueOnce(
      new AppError(503, "ENTITLEMENT_UNAVAILABLE", "no snapshot"),
    );

    const { req, res, next } = createMocks();
    const guard = makeGuard(service, {
      dimension: "documents",
      amount: 1,
      failMode: "fail-closed",
    });

    await callGuard(guard, req, res, next);

    await expectAppError(next, 503, "ENTITLEMENT_UNAVAILABLE");
    expect(writer.events).toHaveLength(1);
    expect(writer.events[0]?.metadata).toMatchObject({
      dimension: "documents",
      denialType: 503,
    });
  });

  it("does NOT audit non-denial AppErrors such as TENANT_ID_MISSING", async () => {
    const { req, res, next } = createMocks({ tenantId: undefined });
    const guard = makeGuard(service, {
      dimension: "documents",
      amount: 1,
      failMode: "fail-closed",
    });

    await callGuard(guard, req, res, next);

    await expectAppError(next, 500, "TENANT_ID_MISSING");
    expect(writer.events).toHaveLength(0);
  });

  // ── Check guard & capability guard also audit their denials ────────────────

  it("audits a 429 denial from the check guard", async () => {
    const key = currentPeriodKey();
    counter._seed("test-tenant", "documents", key, 100);

    const { req, res, next } = createMocks();
    const guard = makeCheckGuard(service, "documents");

    await callGuard(guard, req, res, next);

    await expectAppError(next, 429, ENTITLEMENT_EXCEEDED);
    expect(writer.events).toHaveLength(1);
    expect(writer.events[0]?.metadata).toMatchObject({
      dimension: "documents",
      denialType: 429,
    });
  });

  it("audits a 429 denial from the capability guard", async () => {
    const { req, res, next } = createMocks();
    const guard = makeCapabilityGuard(service, "allowedModels", "premium");

    await callGuard(guard, req, res, next);

    await expectAppError(next, 429, ENTITLEMENT_EXCEEDED);
    expect(writer.events).toHaveLength(1);
    expect(writer.events[0]?.metadata).toMatchObject({
      dimension: "allowedModels",
      denialType: 429,
    });
  });

  // ── (c) Audit write failure never blocks the response ─────────────────────

  it("still returns 429 when the audit writer throws (non-blocking)", async () => {
    const warnSpy = vi.spyOn(logger, "warn");
    setAuditWriter({
      write: () => Promise.reject(new Error("audit db down")),
    });

    const key = currentPeriodKey();
    counter._seed("test-tenant", "documents", key, 100);

    const { req, res, next } = createMocks();
    const guard = makeGuard(service, {
      dimension: "documents",
      amount: 1,
      failMode: "fail-closed",
    });

    // Must resolve — the audit failure must not propagate out of the guard.
    await expect(callGuard(guard, req, res, next)).resolves.toBeUndefined();

    await expectAppError(next, 429, ENTITLEMENT_EXCEEDED);
    expect(warnSpy).toHaveBeenCalled();
    expect(warnSpy.mock.calls[0]?.[1]).toContain(
      "[EntitlementDenial] Audit write failed",
    );
    warnSpy.mockRestore();
  });

  it("still returns 503 when the audit writer throws (non-blocking)", async () => {
    setAuditWriter({
      write: () => Promise.reject(new Error("audit db down")),
    });
    vi.spyOn(service, "consume").mockRejectedValueOnce(
      new Error("Database connection refused"),
    );

    const { req, res, next } = createMocks();
    const guard = makeGuard(service, {
      dimension: "documents",
      amount: 1,
      failMode: "fail-closed",
    });

    await expect(callGuard(guard, req, res, next)).resolves.toBeUndefined();

    await expectAppError(next, 503, "ENTITLEMENT_UNAVAILABLE");
  });

  // ── Real persistence into the audit_logs collection ────────────────────────

  it("persists the 429 denial event in audit_logs via MongoAuditWriter", async () => {
    const tenantId = new mongoose.Types.ObjectId().toString();
    const actorId = new mongoose.Types.ObjectId().toString();
    setAuditWriter(new MongoAuditWriter());

    const key = currentPeriodKey();
    counter._seed(tenantId, "documents", key, 100);

    const { req, res, next } = createMocks({
      tenantId,
      auth: {
        userId: actorId,
        tenantId,
        role: "COMPANY_ADMIN",
        email: "admin@example.test",
      },
    });
    const guard = makeGuard(service, {
      dimension: "documents",
      amount: 1,
      failMode: "fail-closed",
    });

    await callGuard(guard, req, res, next);
    await expectAppError(next, 429, ENTITLEMENT_EXCEEDED);

    // The audit write is fire-and-forget — poll until it lands.
    const deadline = Date.now() + 5000;
    let doc: {
      action: string;
      tenantId: unknown;
      userId: unknown;
      actorId: unknown;
      outcome: string;
      resourceType: string;
      resourceId: string;
      metadata?: Record<string, unknown>;
    } | null = null;
    while (Date.now() < deadline) {
      doc = (await AuditLogModel.findOne({
        action: "entitlement.denial",
      }).lean().exec()) as typeof doc;
      if (doc) break;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }

    expect(doc).not.toBeNull();
    expect(doc!.tenantId?.toString()).toBe(tenantId);
    expect(doc!.userId?.toString()).toBe(actorId);
    expect(doc!.actorId?.toString()).toBe(actorId);
    expect(doc!.outcome).toBe("DENIED");
    expect(doc!.resourceType).toBe("documents");
    expect(doc!.resourceId).toBe(`documents:${key}`);
    expect(doc!.metadata).toMatchObject({
      dimension: "documents",
      denialType: 429,
      traceId: "audit-test-trace",
      current: 100,
      limit: 100,
    });
  });
});
