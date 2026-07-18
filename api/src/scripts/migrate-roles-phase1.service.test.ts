import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Permission } from "../modules/permissions/permissions.catalog.js";
import { PermissionEvaluatorImpl } from "../modules/permissions/permissions.evaluator.js";
import { listRoles } from "../modules/roles/roles.service.js";
import {
  migrateRolesPhase1,
  type RawMigrationCollection,
} from "./migrate-roles-phase1.service.js";
import { migrateLegacyUsersToEmployee } from "./migrate-users-employee.service.js";

let mongoServer: MongoMemoryReplSet | null = null;

function collections() {
  if (!mongoose.connection.db) throw new Error("Test database is unavailable");
  const rawRoles = mongoose.connection.db.collection("roles");
  const rawUsers = mongoose.connection.db.collection("users");
  const rawRefresh = mongoose.connection.db.collection("refresh_tokens");
  return {
    roles: rawRoles as unknown as RawMigrationCollection,
    users: rawUsers as unknown as RawMigrationCollection,
    refresh: rawRefresh as unknown as RawMigrationCollection,
    rawRoles, rawUsers, rawRefresh,
  };
}

function legacyRole(tenantId: mongoose.Types.ObjectId, values: Record<string, unknown> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(), tenantId, name: "Document Analyst",
    normalizedName: "document analyst", baseRole: "EMPLOYEE",
    status: "active", version: 1, createdAt: new Date(), updatedAt: new Date(), ...values,
  };
}

function user(tenantId: mongoose.Types.ObjectId, values: Record<string, unknown> = {}) {
  return {
    _id: new mongoose.Types.ObjectId(), tenantId, name: "Migration User",
    email: `${new mongoose.Types.ObjectId().toHexString()}@example.test`, passwordHash: "preserve-me",
    role: "EMPLOYEE", status: "active", emailVerified: true,
    createdAt: new Date(), updatedAt: new Date(), ...values,
  };
}

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "role-phase1-migration" });
  } else {
    mongoServer = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [{ launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) }],
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "role-phase1-migration" });
  }
});

beforeEach(async () => {
  const { rawRoles, rawUsers, rawRefresh } = collections();
  await Promise.all([rawRoles.deleteMany({}), rawUsers.deleteMany({}), rawRefresh.deleteMany({})]);
});

after(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

test("role migration is dry-run by default and apply is conditional and idempotent", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const actor = user(tenantId);
  const role = legacyRole(tenantId, {
    permissions: [Permission.ANALYTICS_READ, Permission.USERS_DELETE, "audit:platform-read", "documents:view", "missing:permission"],
    scopes: { selfOnly: false, departmentIds: [], documentCategories: [], documentClassifications: [] },
  });
  const { roles, users, rawRoles, rawUsers } = collections();
  await rawRoles.insertOne(role);
  await rawUsers.insertOne({ ...actor, customRoleId: role._id });

  const dry = await migrateRolesPhase1(roles, users);
  assert.equal(dry.mode, "dry-run");
  assert.equal(dry.rolesWithAssignments, 1);
  assert.equal(dry.assignments, 1);
  assert.equal(dry.wouldUpdate, 1);
  assert.equal(dry.updated, 0);
  assert.equal(dry.legacyPermissionEntriesRemoved, 4);
  assert.equal(Object.hasOwn((await rawRoles.findOne({ _id: role._id })) ?? {}, "grants"), false);

  const applied = await migrateRolesPhase1(roles, users, { apply: true });
  const migrated = await rawRoles.findOne({ _id: role._id });
  assert.equal(applied.updated, 1);
  assert.deepEqual(applied.updatedRoleIds, [role._id.toHexString()]);
  assert.deepEqual(migrated?.grants, [{ permission: Permission.ANALYTICS_READ }]);
  assert.equal(migrated?.contractVersion, 1);
  assert.equal(migrated?.migrationState, "complete");
  assert.deepEqual(migrated?.createdBy, actor._id);
  assert.deepEqual(migrated?.updatedBy, actor._id);
  assert.equal(Object.hasOwn(migrated ?? {}, "permissions"), false);
  assert.equal(Object.hasOwn(migrated ?? {}, "scopes"), false);

  const repeated = await migrateRolesPhase1(roles, users, { apply: true });
  assert.equal(repeated.updated, 0);
  assert.equal(repeated.alreadyMigrated, 1);
});

