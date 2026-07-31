import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction, Request, Response } from "express";

// ═══════════════════════════════════════════════════════════════════════════
// Hoisted mock functions — vi.mock factories are hoisted to the top of the
// file, so variables they capture must also be hoisted via vi.hoisted().
// ═══════════════════════════════════════════════════════════════════════════

const mockReconcile = vi.hoisted(() => vi.fn());
const mockReconcileAll = vi.hoisted(() => vi.fn());
const mockAuditWrite = vi.hoisted(() => vi.fn());
const mockExecReports = vi.hoisted(() => vi.fn());
const mockExecCount = vi.hoisted(() => vi.fn());

// Mock the service singleton accessor and the audit writer so no real Mongo
// connection is required. The report model is mocked with a fluent query
// chain so the reports list controller can be exercised too.
vi.mock("../reconciliation.service.js", () => ({
  getReconciliationService: () => ({
    reconcile: mockReconcile,
    reconcileAll: mockReconcileAll,
  }),
}));

vi.mock("../../../common/observability/index.js", () => ({
  getAuditWriter: () => ({ write: mockAuditWrite }),
}));

vi.mock("../../../db/models/entitlementReconciliationReport.model.js", () => {
  const chain = {
    sort: () => chain,
    skip: () => chain,
    limit: () => chain,
    lean: () => chain,
    exec: mockExecReports,
  };
  return {
    default: {
      find: () => chain,
      countDocuments: () => ({ exec: mockExecCount }),
    },
  };
});

// ═══════════════════════════════════════════════════════════════════════════
// Module under test — imported AFTER all mocks are registered.
// ═══════════════════════════════════════════════════════════════════════════

import {
  reconcileController,
  listReconciliationReportsController,
} from "../entitlement.admin.controller.js";

// ═══════════════════════════════════════════════════════════════════════════
// Helpers
// ═══════════════════════════════════════════════════════════════════════════

const TENANT_A = "507f1f77bcf86cd799439011";
const SUPER_ADMIN_USER = "507f1f77bcf86cd799439012";

function makeReq(
  body: Record<string, unknown>,
  query: Record<string, string> = {},
): Request {
  return {
    body,
    params: {},
    query,
    auth: {
      userId: SUPER_ADMIN_USER,
      email: "admin@example.com",
      role: "SUPER_ADMIN",
    },
    tenantId: TENANT_A,
    traceId: "trace-1",
    requestId: "req-1",
  } as unknown as Request;
}

function makeRes(): {
  res: Response;
  json: ReturnType<typeof vi.fn>;
  status: ReturnType<typeof vi.fn>;
  next: ReturnType<typeof vi.fn>;
} {
  const json = vi.fn();
  const status = vi.fn();
  const next = vi.fn();
  const res = { status, json, headersSent: false } as unknown as Response;
  status.mockReturnValue(res);
  return { res, json, status, next };
}

type Controller = (
  req: Request,
  res: Response,
  next: NextFunction,
) => Promise<void>;

function callController(
  controller: Controller,
  req: Request,
  res: Response,
  next: ReturnType<typeof vi.fn>,
): Promise<void> {
  return controller(req, res, next as unknown as NextFunction);
}

// ═══════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════

describe("POST /super-admin/entitlement/reconcile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditWrite.mockResolvedValue(true);
    mockExecReports.mockResolvedValue([]);
    mockExecCount.mockResolvedValue(0);
  });

  it("reconciles a single tenant and writes an audit event", async () => {
    const report = {
      tenantId: TENANT_A,
      mode: "execute",
      totalDiscrepancies: 2,
      totalFixed: 1,
    };
    mockReconcile.mockResolvedValue(report);

    const req = makeReq({ mode: "execute", tenantId: TENANT_A });
    const { res, json, status, next } = makeRes();

    await callController(reconcileController, req, res, next);

    expect(mockReconcile).toHaveBeenCalledWith(TENANT_A, "execute");
    expect(mockReconcileAll).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ success: true, data: report });
    expect(mockAuditWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "ENTITLEMENT_RECONCILE",
        resourceType: "EntitlementReconciliation",
        resourceId: TENANT_A,
        metadata: { mode: "execute", totalDiscrepancies: 2, totalFixed: 1 },
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("reconciles all tenants when no tenantId is provided (defaults to dry-run)", async () => {
    const aggregate = {
      mode: "dry-run",
      timestamp: "2026-01-01T00:00:00.000Z",
      totalTenants: 0,
      totalDiscrepancies: 0,
      totalFixed: 0,
      reports: [],
    };
    mockReconcileAll.mockResolvedValue(aggregate);

    const req = makeReq({});
    const { res, json, status, next } = makeRes();

    await callController(reconcileController, req, res, next);

    expect(mockReconcileAll).toHaveBeenCalledWith("dry-run");
    expect(mockReconcile).not.toHaveBeenCalled();
    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({ success: true, data: aggregate });
    expect(mockAuditWrite).toHaveBeenCalledWith(
      expect.objectContaining({
        resourceId: "all",
        metadata: expect.objectContaining({ mode: "dry-run" }),
      }),
    );
    expect(next).not.toHaveBeenCalled();
  });

  it("returns 400 for an invalid mode", async () => {
    const req = makeReq({ mode: "explode" });
    const { res, json, next } = makeRes();

    await callController(reconcileController, req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400, code: "VALIDATION_ERROR" }),
    );
    expect(mockReconcile).not.toHaveBeenCalled();
    expect(mockReconcileAll).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });

  it("returns 400 for a malformed tenantId", async () => {
    const req = makeReq({ mode: "dry-run", tenantId: "not-an-objectid" });
    const { res, json, next } = makeRes();

    await callController(reconcileController, req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(mockReconcile).not.toHaveBeenCalled();
    expect(json).not.toHaveBeenCalled();
  });

  it("rejects unknown body keys via the strict schema", async () => {
    const req = makeReq({ mode: "dry-run", surprise: true });
    const { res, json, next } = makeRes();

    await callController(reconcileController, req, res, next);

    expect(next).toHaveBeenCalledWith(
      expect.objectContaining({ statusCode: 400 }),
    );
    expect(json).not.toHaveBeenCalled();
  });
});

describe("GET /super-admin/entitlement/reconcile/reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists persisted reports with pagination", async () => {
    const stored = [{ tenantId: TENANT_A, mode: "dry-run", totalDiscrepancies: 1 }];
    mockExecReports.mockResolvedValue(stored);
    mockExecCount.mockResolvedValue(3);

    const req = makeReq({}, { page: "1", pageSize: "10" });
    const { res, json, status, next } = makeRes();

    await callController(listReconciliationReportsController, req, res, next);

    expect(status).toHaveBeenCalledWith(200);
    expect(json).toHaveBeenCalledWith({
      success: true,
      data: {
        reports: stored,
        pagination: { page: 1, pageSize: 10, total: 3, totalPages: 1 },
      },
    });
    expect(next).not.toHaveBeenCalled();
  });
});
