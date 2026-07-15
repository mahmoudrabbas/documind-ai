import { test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";

function createMockReq(
  auth?: { userId: string; tenantId: string; role: string; email?: string },
  tenantId?: string,
): Request {
  return {
    auth,
    tenantId: tenantId ?? auth?.tenantId,
    permissionScope: null,
  } as unknown as Request;
}

function createMockRes(): Response {
  const res = {
    status: () => res,
    json: () => res,
  } as unknown as Response;
  return res;
}

test("requirePermission — throws 401 when not authenticated", async () => {
  const { requirePermission } = await import("./permissions.middleware.js");
  const middleware = requirePermission("users:read");

  const req = createMockReq();
  const res = createMockRes();
  let caughtError: unknown = null;

  await middleware(req, res, (err) => {
    caughtError = err;
  });

  assert.ok(caughtError instanceof Error);
  assert.equal((caughtError as unknown as { statusCode: number }).statusCode, 401);
});

test("requirePermission — exports a function", async () => {
  const { requirePermission } = await import("./permissions.middleware.js");
  assert.equal(typeof requirePermission, "function");
  const middleware = requirePermission("users:read");
  assert.equal(typeof middleware, "function");
});