test("tenant and after-id filters produce resumable safe identifier output", async () => {
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const first = legacyRole(tenantA, { _id: new mongoose.Types.ObjectId("100000000000000000000001") });
  const second = legacyRole(tenantA, { _id: new mongoose.Types.ObjectId("100000000000000000000002"), name: "Second Role", normalizedName: "second role" });
  const other = legacyRole(tenantB, { _id: new mongoose.Types.ObjectId("100000000000000000000003") });
  const { roles, users, rawRoles, rawUsers } = collections();
  await rawRoles.insertMany([first, second, other]);
  await rawUsers.insertMany([user(tenantA), user(tenantB)]);

  const report = await migrateRolesPhase1(roles, users, {
    tenantId: tenantA.toHexString(), afterId: first._id.toHexString(),
  });
  assert.equal(report.tenantFiltered, true);
  assert.deepEqual(report.scannedRoleIds, [second._id.toHexString()]);
  assert.equal(report.lastScannedId, second._id.toHexString());
  assert.equal(JSON.stringify(report).includes("@example.test"), false);
  assert.equal(Object.hasOwn((await rawRoles.findOne({ _id: first._id })) ?? {}, "grants"), false);
});

test("actorless, malformed, and cross-tenant provenance roles are quarantined and list safely", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const otherTenant = new mongoose.Types.ObjectId();
  const crossActor = user(otherTenant);
  const sameTenantActor = user(tenantId);
  const actorlessTenant = new mongoose.Types.ObjectId();
  const actorless = legacyRole(actorlessTenant, { name: "Actorless", normalizedName: "actorless" });
  const malformed = legacyRole(tenantId, { name: "Malformed", normalizedName: "malformed", permissions: "not-an-array" });
  const crossTenant = legacyRole(tenantId, {
    name: "Cross Tenant", normalizedName: "cross tenant", createdBy: crossActor._id, updatedBy: crossActor._id,
  });
  const { roles, users, rawRoles, rawUsers } = collections();
  await rawRoles.insertMany([actorless, malformed, crossTenant]);
  await rawUsers.insertMany([crossActor, { ...sameTenantActor, customRoleId: malformed._id }]);

  const report = await migrateRolesPhase1(roles, users, { apply: true });
  assert.equal(report.quarantined, 3);
  assert.equal(report.actorless, 1);
  assert.equal(report.malformed, 1);
  assert.equal(report.crossTenantActor, 1);
  assert.equal(report.rolesWithAssignments, 1);
  for (const role of await rawRoles.find({}).toArray()) {
    assert.equal(role.status, "archived");
    assert.deepEqual(role.grants, []);
    assert.equal(role.contractVersion, 1);
    assert.equal(role.migrationState, "quarantined");
    assert.equal(typeof role.migrationReason, "string");
  }
  const cross = await rawRoles.findOne({ _id: crossTenant._id });
  assert.equal(cross?.createdBy, null);
  assert.equal(cross?.updatedBy, null);
  const listingAdmin = user(tenantId, { role: "COMPANY_ADMIN" });
  await rawUsers.insertOne(listingAdmin);
  const listed = await listRoles(tenantId.toHexString(), listingAdmin._id.toHexString());
  assert.equal(listed.roles.length, 2);
  assert.ok(listed.roles.every((role) => role.migrationState === "quarantined" && Array.isArray(role.grants)));
  const repeated = await migrateRolesPhase1(roles, users, { apply: true });
  assert.equal(repeated.updated, 0);
  assert.equal(repeated.alreadyMigrated, 3);
});

