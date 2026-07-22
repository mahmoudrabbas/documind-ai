import test from "node:test";
import assert from "node:assert/strict";
import { createRetrievalController } from "./retrieval.controller.js";
import type { HybridRetrievalService } from "./retrieval.service.js";
import type { RetrievalResult } from "./retrieval.types.js";
import { AppError } from "../../common/errors/AppError.js";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function createMockService(): HybridRetrievalService {
  return {
    async hybridSearch() {
      const result: RetrievalResult = {
        candidates: [],
        totalCandidates: 0,
        filterSummary: {
          tenantFilter: true,
          roleFilter: "SUPER_ADMIN",
          permissionScopes: [],
          explicitFilters: [],
          versionFilter: false,
        },
        diagnostics: {
          traceId: "test-trace-123",
          vectorLatencyMs: 10,
          keywordLatencyMs: 15,
          fusionLatencyMs: 5,
          totalLatencyMs: 42,
          vectorCandidateCount: 0,
          keywordCandidateCount: 0,
        },
      };
      return result;
    },
    async vectorSearch() {
      throw new Error("not used in debug endpoint");
    },
    async keywordSearch() {
      throw new Error("not used in debug endpoint");
    },
  };
}

/**
 * Creates a mock Express Response that captures status code and JSON body.
 */
function mockRes() {
  const state = { statusCode: -1, body: undefined as unknown };
  return {
    _state: state,
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  };
}

/**
 * Creates a mock Express Request with the given auth context and query.
 * `auth` should be `undefined` to simulate an unauthenticated request.
 */
function mockReq(
  auth: Record<string, string> | undefined,
  query: Record<string, string>,
) {
  return {
    auth: auth
      ? {
          userId: auth.userId,
          tenantId: auth.tenantId,
          role: auth.role,
          email: auth.email,
        }
      : undefined,
    tenantId: auth?.tenantId,
    query,
    requestId: "test-req-id",
  };
}

const controller = createRetrievalController(createMockService());

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test("GET /retrieval/debug with SUPER_ADMIN token returns 200", async () => {
  const req = mockReq(
    {
      userId: "user-1",
      tenantId: "tenant-1",
      role: "SUPER_ADMIN",
      email: "admin@test.com",
    },
    { q: "test query" },
  );
  const res = mockRes();
  let capturedError: unknown;
  const next = (err?: unknown) => {
    capturedError = err;
  };

  await controller.debugSearch(req as any, res as any, next as any);

  assert.equal(capturedError, undefined);
  assert.equal(res._state.statusCode, 200);
  assert.ok(res._state.body);

  const body = res._state.body as Record<string, unknown>;
  assert.equal(body.success, true);

  const data = body.data as Record<string, unknown>;
  assert.ok(Array.isArray(data.candidates), "data.candidates should be an array");
  assert.ok(data.diagnostics, "data.diagnostics should exist");
});

test("GET /retrieval/debug with EMPLOYEE token returns 403", async () => {
  const req = mockReq(
    {
      userId: "user-2",
      tenantId: "tenant-1",
      role: "EMPLOYEE",
      email: "emp@test.com",
    },
    { q: "test query" },
  );
  const res = mockRes();
  let capturedError: unknown;
  const next = (err?: unknown) => {
    capturedError = err;
  };

  await controller.debugSearch(req as any, res as any, next as any);

  assert.ok(capturedError instanceof AppError);
  assert.equal((capturedError as AppError).statusCode, 403);
});

test("GET /retrieval/debug with no token returns 401", async () => {
  const req = mockReq(undefined, { q: "test query" });
  const res = mockRes();
  let capturedError: unknown;
  const next = (err?: unknown) => {
    capturedError = err;
  };

  await controller.debugSearch(req as any, res as any, next as any);

  assert.ok(capturedError instanceof AppError);
  assert.equal((capturedError as AppError).statusCode, 401);
});

test("GET /retrieval/debug without queryText returns 400", async () => {
  const req = mockReq(
    {
      userId: "user-1",
      tenantId: "tenant-1",
      role: "SUPER_ADMIN",
      email: "admin@test.com",
    },
    {}, // no `q` param
  );
  const res = mockRes();
  let capturedError: unknown;
  const next = (err?: unknown) => {
    capturedError = err;
  };

  await controller.debugSearch(req as any, res as any, next as any);

  assert.ok(capturedError instanceof AppError);
  assert.equal((capturedError as AppError).statusCode, 400);
});

test("GET /retrieval/debug response includes filterSummary and diagnostics", async () => {
  const req = mockReq(
    {
      userId: "user-1",
      tenantId: "tenant-1",
      role: "SUPER_ADMIN",
      email: "admin@test.com",
    },
    { q: "test query" },
  );
  const res = mockRes();
  let capturedError: unknown;
  const next = (err?: unknown) => {
    capturedError = err;
  };

  await controller.debugSearch(req as any, res as any, next as any);

  assert.equal(capturedError, undefined);
  assert.equal(res._state.statusCode, 200);

  const data = (res._state.body as Record<string, unknown>).data as Record<
    string,
    unknown
  >;

  // filterSummary shape
  const filterSummary = data.filterSummary as Record<string, unknown>;
  assert.ok(filterSummary, "response must include filterSummary");
  assert.equal(
    filterSummary.tenantFilter,
    true,
    "filterSummary.tenantFilter should be true",
  );
  assert.equal(
    filterSummary.roleFilter,
    "SUPER_ADMIN",
    "filterSummary.roleFilter should match the base role",
  );
  assert.ok(
    Array.isArray(filterSummary.permissionScopes),
    "filterSummary.permissionScopes should be an array",
  );
  assert.ok(
    Array.isArray(filterSummary.explicitFilters),
    "filterSummary.explicitFilters should be an array",
  );

  // diagnostics shape
  const diagnostics = data.diagnostics as Record<string, unknown>;
  assert.ok(diagnostics, "response must include diagnostics");
  assert.equal(
    typeof diagnostics.totalLatencyMs,
    "number",
    "diagnostics.totalLatencyMs should be a number",
  );
  assert.equal(
    diagnostics.traceId,
    "test-trace-123",
    "diagnostics.traceId should match the service value",
  );
});
