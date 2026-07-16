import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response } from "express";
import { InMemoryAuditWriter, type AuditWriter } from "../../common/observability/auditWriter.js";
import { InMemoryMetricRecorder } from "../../common/observability/metricRecorder.js";
import { setAuditWriter, setMetricRecorder } from "../../common/observability/index.js";
import { InMemoryPermissionEvaluator } from "./permissions.evaluator.fake.js";
import { setPermissionEvaluator } from "./permissions.evaluator.js";
import type { BaseRole } from "../../common/auth/baseRoles.js";

function createMockReq(
  auth?: { userId: string; tenantId: string; role: BaseRole; email?: string },
  tenantId?: string,
): Request {
  return {
    auth,
    tenantId: tenantId ?? auth?.tenantId,
    requestId: "request-123",
    traceId: "trace-123",
    headers: { authorization: "Bearer secret" },
    body: { protectedContents: "secret" },
    log: { error() {} },
  } as unknown as Request;
}

function createMockRes(): Response {
  const res = {
    status: () => res,
    json: () => res,
  } as unknown as Response;
  return res;
}

afterEach(() => {
  setPermissionEvaluator(null);
  setAuditWriter(null);
  setMetricRecorder(null);
});

test("allowScoped preserves the complete permission-specific authorization context", async () => {
  const tenantId = "507f1f77bcf86cd799439011";
  const actorId = "507f191e810c19729de860ea";
  const roleId = "507f191e810c19729de860eb";
  const departmentId = "507f191e810c19729de860ec";
  const evaluator = new InMemoryPermissionEvaluator();
  evaluator.addUser(actorId, tenantId, "EMPLOYEE", roleId);
  evaluator.addRole(roleId, tenantId, "EMPLOYEE", [{
    permission: "analytics:read",
    scopes: {
      selfOnly: false,
      departmentIds: [departmentId],
      documentCategories: [],
      documentClassifications: [],
    },
  }]);
  setPermissionEvaluator(evaluator);
  const req = createMockReq({ userId: actorId, tenantId, role: "EMPLOYEE" });
  let error: unknown;
  await (await import("./permissions.middleware.js")).requirePermission("analytics:read", { allowScoped: true })(
    req, createMockRes(), (nextError) => { error = nextError; },
  );
  assert.equal(error, undefined);
  assert.deepEqual(req.permissionAuthorization, {
    permission: "analytics:read",
    actorId,
    tenantId,
    source: "custom-role",
    scopes: {
      selfOnly: false,
      departmentIds: [departmentId],
      documentCategories: [],
      documentClassifications: [],
    },
    resourceContextRequired: true,
    roleId,
    roleVersion: 1,
  });

  const deniedReq = createMockReq({ userId: actorId, tenantId, role: "EMPLOYEE" });
  let deniedError: unknown;
  await (await import("./permissions.middleware.js")).requirePermission("analytics:read")(
    deniedReq, createMockRes(), (nextError) => { deniedError = nextError; },
  );
  assert.equal((deniedError as { code: string }).code, "RESOURCE_CONTEXT_REQUIRED");
  assert.equal(deniedReq.permissionAuthorization, undefined);
});

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

test("requirePermission audits denials with safe correlation metadata", async () => {
  const tenantId = "507f1f77bcf86cd799439011";
  const actorId = "507f191e810c19729de860ea";
  const evaluator = new InMemoryPermissionEvaluator();
  evaluator.addUser(actorId, tenantId, "EMPLOYEE");
  setPermissionEvaluator(evaluator);
  const writer = new InMemoryAuditWriter();
  setAuditWriter(writer);
  const req = createMockReq({ userId: actorId, tenantId, role: "EMPLOYEE", email: "actor@example.test" });

  let caughtError: unknown;
  await (await import("./permissions.middleware.js")).requirePermission("roles:create", {
    resourceType: "Role",
    resourceId: () => "new-role",
  })(req, createMockRes(), (error) => { caughtError = error; });

  assert.equal((caughtError as { code: string }).code, "PERMISSION_REQUIRED");
  assert.equal(writer.events.length, 1);
  assert.deepEqual(writer.events[0]?.metadata, { traceId: "trace-123", requestId: "request-123" });
  assert.equal(writer.events[0]?.outcome, "DENIED");
  assert.equal(writer.events[0]?.resourceType, "Role");
  assert.ok(!JSON.stringify(writer.events[0]).includes("Bearer secret"));
  assert.ok(!JSON.stringify(writer.events[0]).includes("protectedContents"));
});

test("requirePermission exposes audit writer failure through safe metric and logging", async () => {
  const tenantId = "507f1f77bcf86cd799439011";
  const actorId = "507f191e810c19729de860ea";
  const evaluator = new InMemoryPermissionEvaluator();
  evaluator.addUser(actorId, tenantId, "EMPLOYEE");
  setPermissionEvaluator(evaluator);
  const failedWriter: AuditWriter = { write: async () => false };
  const metrics = new InMemoryMetricRecorder();
  setAuditWriter(failedWriter);
  setMetricRecorder(metrics);
  let logged: unknown;
  const req = createMockReq({ userId: actorId, tenantId, role: "EMPLOYEE" });
  req.log = { error: (value: unknown) => { logged = value; } } as Request["log"];

  let caughtError: unknown;
  await (await import("./permissions.middleware.js")).requirePermission("roles:create")(
    req, createMockRes(), (error) => { caughtError = error; },
  );

  assert.equal((caughtError as { code: string }).code, "PERMISSION_REQUIRED");
  assert.equal(metrics.metrics[0]?.name, "permission_denial_audit_failure");
  assert.deepEqual(logged, {
    event: "permission_denial_audit_failure",
    permission: "roles:create",
    reason: "PERMISSION_REQUIRED",
    traceId: "trace-123",
    requestId: "request-123",
  });
});