test("assigned migrated grants do not add filtered privileges and evaluator enforces their scopes", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const departmentId = new mongoose.Types.ObjectId().toHexString();
  const actor = user(tenantId);
  const role = legacyRole(tenantId, {
    permissions: [Permission.ANALYTICS_READ, Permission.USERS_DELETE],
    scopes: { selfOnly: false, departmentIds: [departmentId], documentCategories: [], documentClassifications: [] },
  });
  const { roles, users, rawRoles, rawUsers } = collections();
  await rawRoles.insertOne(role);
  await rawUsers.insertOne({ ...actor, customRoleId: role._id });
  await migrateRolesPhase1(roles, users, { apply: true });

  const evaluator = new PermissionEvaluatorImpl();
  const input = { actorId: actor._id.toHexString(), tenantId: tenantId.toHexString(), baseRole: "EMPLOYEE" as const };
  const resolved = await evaluator.resolve(input);
  assert.equal(resolved.customRoleState, "active");
  assert.equal(resolved.permissions.has(Permission.ANALYTICS_READ), true);
  assert.equal(resolved.permissions.has(Permission.USERS_DELETE), false);
  assert.equal((await evaluator.evaluate({ ...input, permission: Permission.ANALYTICS_READ, resource: { tenantId: tenantId.toHexString(), departmentId } })).allowed, true);
  assert.equal((await evaluator.evaluate({ ...input, permission: Permission.ANALYTICS_READ, resource: { tenantId: tenantId.toHexString(), departmentId: new mongoose.Types.ObjectId().toHexString() } })).allowed, false);
});

test("legacy USER migration preserves fields, validates custom roles, revokes sessions, filters, and is idempotent", async () => {
  const tenantA = new mongoose.Types.ObjectId();
  const tenantB = new mongoose.Types.ObjectId();
  const validUserId = new mongoose.Types.ObjectId();
  const roleFields = {
    grants: [{ permission: Permission.ANALYTICS_READ }], contractVersion: 1, status: "active",
    version: 1, migrationState: "complete", createdBy: validUserId, updatedBy: validUserId,
  };
  const validRole = legacyRole(tenantA, { baseRole: "EMPLOYEE", ...roleFields });
  const wrongBaseRole = legacyRole(tenantA, { name: "Admin Role", normalizedName: "admin role", baseRole: "COMPANY_ADMIN", ...roleFields });
  const valid = user(tenantA, { _id: validUserId, role: "USER", customRoleId: validRole._id, marker: { preserve: true } });
  const invalid = user(tenantA, { role: "USER", customRoleId: wrongBaseRole._id, marker: { preserve: true } });
  const filtered = user(tenantB, { role: "USER" });
  const { roles, users, refresh, rawRoles, rawUsers, rawRefresh } = collections();
  await rawRoles.insertMany([validRole, wrongBaseRole]);
  await rawUsers.insertMany([valid, invalid, filtered]);
  await rawRefresh.insertMany([valid, invalid].map((item) => ({
    tenantId: tenantA, userId: item._id, revokedAt: null, tokenHash: item._id.toHexString(),
  })));
  const evaluator = new PermissionEvaluatorImpl();
  const evaluationInput = {
    actorId: valid._id.toHexString(), tenantId: tenantA.toHexString(), baseRole: "EMPLOYEE" as const,
  };
  assert.equal((await evaluator.resolve(evaluationInput)).permissions.size, 0);

  const dry = await migrateLegacyUsersToEmployee(users, roles, refresh, { tenantId: tenantA.toHexString() });
  assert.equal(dry.mode, "dry-run");
  assert.equal(dry.usersScanned, 2);
  assert.equal(dry.invalidCustomRolesCleared, 2);
  assert.equal((await rawUsers.findOne({ _id: valid._id }))?.role, "USER");

  const applied = await migrateLegacyUsersToEmployee(users, roles, refresh, { apply: true, tenantId: tenantA.toHexString() });
  assert.equal(applied.updated, 2);
  assert.equal(applied.refreshRecordsRevoked, 2);
  assert.equal(applied.reauthenticationRequired, true);
  const validAfter = await rawUsers.findOne({ _id: valid._id });
  const invalidAfter = await rawUsers.findOne({ _id: invalid._id });
  assert.equal(validAfter?.role, "EMPLOYEE");
  assert.equal(validAfter?.customRoleId, null);
  assert.equal(validAfter?.permissionBaseline, "legacy-none");
  assert.equal(validAfter?.roleMigrationState, "complete");
  assert.deepEqual(validAfter?.marker, { preserve: true });
  assert.equal(validAfter?.passwordHash, "preserve-me");
  assert.equal(invalidAfter?.customRoleId, null);
  assert.equal((await rawUsers.findOne({ _id: filtered._id }))?.role, "USER");
  assert.equal(await rawRefresh.countDocuments({ revokedAt: null }), 0);
  const migratedPermissions = await evaluator.resolve(evaluationInput);
  assert.equal(migratedPermissions.baseRole, "EMPLOYEE");
  assert.deepEqual([...migratedPermissions.permissions], []);
  assert.equal(migratedPermissions.permissions.has(Permission.DOCUMENTS_READ), false);
  assert.equal(migratedPermissions.permissions.has(Permission.ANALYTICS_READ), false);
  assert.equal(migratedPermissions.permissions.has(Permission.ROLES_CREATE), false);

  const repeated = await migrateLegacyUsersToEmployee(users, roles, refresh, { apply: true, tenantId: tenantA.toHexString() });
  assert.equal(repeated.updated, 0);
  assert.equal(repeated.usersScanned, 0);
});

