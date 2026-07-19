import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { InMemoryAuditWriter, MongoAuditWriter } from "../../common/observability/auditWriter.js";
import type { AuditWriter } from "../../common/observability/auditWriter.js";
import type { AuditAction } from "../../common/observability/auditEvents.js";
import { InMemoryMetricRecorder } from "../../common/observability/metricRecorder.js";
import { setAuditWriter, setMetricRecorder } from "../../common/observability/index.js";
import { logger } from "../../common/logger/logger.js";
import { AppError } from "../../common/errors/AppError.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import RoleModel from "../../db/models/role.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { assertDelegableGrants } from "../permissions/permissions.authorization.js";
import {
  assignRole,
  changeRoleStatus,
  cloneRole,
  createRole,
  deleteRole,
  getRole,
  getRoleUsage,
  migrateRoleUsers,
  removeRoleAssignment,
  setRoleTransactionAttemptHookForTests,
  updateRole,
  type RoleOperationContext,
} from "./roles.service.js";

let mongo: MongoMemoryReplSet | null = null;
let audit: InMemoryAuditWriter;

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "roles-phase2" });
  } else {
    mongo = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) }],
    });
    await mongoose.connect(mongo.getUri(), { dbName: "roles-phase2" });
  }
});

beforeEach(async () => {
  setRoleTransactionAttemptHookForTests(null);
  await Promise.all([
    TenantModel.deleteMany({}),
    UserModel.deleteMany({}),
    RoleModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
  ]);
  audit = new InMemoryAuditWriter();
  setAuditWriter(audit);
});