test("unknown, missing, inactive, and disabled legacy role statuses quarantine fail-closed", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const actor = user(tenantId);
  const statuses: unknown[] = [undefined, "inactive", "disabled", "unexpected", 42];
  const rolesToMigrate = statuses.map((status, index) => {
    const role = legacyRole(tenantId, {
      name: `Unsafe Status ${index}`,
      normalizedName: `unsafe status ${index}`,
      permissions: [Permission.ANALYTICS_READ],
    });
    if (status === undefined) delete (role as Record<string, unknown>).status;
    else (role as Record<string, unknown>).status = status;
    return role;
  });
  const { roles, users, rawRoles, rawUsers } = collections();
  await rawUsers.insertOne(actor);
  await rawRoles.insertMany(rolesToMigrate);

  const report = await migrateRolesPhase1(roles, users, { apply: true });
  assert.equal(report.quarantined, statuses.length);
  for (const role of await rawRoles.find({}).toArray()) {
    assert.equal(role.status, "archived");
    assert.equal(role.migrationState, "quarantined");
    assert.deepEqual(role.grants, []);
  }
});

test("legacy user migration resumes after session revocation failure and revokes missing revokedAt records", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const legacy = user(tenantId, { role: "USER" });
  const { roles, users, refresh, rawUsers, rawRefresh } = collections();
  await rawUsers.insertOne(legacy);
  await rawRefresh.insertMany([
    { tenantId, userId: legacy._id, tokenHash: "one", revokedAt: null },
    { tenantId, userId: legacy._id, tokenHash: "two" },
  ]);
  let failed = false;
  const failingRefresh: RawMigrationCollection = {
    find: (...args) => refresh.find(...args),
    updateOne: (...args) => refresh.updateOne(...args),
    updateMany: async () => {
      if (!failed) {
        failed = true;
        throw new Error("sensitive database failure");
      }
      throw new Error("unexpected retry through wrapper");
    },
  };
  await assert.rejects(
    migrateLegacyUsersToEmployee(users, roles, failingRefresh, { apply: true, tenantId: tenantId.toHexString() }),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "SESSION_REVOCATION_FAILED"),
  );
  const pending = await rawUsers.findOne({ _id: legacy._id });
  assert.equal(pending?.role, "EMPLOYEE");
  assert.equal(pending?.roleMigrationState, "pending-session-revocation");
  assert.equal((await new PermissionEvaluatorImpl().resolve({
    actorId: legacy._id.toHexString(), tenantId: tenantId.toHexString(), baseRole: "EMPLOYEE",
  })).permissions.size, 0);

  const retried = await migrateLegacyUsersToEmployee(users, roles, refresh, { apply: true, tenantId: tenantId.toHexString() });
  assert.equal(retried.updated, 1);
  assert.equal(retried.refreshRecordsRevoked, 2);
  assert.equal(await rawRefresh.countDocuments({ $or: [{ revokedAt: null }, { revokedAt: { $exists: false } }] }), 0);
  assert.equal((await rawUsers.findOne({ _id: legacy._id }))?.roleMigrationState, "complete");
});

test("legacy user migration retries failures before transition and after revocation", async () => {
  const beforeTenant = new mongoose.Types.ObjectId();
  const completionTenant = new mongoose.Types.ObjectId();
  const beforeUser = user(beforeTenant, { role: "USER" });
  const completionUser = user(completionTenant, { role: "USER" });
  const { roles, users, refresh, rawUsers, rawRefresh } = collections();
  await rawUsers.insertMany([beforeUser, completionUser]);
  await rawRefresh.insertMany([
    { tenantId: beforeTenant, userId: beforeUser._id, tokenHash: "before", revokedAt: null },
    { tenantId: completionTenant, userId: completionUser._id, tokenHash: "completion", revokedAt: null },
  ]);

  const failBefore: RawMigrationCollection = {
    find: (...args) => users.find(...args),
    updateOne: async () => { throw new Error("raw database detail"); },
  };
  await assert.rejects(
    migrateLegacyUsersToEmployee(failBefore, roles, refresh, { apply: true, tenantId: beforeTenant.toHexString() }),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "USER_TRANSITION_FAILED"),
  );
  assert.equal((await rawUsers.findOne({ _id: beforeUser._id }))?.role, "USER");
  assert.equal((await migrateLegacyUsersToEmployee(users, roles, refresh, { apply: true, tenantId: beforeTenant.toHexString() })).updated, 1);

  let updateCalls = 0;
  const failCompletion: RawMigrationCollection = {
    find: (...args) => users.find(...args),
    updateOne: async (...args) => {
      updateCalls += 1;
      if (updateCalls === 2) throw new Error("raw database detail");
      return users.updateOne(...args);
    },
  };
  await assert.rejects(
    migrateLegacyUsersToEmployee(failCompletion, roles, refresh, { apply: true, tenantId: completionTenant.toHexString() }),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "USER_COMPLETION_FAILED"),
  );
  assert.equal((await rawUsers.findOne({ _id: completionUser._id }))?.roleMigrationState, "pending-session-revocation");
  assert.equal(await rawRefresh.countDocuments({ tenantId: completionTenant, revokedAt: null }), 1);
  const retried = await migrateLegacyUsersToEmployee(users, roles, refresh, { apply: true, tenantId: completionTenant.toHexString() });
  assert.equal(retried.updated, 1);
  assert.equal(retried.refreshRecordsRevoked, 1);
  assert.equal((await rawUsers.findOne({ _id: completionUser._id }))?.roleMigrationState, "complete");
});