after(async () => {
  setAuditWriter(null);
  setMetricRecorder(null);
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function fixture(slug = new mongoose.Types.ObjectId().toString()) {
  const tenant = await TenantModel.create({ name: "Phase Two", slug, status: "active", plan: "free" });
  const admin = await UserModel.create({ tenantId: tenant._id, name: "Admin", email: `admin-${slug}@test.local`, passwordHash: "test", role: "COMPANY_ADMIN", status: "active", emailVerified: true });
  const employee = await UserModel.create({ tenantId: tenant._id, name: "Employee", email: `employee-${slug}@test.local`, passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true });
  const context: RoleOperationContext = {
    tenantId: tenant.id,
    actorId: admin.id,
    actorRole: admin.role,
    actorEmail: admin.email,
    traceId: "trace-role-test",
    requestId: "request-role-test",
  };
  return { tenant, admin, employee, context };
}

test("role security events persist complete authoritative user actors", async () => {
  const first = await fixture("audit-persistence-first");
  const second = await fixture("audit-persistence-second");
  setAuditWriter(new MongoAuditWriter());

  const source = await createRole({
    name: "Persisted Source",
    baseRole: "EMPLOYEE",
    grants: [{ permission: Permission.ANALYTICS_READ }],
  }, { ...first.context, actorEmail: "untrusted-context@example.test" });
  const updated = await updateRole({
    version: source.role.version,
    grants: [{ permission: Permission.IMPORTS_READ }],
  }, first.context, source.role.id);
  const archived = await changeRoleStatus(
    { version: updated.role.version },
    first.context,
    source.role.id,
    "archived",
  );
  const reactivated = await changeRoleStatus(
    { version: archived.role.version },
    first.context,
    source.role.id,
    "active",
  );
  const clone = await cloneRole(
    { name: "Persisted Clone", version: reactivated.role.version },
    first.context,
    source.role.id,
  );
  await deleteRole(first.context, clone.role.id, clone.role.version);

  const destination = await createRole({
    name: "Persisted Destination",
    baseRole: "EMPLOYEE",
    grants: [],
  }, first.context);
  await assignRole(
    { userId: first.employee.id, roleVersion: reactivated.role.version },
    first.context,
    source.role.id,
  );
  await removeRoleAssignment(
    { userId: first.employee.id, roleVersion: reactivated.role.version },
    first.context,
    source.role.id,
  );
  await assignRole(
    { userId: first.employee.id, roleVersion: reactivated.role.version },
    first.context,
    source.role.id,
  );
  await migrateRoleUsers({
    destinationRoleId: destination.role.id,
    sourceVersion: reactivated.role.version,
    destinationVersion: destination.role.version,
  }, first.context, source.role.id);

  await assert.rejects(
    createRole({
      name: "Blocked Escalation",
      baseRole: "EMPLOYEE",
      grants: [{ permission: Permission.BILLING_MANAGE }],
    }, first.context),
    (error: unknown) => (error as { code?: string }).code === "PRIVILEGE_ESCALATION",
  );
  await assert.rejects(
    getRole(second.context, source.role.id),
    (error: unknown) => (error as { code?: string }).code === "NOT_FOUND",
  );

  const records = await AuditLogModel.find({}).sort({ createdAt: 1 }).lean().exec();
  const requiredActions: AuditAction[] = [
    "ROLE_CREATED",
    "ROLE_UPDATED",
    "ROLE_ARCHIVED",
    "ROLE_REACTIVATED",
    "ROLE_CLONED",
    "ROLE_DELETED",
    "ROLE_ASSIGNED",
    "ROLE_ASSIGNMENT_REMOVED",
    "ROLE_USERS_MIGRATED",
    "ROLE_ESCALATION_BLOCKED",
    "ROLE_ACCESS_DENIED",
  ];
  for (const action of requiredActions) {
    assert.ok(records.some((record) => record.action === action), `missing ${action}`);
  }
  const expectedTargets: Partial<Record<AuditAction, string>> = {
    ROLE_CREATED: source.role.id,
    ROLE_UPDATED: source.role.id,
    ROLE_ARCHIVED: source.role.id,
    ROLE_REACTIVATED: source.role.id,
    ROLE_CLONED: clone.role.id,
    ROLE_DELETED: clone.role.id,
    ROLE_ASSIGNED: source.role.id,
    ROLE_ASSIGNMENT_REMOVED: source.role.id,
    ROLE_USERS_MIGRATED: source.role.id,
    ROLE_ESCALATION_BLOCKED: "new",
    ROLE_ACCESS_DENIED: source.role.id,
  };
  for (const [action, resourceId] of Object.entries(expectedTargets)) {
    assert.ok(
      records.some(
        (record) => record.action === action && record.resourceId === resourceId,
      ),
      `missing ${action} target ${resourceId}`,
    );
  }

  const firstTenantRecords = records.filter(
    (record) => record.tenantId.toString() === first.tenant.id,
  );
  assert.ok(firstTenantRecords.length > 0);
  for (const record of firstTenantRecords) {
    assert.equal(record.actorKind, "USER");
    assert.equal(record.actorId?.toString(), first.admin.id);
    assert.equal(record.actorEmail, first.admin.email);
    assert.equal(record.actorRole, "COMPANY_ADMIN");
    assert.deepEqual(record.metadata, {
      traceId: "trace-role-test",
      requestId: "request-role-test",
    });
  }

  const updateAudit = records.find(
    (record) => record.action === "ROLE_UPDATED" && record.resourceId === source.role.id,
  );
  assert.deepEqual(updateAudit?.changes.permissionsBefore, [Permission.ANALYTICS_READ]);
  assert.deepEqual(updateAudit?.changes.permissionsAfter, [Permission.IMPORTS_READ]);
  const assignmentAudit = records.find((record) => record.action === "ROLE_ASSIGNED");
  assert.equal(assignmentAudit?.changes.targetUserId, first.employee.id);
  assert.equal(assignmentAudit?.resourceId, source.role.id);
  const migrationAudit = records.find((record) => record.action === "ROLE_USERS_MIGRATED");
  assert.equal(migrationAudit?.changes.destinationRoleId, destination.role.id);
  const crossTenantAudit = records.find((record) => record.action === "ROLE_ACCESS_DENIED");
  assert.equal(crossTenantAudit?.tenantId.toString(), second.tenant.id);
  assert.equal(crossTenantAudit?.actorId?.toString(), second.admin.id);
  assert.equal(crossTenantAudit?.actorEmail, second.admin.email);
  assert.equal(crossTenantAudit?.resourceId, source.role.id);

  const serialized = JSON.stringify(records);
  for (const forbidden of [
    "untrusted-context@example.test",
    "authorization",
    "cookie",
    "password",
    "refreshToken",
    "accessToken",
    "secret",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("unresolvable role actor identity fails before mutation or audit persistence", async () => {
  const { context } = await fixture();
  setAuditWriter(new MongoAuditWriter());

  await assert.rejects(
    createRole({
      name: "Never Persisted",
      baseRole: "EMPLOYEE",
      grants: [],
    }, { ...context, actorId: new mongoose.Types.ObjectId().toString() }),
    (error: unknown) => (error as { code?: string }).code === "PERMISSION_REQUIRED",
  );

  assert.equal(await RoleModel.countDocuments({}), 0);
  assert.equal(await AuditLogModel.countDocuments({}), 0);
});

test("role detail, clone, lifecycle, usage, update, and delete are versioned and audited", async () => {
  const { context } = await fixture();
  const created = await createRole({ name: "Analyst", baseRole: "EMPLOYEE", grants: [{ permission: Permission.ANALYTICS_READ }] }, context);
  assert.equal((await getRole(context, created.role.id)).role.name, "Analyst");
  assert.equal((await getRoleUsage(context, created.role.id)).assignedUserCount, 0);

  const updated = await updateRole({ name: "Senior Analyst", version: 1 }, context, created.role.id);
  assert.equal(updated.role.version, 2);
  await assert.rejects(updateRole({ name: "Stale", version: 1 }, context, created.role.id), (error: unknown) => (error as { code?: string }).code === "STALE_ROLE_VERSION");

  const archived = await changeRoleStatus({ version: 2 }, context, created.role.id, "archived");
  const active = await changeRoleStatus({ version: 3 }, context, created.role.id, "active");
  const cloned = await cloneRole({ name: "Analyst Copy", version: active.role.version }, context, created.role.id);
  assert.deepEqual(cloned.role.grants, active.role.grants);
  await deleteRole(context, cloned.role.id, cloned.role.version);

  const actions = audit.events.map((event) => event.action);
  for (const action of ["ROLE_CREATED", "ROLE_UPDATED", "ROLE_ARCHIVED", "ROLE_REACTIVATED", "ROLE_CLONED", "ROLE_DELETED"] as AuditAction[]) assert.ok(actions.includes(action));
  assert.equal(archived.role.status, "archived");
});

test("assignment, removal, and migration are tenant-safe, idempotent, and conflict-safe", async () => {
  const { context, employee, tenant } = await fixture();
  const second = await UserModel.create({ tenantId: tenant._id, name: "Second", email: "second@test.local", passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true });
  const source = await createRole({ name: "Source", baseRole: "EMPLOYEE", grants: [{ permission: Permission.IMPORTS_READ }] }, context);
  const destination = await createRole({ name: "Destination", baseRole: "EMPLOYEE", grants: [{ permission: Permission.ANALYTICS_READ }] }, context);

  assert.equal((await assignRole({ userId: employee.id, roleVersion: 1 }, context, source.role.id)).changed, true);
  assert.equal((await assignRole({ userId: employee.id, roleVersion: 1 }, context, source.role.id)).changed, false);
  await assignRole({ userId: second.id, roleVersion: 1 }, context, source.role.id);
  const migrated = await migrateRoleUsers({ destinationRoleId: destination.role.id, sourceVersion: 1, destinationVersion: 1 }, context, source.role.id);
  assert.deepEqual(migrated, { sourceRoleId: source.role.id, destinationRoleId: destination.role.id, affected: 2, skipped: 0, conflicted: 0 });
  assert.equal((await migrateRoleUsers({ destinationRoleId: destination.role.id, sourceVersion: 1, destinationVersion: 1 }, context, source.role.id)).affected, 0);
  assert.equal((await getRoleUsage(context, destination.role.id)).assignedUserCount, 2);
  assert.equal((await removeRoleAssignment({ userId: employee.id, roleVersion: 1 }, context, destination.role.id)).changed, true);
  assert.equal((await removeRoleAssignment({ userId: employee.id, roleVersion: 1 }, context, destination.role.id)).changed, false);
  await assert.rejects(deleteRole(context, destination.role.id, 1), (error: unknown) => (error as { code?: string }).code === "ROLE_IN_USE");

  const actions = audit.events.map((event) => event.action);
  for (const action of ["ROLE_ASSIGNED", "ROLE_ASSIGNMENT_REMOVED", "ROLE_USERS_MIGRATED"] as AuditAction[]) assert.ok(actions.includes(action));
});

test("direct services enforce authorization, delegation, archive state, and tenant isolation", async () => {
  const first = await fixture("first-tenant");
  const second = await fixture("second-tenant");
  await assert.rejects(
    createRole({ name: "Bypass", baseRole: "EMPLOYEE", grants: [] }, {
      tenantId: first.tenant.id,
      actorId: first.employee.id,
      actorEmail: first.employee.email,
      actorRole: first.employee.role,
    }),
    (error: unknown) => (error as { code?: string }).code === "PERMISSION_REQUIRED",
  );
  await assert.rejects(
    createRole({ name: "Billing Manager", baseRole: "EMPLOYEE", grants: [{ permission: Permission.BILLING_MANAGE }] }, first.context),
    (error: unknown) => (error as { code?: string }).code === "PRIVILEGE_ESCALATION",
  );
  assert.ok(audit.events.some((event) => event.action === "ROLE_ESCALATION_BLOCKED" && event.outcome === "DENIED"));

  const role = await createRole({ name: "Scoped Role", baseRole: "EMPLOYEE", grants: [] }, first.context);
  await assert.rejects(getRole(second.context, role.role.id), (error: unknown) => (error as { statusCode?: number }).statusCode === 404);
  assert.ok(audit.events.some((event) => event.action === "ROLE_ACCESS_DENIED" && event.outcome === "DENIED" && event.changes?.reason === "ROLE_NOT_FOUND_OR_TENANT_MISMATCH"));
  const archived = await changeRoleStatus({ version: 1 }, first.context, role.role.id, "archived");
  await assert.rejects(
    assignRole({ userId: first.employee.id, roleVersion: archived.role.version }, first.context, role.role.id),
    (error: unknown) => (error as { code?: string }).code === "ROLE_NOT_ASSIGNABLE",
  );
  await assert.rejects(
    assignRole({ userId: second.employee.id, roleVersion: archived.role.version }, first.context, role.role.id),
    (error: unknown) => ["ROLE_NOT_ASSIGNABLE", "NOT_FOUND"].includes((error as { code?: string }).code ?? ""),
  );
});

test("delegation rejects scope widening and direct-service crafted grants", async () => {
  const { context, employee, tenant } = await fixture();
  const departmentId = new mongoose.Types.ObjectId().toString();
  const otherDepartmentId = new mongoose.Types.ObjectId().toString();
  const scoped = await createRole({
    name: "Scoped Delegator",
    baseRole: "EMPLOYEE",
    grants: [{ permission: Permission.DOCUMENTS_UPDATE, scopes: { departmentIds: [departmentId] } }],
  }, context);
  await assignRole({ userId: employee.id, roleVersion: scoped.role.version }, context, scoped.role.id);
  const employeeActor = {
    tenantId: tenant.id,
    actorId: employee.id,
    actorEmail: employee.email,
    actorRole: employee.role,
  };

  await assertDelegableGrants(employeeActor, [{
    permission: Permission.DOCUMENTS_UPDATE,
    scopes: { selfOnly: false, departmentIds: [departmentId], documentCategories: [], documentClassifications: [] },
  }]);
  await assert.rejects(assertDelegableGrants(employeeActor, [{
    permission: Permission.DOCUMENTS_UPDATE,
    scopes: { selfOnly: false, departmentIds: [otherDepartmentId], documentCategories: [], documentClassifications: [] },
  }]), (error: unknown) => (error as { code?: string }).code === "PRIVILEGE_ESCALATION");
  await assert.rejects(createRole({
    name: "Crafted",
    baseRole: "EMPLOYEE",
    grants: [{ permission: Permission.DOCUMENTS_UPDATE }],
  }, employeeActor), (error: unknown) => (error as { code?: string }).code === "PERMISSION_REQUIRED");
});

test("concurrent assignment retries produce one change and one idempotent result", async () => {
  const { context, employee } = await fixture();
  const role = await createRole({ name: "Concurrent Assignment", baseRole: "EMPLOYEE", grants: [] }, context);
  const results = await Promise.all([
    assignRole({ userId: employee.id, roleVersion: role.role.version }, context, role.role.id),
    assignRole({ userId: employee.id, roleVersion: role.role.version }, context, role.role.id),
  ]);
  assert.deepEqual(results.map((result) => result.changed).sort(), [false, true]);
  assert.equal((await UserModel.findById(employee.id).lean().exec())?.customRoleId?.toString(), role.role.id);
});

test("migration reports incompatible persisted assignments as skipped", async () => {
  const { context, tenant } = await fixture();
  const source = await createRole({ name: "Migration Source", baseRole: "EMPLOYEE", grants: [] }, context);
  const destination = await createRole({ name: "Migration Destination", baseRole: "EMPLOYEE", grants: [] }, context);
  await UserModel.create({
    tenantId: tenant._id,
    name: "Corrupt Assignment",
    email: "corrupt-assignment@test.local",
    passwordHash: "test",
    role: "COMPANY_ADMIN",
    customRoleId: source.role.id,
    status: "active",
    emailVerified: true,
  });
  const result = await migrateRoleUsers({ destinationRoleId: destination.role.id, sourceVersion: 1, destinationVersion: 1 }, context, source.role.id);
  assert.deepEqual(result, { sourceRoleId: source.role.id, destinationRoleId: destination.role.id, affected: 0, skipped: 1, conflicted: 0 });
});

test("unknown and deprecated permissions fail without persisting roles", async () => {
  const { context } = await fixture();
  for (const [name, permission] of [["Unknown Permission", "unknown:permission"], ["Deprecated Permission", "documents:view"]]) {
    await assert.rejects(createRole({ name, baseRole: "EMPLOYEE", grants: [{ permission }] }, context),
      (error: unknown) => (error as { code?: string }).code === "UNKNOWN_PERMISSION");
  }
  assert.equal(await RoleModel.countDocuments({}), 0);
});

test("quarantined roles cannot be reactivated or assigned", async () => {
  const { context, employee, tenant, admin } = await fixture();
  const roleId = new mongoose.Types.ObjectId();
  await RoleModel.collection.insertOne({
    _id: roleId,
    tenantId: tenant._id,
    name: "Quarantined",
    normalizedName: "quarantined",
    baseRole: "EMPLOYEE",
    grants: [],
    contractVersion: 1,
    status: "archived",
    version: 1,
    migrationState: "quarantined",
    migrationReason: "MALFORMED_GRANTS",
    createdBy: admin._id,
    updatedBy: admin._id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await assert.rejects(changeRoleStatus({ version: 1 }, context, roleId.toString(), "active"),
    (error: unknown) => (error as { code?: string }).code === "ROLE_NOT_ASSIGNABLE");
  await assert.rejects(assignRole({ userId: employee.id, roleVersion: 1 }, context, roleId.toString()),
    (error: unknown) => (error as { code?: string }).code === "ROLE_NOT_ASSIGNABLE");
});

test("clone rejects archived, quarantined, stale-contract, invalid-provenance, and cross-tenant sources", async () => {
  const first = await fixture("clone-first");
  const second = await fixture("clone-second");
  const cases = [
    { name: "Archived Source", status: "archived", migrationState: "complete", contractVersion: 1, createdBy: first.admin._id },
    { name: "Quarantined Source", status: "active", migrationState: "quarantined", contractVersion: 1, createdBy: first.admin._id },
    { name: "Stale Contract Source", status: "active", migrationState: "complete", contractVersion: 0, createdBy: first.admin._id },
    { name: "Invalid Provenance Source", status: "active", migrationState: "complete", contractVersion: 1, createdBy: second.admin._id },
  ];
  for (const item of cases) {
    const id = new mongoose.Types.ObjectId();
    await RoleModel.collection.insertOne({
      _id: id,
      tenantId: first.tenant._id,
      name: item.name,
      normalizedName: item.name.toLowerCase(),
      baseRole: "EMPLOYEE",
      grants: [],
      status: item.status,
      migrationState: item.migrationState,
      contractVersion: item.contractVersion,
      version: 1,
      createdBy: item.createdBy,
      updatedBy: item.createdBy,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await assert.rejects(
      cloneRole({ name: `${item.name} Copy`, version: 1 }, first.context, id.toString()),
      (error: unknown) => (error as { code?: string }).code === "ROLE_NOT_ASSIGNABLE",
    );
    assert.equal(await RoleModel.exists({ tenantId: first.tenant._id, normalizedName: `${item.name.toLowerCase()} copy` }), null);
  }

  const foreign = await createRole({ name: "Foreign Source", baseRole: "EMPLOYEE", grants: [] }, second.context);
  await assert.rejects(
    cloneRole({ name: "Foreign Copy", version: 1 }, first.context, foreign.role.id),
    (error: unknown) => (error as { code?: string }).code === "NOT_FOUND",
  );
});

test("clone enforces source version and duplicate names without creating a role", async () => {
  const { context } = await fixture();
  const source = await createRole({ name: "Clone Source", baseRole: "EMPLOYEE", grants: [] }, context);
  await createRole({ name: "Existing Name", baseRole: "EMPLOYEE", grants: [] }, context);
  const before = await RoleModel.countDocuments({});
  await assert.rejects(
    cloneRole({ name: "Never Created", version: source.role.version + 1 }, context, source.role.id),
    (error: unknown) => (error as { code?: string }).code === "ROLE_VERSION_CONFLICT",
  );
  await assert.rejects(
    cloneRole({ name: "Existing Name", version: source.role.version }, context, source.role.id),
    (error: unknown) => (error as { code?: string }).code === "DUPLICATE_ROLE_NAME",
  );
  assert.equal(await RoleModel.countDocuments({}), before);
});

test("audit false is non-blocking, increments the role metric, and changed:false emits no success event", async () => {
  const { context, employee } = await fixture();
  const metrics = new InMemoryMetricRecorder();
  setMetricRecorder(metrics);
  const failedWriter: AuditWriter = { write: async () => false };
  setAuditWriter(failedWriter);
  const created = await createRole({ name: "Audit Failure Role", baseRole: "EMPLOYEE", grants: [] }, context);
  assert.equal(created.role.name, "Audit Failure Role");
  assert.ok(metrics.metrics.some((metric) =>
    metric.name === "role_operation_audit_failure" &&
    metric.tags?.action === "ROLE_CREATED"));

  audit = new InMemoryAuditWriter();
  setAuditWriter(audit);
  await assignRole({ userId: employee.id, roleVersion: created.role.version }, context, created.role.id);
  const eventCount = audit.events.length;
  const repeated = await assignRole({ userId: employee.id, roleVersion: created.role.version }, context, created.role.id);
  assert.equal(repeated.changed, false);
  assert.equal(audit.events.length, eventCount);
  await removeRoleAssignment({ userId: employee.id, roleVersion: created.role.version }, context, created.role.id);
  const removalEventCount = audit.events.length;
  const repeatedRemoval = await removeRoleAssignment({ userId: employee.id, roleVersion: created.role.version }, context, created.role.id);
  assert.equal(repeatedRemoval.changed, false);
  assert.equal(audit.events.length, removalEventCount);
});

test("audit failure logging is allowlisted and a rolled-back mutation emits no success audit", async () => {
  const { context } = await fixture();
  const metrics = new InMemoryMetricRecorder();
  setMetricRecorder(metrics);
  setAuditWriter({ write: async () => false });
  const records: Array<Record<string, unknown>> = [];
  const originalError = logger.error;
  logger.error = ((record: Record<string, unknown>) => {
    records.push(record);
  }) as typeof logger.error;
  try {
    const created = await createRole({
      name: "Safe Audit Log",
      baseRole: "EMPLOYEE",
      grants: [{ permission: Permission.ANALYTICS_READ }],
    }, { ...context, actorEmail: "sensitive@example.test" });
    assert.equal(created.role.name, "Safe Audit Log");
    assert.equal(records.length, 1);
    assert.deepEqual(Object.keys(records[0]!).sort(), [
      "action", "actorId", "requestId", "resourceId", "tenantId", "traceId",
    ]);
    const serialized = JSON.stringify(records[0]);
    for (const forbidden of [
      "sensitive@example.test", "grants", "permissions", "scopes",
      "token", "password", "secret",
    ]) {
      assert.equal(serialized.includes(forbidden), false);
    }
  } finally {
    logger.error = originalError;
  }

  audit = new InMemoryAuditWriter();
  setAuditWriter(audit);
  const before = audit.events.length;
  await assert.rejects(createRole({
    name: "Safe Audit Log",
    baseRole: "EMPLOYEE",
    grants: [],
  }, context), (error: unknown) => (error as { code?: string }).code === "DUPLICATE_ROLE_NAME");
  assert.equal(audit.events.filter((event) => event.action === "ROLE_CREATED").length, before);
});

test("a transaction callback retry emits one post-commit success audit", async () => {
  const { context } = await fixture();
  audit = new InMemoryAuditWriter();
  setAuditWriter(audit);
  let attempts = 0;
  setRoleTransactionAttemptHookForTests(() => {
    attempts += 1;
    if (attempts === 1) {
      const error = new mongoose.mongo.MongoServerError({
        message: "deterministic transaction retry",
        code: 112,
      });
      error.addErrorLabel("TransientTransactionError");
      throw error;
    }
  });
  try {
    const created = await createRole({
      name: "Retry Audit Once",
      baseRole: "EMPLOYEE",
      grants: [],
    }, context);
    assert.equal(created.role.name, "Retry Audit Once");
    assert.equal(attempts, 2);
    assert.equal(audit.events.filter((event) =>
      event.action === "ROLE_CREATED" && event.resourceId === created.role.id).length, 1);
  } finally {
    setRoleTransactionAttemptHookForTests(null);
  }
});

test("migration rejects destination role with invalid provenance inside the transaction", async () => {
  const first = await fixture("provenance-test-a");
  const second = await fixture("provenance-test-b");
  const source = await createRole({ name: "Provenance Source", baseRole: "EMPLOYEE", grants: [] }, first.context);
  await assignRole({ userId: first.employee.id, roleVersion: source.role.version }, first.context, source.role.id);
  const destId = new mongoose.Types.ObjectId();
  await RoleModel.collection.insertOne({
    _id: destId,
    tenantId: first.tenant._id,
    name: "Invalid Provenance Dest",
    normalizedName: "invalid-provenance-dest",
    baseRole: "EMPLOYEE",
    grants: [],
    contractVersion: 1,
    status: "active",
    version: 1,
    migrationState: "complete",
    createdBy: second.admin._id,
    updatedBy: first.admin._id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await assert.rejects(
    migrateRoleUsers({ destinationRoleId: destId.toString(), sourceVersion: source.role.version, destinationVersion: 1 }, first.context, source.role.id),
    (error: unknown) => (error as { code?: string }).code === "ROLE_NOT_ASSIGNABLE",
  );
  assert.equal(await UserModel.countDocuments({ customRoleId: source.role.id }), 1);
  assert.equal(await UserModel.countDocuments({ customRoleId: destId }), 0);
});

test("migration rejects destination role with noncanonical grants inside the transaction", async () => {
  const { context, tenant, admin, employee } = await fixture();
  const source = await createRole({ name: "Noncanonical Source", baseRole: "EMPLOYEE", grants: [{ permission: Permission.ANALYTICS_READ }] }, context);
  await assignRole({ userId: employee.id, roleVersion: source.role.version }, context, source.role.id);
  const destId = new mongoose.Types.ObjectId();
  await RoleModel.collection.insertOne({
    _id: destId,
    tenantId: tenant._id,
    name: "Noncanonical Grants Dest",
    normalizedName: "noncanonical-grants-dest",
    baseRole: "EMPLOYEE",
    grants: [
      { permission: Permission.ANALYTICS_READ },
      { permission: Permission.ANALYTICS_EXPORT },
    ],
    contractVersion: 1,
    status: "active",
    version: 1,
    migrationState: "complete",
    createdBy: admin._id,
    updatedBy: admin._id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  await assert.rejects(
    migrateRoleUsers({ destinationRoleId: destId.toString(), sourceVersion: source.role.version, destinationVersion: 1 }, context, source.role.id),
    (error: unknown) => (error as { code?: string }).code === "ROLE_NOT_ASSIGNABLE",
  );
  assert.equal(await UserModel.countDocuments({ customRoleId: source.role.id }), 1);
  assert.equal(await UserModel.countDocuments({ customRoleId: destId }), 0);
});

test("update validates the complete persisted grant set before changing other fields", async () => {
  const { context, tenant, admin } = await fixture();
  const roleId = new mongoose.Types.ObjectId();
  await RoleModel.collection.insertOne({
    _id: roleId,
    tenantId: tenant._id,
    name: "Invalid Existing Grants",
    normalizedName: "invalid existing grants",
    baseRole: "EMPLOYEE",
    grants: [
      { permission: Permission.ANALYTICS_READ },
      { permission: Permission.ANALYTICS_EXPORT },
    ],
    contractVersion: 1,
    status: "active",
    version: 1,
    migrationState: "complete",
    createdBy: admin._id,
    updatedBy: admin._id,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  await assert.rejects(
    updateRole(
      { name: "Never Renamed", version: 1 },
      context,
      roleId.toString(),
    ),
    (error: unknown) =>
      error instanceof AppError && error.code === "ROLE_NOT_ASSIGNABLE",
  );

  const persisted = await RoleModel.collection.findOne({ _id: roleId });
  assert.equal(persisted?.name, "Invalid Existing Grants");
  assert.equal(persisted?.version, 1);
  assert.ok(audit.events.some((event) =>
    event.action === "ROLE_ACCESS_DENIED" &&
    event.resourceId === roleId.toString() &&
    event.outcome === "DENIED" &&
    event.changes?.reason === "ROLE_NOT_ASSIGNABLE"));
});