test("legacy user completion rejects an active session inserted after revocation and retries safely", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const legacy = user(tenantId, { role: "USER" });
  const { roles, users, refresh, rawUsers, rawRefresh } = collections();
  await rawUsers.insertOne(legacy);
  await rawRefresh.insertOne({ tenantId, userId: legacy._id, tokenHash: "existing", revokedAt: null });

  let injected = false;
  const racingRefresh: RawMigrationCollection = {
    find: (...args) => refresh.find(...args),
    updateOne: (...args) => refresh.updateOne(...args),
    updateMany: async (filter, update, options) => {
      const result = await refresh.updateMany!(filter, update, options);
      if (!injected) {
        injected = true;
        await rawRefresh.insertOne(
          { tenantId, userId: legacy._id, tokenHash: "racing", revokedAt: null },
          { session: options?.session },
        );
      }
      return result;
    },
  };

  await assert.rejects(
    migrateLegacyUsersToEmployee(users, roles, racingRefresh, { apply: true, tenantId: tenantId.toHexString() }),
    (error: unknown) => Boolean(error && typeof error === "object" && "code" in error && error.code === "ACTIVE_SESSIONS_REMAIN"),
  );
  assert.equal((await rawUsers.findOne({ _id: legacy._id }))?.roleMigrationState, "pending-session-revocation");
  assert.equal(await rawRefresh.countDocuments({ tenantId, userId: legacy._id, revokedAt: null }), 1);

  const retried = await migrateLegacyUsersToEmployee(users, roles, refresh, { apply: true, tenantId: tenantId.toHexString() });
  assert.equal(retried.updated, 1);
  assert.equal((await rawUsers.findOne({ _id: legacy._id }))?.roleMigrationState, "complete");
  assert.equal(await rawRefresh.countDocuments({ tenantId, userId: legacy._id, revokedAt: null }), 0);
});

test("legacy user completion uses the canonical active-session definition and tenant scope", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const otherTenantId = new mongoose.Types.ObjectId();
  const legacy = user(tenantId, { role: "USER" });
  const { roles, users, refresh, rawUsers, rawRefresh } = collections();
  await rawUsers.insertOne(legacy);
  await rawRefresh.insertMany([
    { tenantId, userId: legacy._id, tokenHash: "null", revokedAt: null },
    { tenantId, userId: legacy._id, tokenHash: "missing" },
    { tenantId, userId: legacy._id, tokenHash: "revoked", revokedAt: new Date() },
    { tenantId: otherTenantId, userId: legacy._id, tokenHash: "other-tenant", revokedAt: null },
  ]);

  const report = await migrateLegacyUsersToEmployee(users, roles, refresh, {
    apply: true, tenantId: tenantId.toHexString(),
  });
  assert.equal(report.refreshRecordsRevoked, 2);
  assert.equal((await rawUsers.findOne({ _id: legacy._id }))?.roleMigrationState, "complete");
  assert.equal(await rawRefresh.countDocuments({
    tenantId, userId: legacy._id,
    $or: [{ revokedAt: null }, { revokedAt: { $exists: false } }],
  }), 0);
  assert.equal(await rawRefresh.countDocuments({ tenantId: otherTenantId, userId: legacy._id, revokedAt: null }), 1);
});

test("two migration workers are safe and idempotent", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const legacy = user(tenantId, { role: "USER" });
  const { roles, users, refresh, rawUsers, rawRefresh } = collections();
  await rawUsers.insertOne(legacy);
  await rawRefresh.insertMany([
    { tenantId, userId: legacy._id, tokenHash: "one", revokedAt: null },
    { tenantId, userId: legacy._id, tokenHash: "two" },
  ]);

  const reports = await Promise.all([
    migrateLegacyUsersToEmployee(users, roles, refresh, { apply: true, tenantId: tenantId.toHexString() }),
    migrateLegacyUsersToEmployee(users, roles, refresh, { apply: true, tenantId: tenantId.toHexString() }),
  ]);
  assert.equal(reports.reduce((sum, report) => sum + report.updated, 0), 1);
  assert.equal((await rawUsers.findOne({ _id: legacy._id }))?.roleMigrationState, "complete");
  assert.equal(await rawRefresh.countDocuments({
    tenantId, userId: legacy._id,
    $or: [{ revokedAt: null }, { revokedAt: { $exists: false } }],
  }), 0);
});
