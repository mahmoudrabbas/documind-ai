import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { BaseRole, TenantRoleBase } from "../../common/auth/baseRoles.js";
import RoleModel from "../../db/models/role.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { PLATFORM_TENANT_SLUG } from "../../common/auth/platformTenant.js";
import { Permission } from "./permissions.catalog.js";
import { InMemoryPermissionEvaluator } from "./permissions.evaluator.fake.js";
import { PermissionEvaluatorImpl } from "./permissions.evaluator.js";
import { PERMISSION_CONTRACT_VERSION } from "./permissions.catalog.js";
import type { PermissionActor, PermissionEvaluator, PermissionGrant } from "./permissions.types.js";

interface Harness {
  evaluator: PermissionEvaluator;
  addUser(id: string, tenantId: string, role: BaseRole, customRoleId?: string | null, status?: "active" | "disabled"): Promise<void>;
  addRole(id: string, tenantId: string, baseRole: TenantRoleBase, grants: unknown, options?: { status?: "active" | "archived"; version?: number; contractVersion?: number; raw?: boolean; migrationState?: string; omitMigrationState?: boolean; provenanceValid?: boolean }): Promise<void>;
  deleteRole(id: string, tenantId: string): Promise<void>;
}

function actor(id: string, tenantId: string, baseRole: BaseRole): PermissionActor {
  return { actorId: id, tenantId, baseRole };
}

function runContract(label: string, createHarness: () => Harness) {
  test(`${label}: base defaults and platform isolation`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const employee = new mongoose.Types.ObjectId().toString();
    const admin = new mongoose.Types.ObjectId().toString();
    await h.addUser(employee, tenant, "EMPLOYEE");
    await h.addUser(admin, tenant, "COMPANY_ADMIN");
    const employeeResult = await h.evaluator.resolve(actor(employee, tenant, "EMPLOYEE"));
    const adminResult = await h.evaluator.resolve(actor(admin, tenant, "COMPANY_ADMIN"));
    assert.ok(employeeResult.permissions.has(Permission.DOCUMENTS_READ));
    assert.ok(!employeeResult.permissions.has(Permission.DOCUMENTS_UPDATE));
    assert.ok(adminResult.permissions.has(Permission.ROLES_CREATE));
    assert.ok(!adminResult.permissions.has("audit:platform-read" as never));
  });

  test(`${label}: SUPER_ADMIN ignores corrupt tenant custom-role assignments`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const roleId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "SUPER_ADMIN", roleId);
    await h.addRole(roleId, tenant, "EMPLOYEE", [{ permission: Permission.ANALYTICS_READ }]);
    const resolved = await h.evaluator.resolve(actor(userId, tenant, "SUPER_ADMIN"));
    assert.equal(resolved.customRoleId, null);
    assert.equal(resolved.customRoleState, "none");
    assert.equal(resolved.roleVersion, null);
    assert.equal((await h.evaluator.evaluate({ ...actor(userId, tenant, "SUPER_ADMIN"), permission: Permission.ROLES_DELETE })).source, "platform");
  });

  test(`${label}: baseRole is assignability-only and never grants authority`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const roleId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "EMPLOYEE", roleId);
    await h.addRole(roleId, tenant, "COMPANY_ADMIN", [{ permission: Permission.ANALYTICS_READ }], { version: 7 });
    const resolved = await h.evaluator.resolve(actor(userId, tenant, "EMPLOYEE"));
    assert.equal(resolved.baseRole, "EMPLOYEE");
    assert.equal(resolved.roleVersion, 7);
    assert.ok(!resolved.permissions.has(Permission.ANALYTICS_READ));
    assert.ok(!resolved.permissions.has(Permission.ROLES_CREATE));
    assert.equal(resolved.customRoleState, "invalid");
  });

  test(`${label}: archived and cross-tenant roles grant nothing`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const otherTenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const roleId = new mongoose.Types.ObjectId().toString();
    const archivedRoleId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "EMPLOYEE", roleId);
    await h.addRole(roleId, otherTenant, "EMPLOYEE", [{ permission: Permission.ANALYTICS_READ }]);
    let decision = await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.ANALYTICS_READ });
    assert.equal(decision.allowed, false);
    assert.equal(decision.denialCode, "ROLE_NOT_FOUND");
    assert.equal(
      (await h.evaluator.evaluate({
        ...actor(userId, tenant, "EMPLOYEE"),
        permission: Permission.DOCUMENTS_READ,
      })).denialCode,
      "ROLE_NOT_FOUND",
    );
    assert.equal(
      (await h.evaluator.resolve(actor(userId, tenant, "EMPLOYEE"))).permissions.size,
      0,
    );
    await h.addUser(userId, tenant, "EMPLOYEE", archivedRoleId);
    await h.addRole(archivedRoleId, tenant, "EMPLOYEE", [{ permission: Permission.ANALYTICS_READ }], { status: "archived" });
    decision = await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.ANALYTICS_READ });
    assert.equal(decision.denialCode, "ROLE_ARCHIVED");
    assert.equal(
      (await h.evaluator.evaluate({
        ...actor(userId, tenant, "EMPLOYEE"),
        permission: Permission.DOCUMENTS_READ,
      })).denialCode,
      "ROLE_ARCHIVED",
    );
  });

  test(`${label}: scopes are conjunctive and self-only is deterministic`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const roleId = new mongoose.Types.ObjectId().toString();
    const departmentId = new mongoose.Types.ObjectId().toString();
    const alternateDepartmentId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "EMPLOYEE", roleId);
    await h.addRole(roleId, tenant, "EMPLOYEE", [{ permission: Permission.DOCUMENTS_UPDATE, scopes: {
      selfOnly: true, departmentIds: [departmentId, alternateDepartmentId], documentCategories: ["finance"], documentClassifications: ["internal"],
    } }]);
    const input = { ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.DOCUMENTS_UPDATE };
    assert.equal((await h.evaluator.evaluate(input)).denialCode, "RESOURCE_CONTEXT_REQUIRED");
    const allowed = await h.evaluator.evaluate({ ...input, resource: { tenantId: tenant, ownerId: userId, departmentId, documentCategory: "Finance", documentClassification: "INTERNAL" } });
    assert.equal(allowed.allowed, true);
    assert.equal(allowed.source, "custom-role");
    assert.deepEqual(allowed.scope?.departmentIds, [departmentId, alternateDepartmentId].sort());
    assert.equal((await h.evaluator.evaluate({ ...input, resource: { tenantId: tenant, ownerId: userId, departmentId: alternateDepartmentId, documentCategory: "finance", documentClassification: "internal" } })).allowed, true);
    const mismatch = await h.evaluator.evaluate({ ...input, resource: { tenantId: tenant, ownerId: "other", departmentId, documentCategory: "finance", documentClassification: "internal" } });
    assert.equal(mismatch.denialCode, "SCOPE_MISMATCH");
    const crossTenant = await h.evaluator.evaluate({ ...input, resource: { tenantId: otherTenantId(tenant), ownerId: userId } });
    assert.equal(crossTenant.denialCode, "TENANT_MISMATCH");
  });

  test(`${label}: unknown permissions and disabled actors deny`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "COMPANY_ADMIN", null, "disabled");
    const unknown = await h.evaluator.evaluate({ ...actor(userId, tenant, "COMPANY_ADMIN"), permission: "made-up:permission" });
    assert.equal(unknown.denialCode, "UNKNOWN_PERMISSION");
    const deprecated = await h.evaluator.evaluate({ ...actor(userId, tenant, "COMPANY_ADMIN"), permission: "documents:view" });
    assert.equal(deprecated.denialCode, "DEPRECATED_PERMISSION");
    const denied = await h.evaluator.evaluate({ ...actor(userId, tenant, "COMPANY_ADMIN"), permission: Permission.ROLES_READ });
    assert.equal(denied.allowed, false);
  });

  test(`${label}: malformed resource context fails closed`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "COMPANY_ADMIN");
    const decision = await h.evaluator.evaluate({
      ...actor(userId, tenant, "COMPANY_ADMIN"),
      permission: Permission.DOCUMENTS_UPDATE,
      resource: { tenantId: tenant, departmentId: "tampered" },
    });
    assert.equal(decision.allowed, false);
    assert.equal(decision.denialCode, "SCOPE_MISMATCH");
  });

  test(`${label}: role changes are visible without a stale cache`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const roleId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "EMPLOYEE", roleId);
    await h.addRole(roleId, tenant, "EMPLOYEE", [{ permission: Permission.ANALYTICS_READ }], { version: 1 });
    assert.equal((await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.ANALYTICS_READ })).allowed, true);
    await h.addRole(roleId, tenant, "EMPLOYEE", [{ permission: Permission.IMPORTS_READ }], { version: 2 });
    const changed = await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.ANALYTICS_READ });
    assert.equal(changed.allowed, false);
    assert.equal(changed.roleVersion, 2);
    assert.equal((await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.IMPORTS_READ })).allowed, true);

    await h.addRole(roleId, tenant, "EMPLOYEE", [{ permission: Permission.IMPORTS_READ }], { status: "archived", version: 3 });
    const archived = await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.IMPORTS_READ });
    assert.equal(archived.denialCode, "ROLE_ARCHIVED");
    assert.equal(archived.roleVersion, 3);
    await h.addRole(roleId, tenant, "EMPLOYEE", [{ permission: Permission.IMPORTS_READ }], { version: 4 });
    await h.deleteRole(roleId, tenant);
    assert.equal((await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.IMPORTS_READ })).denialCode, "ROLE_NOT_FOUND");
    await h.addRole(roleId, tenant, "EMPLOYEE", [{ permission: Permission.IMPORTS_READ }], { version: 3 });
    await h.addUser(userId, tenant, "EMPLOYEE", null);
    assert.equal((await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.IMPORTS_READ })).denialCode, "PERMISSION_REQUIRED");
    await h.addUser(userId, tenant, "EMPLOYEE", roleId, "disabled");
    assert.equal((await h.evaluator.resolve(actor(userId, tenant, "EMPLOYEE"))).permissions.size, 0);
    await h.addUser(userId, tenant, "COMPANY_ADMIN", null);
    const baseChanged = await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.ROLES_READ });
    assert.equal(baseChanged.allowed, true);
    assert.equal(baseChanged.source, "base-role");
  });

  test(`${label}: permission-specific scopes do not constrain unrelated grants`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const roleId = new mongoose.Types.ObjectId().toString();
    const departmentId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "EMPLOYEE", roleId);
    const grants: PermissionGrant[] = [
      { permission: Permission.ANALYTICS_READ },
      { permission: Permission.DOCUMENTS_UPDATE, scopes: { selfOnly: false, departmentIds: [departmentId], documentCategories: [], documentClassifications: [] } },
    ];
    await h.addRole(roleId, tenant, "EMPLOYEE", grants);
    assert.equal((await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.ANALYTICS_READ })).allowed, true);
    assert.equal((await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.DOCUMENTS_UPDATE })).denialCode, "RESOURCE_CONTEXT_REQUIRED");
  });

  test(`${label}: inherited unrestricted grant is narrowed by an explicit scoped custom override`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const roleId = new mongoose.Types.ObjectId().toString();
    const departmentId = new mongoose.Types.ObjectId().toString();
    const otherDepartmentId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "EMPLOYEE", roleId);
    await h.addRole(roleId, tenant, "EMPLOYEE", [{
      permission: Permission.DOCUMENTS_READ,
      scopes: {
        selfOnly: false,
        departmentIds: [departmentId],
        documentCategories: [],
        documentClassifications: [],
      },
    }]);

    const resolved = await h.evaluator.resolve(actor(userId, tenant, "EMPLOYEE"));
    const grant = resolved.grants.get(Permission.DOCUMENTS_READ);
    assert.equal(grant?.source, "base-role");
    assert.deepEqual(grant?.scope?.departmentIds, [departmentId]);
    assert.equal(grant?.scope?.selfOnly, false);

    // The narrowed scope requires a resource context and forbids widening.
    const noResource = await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.DOCUMENTS_READ });
    assert.equal(noResource.allowed, false);
    assert.equal(noResource.denialCode, "RESOURCE_CONTEXT_REQUIRED");
    assert.equal(noResource.source, "base-role");

    const inScope = await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.DOCUMENTS_READ, resource: { tenantId: tenant, departmentId } });
    assert.equal(inScope.allowed, true);
    assert.equal(inScope.source, "base-role");

    const crossDept = await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.DOCUMENTS_READ, resource: { tenantId: tenant, departmentId: otherDepartmentId } });
    assert.equal(crossDept.allowed, false);
    assert.equal(crossDept.denialCode, "SCOPE_MISMATCH");
  });

  test(`${label}: inherited permission with no custom override stays unrestricted`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "EMPLOYEE");
    const resolved = await h.evaluator.resolve(actor(userId, tenant, "EMPLOYEE"));
    const grant = resolved.grants.get(Permission.DOCUMENTS_READ);
    assert.equal(grant?.source, "base-role");
    assert.equal(grant?.scope, null);
    const decision = await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.DOCUMENTS_READ });
    assert.equal(decision.allowed, true);
    assert.equal(decision.source, "base-role");
  });

  test(`${label}: inherited permission is narrowed by an explicit selfOnly override`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const roleId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "EMPLOYEE", roleId);
    await h.addRole(roleId, tenant, "EMPLOYEE", [{
      permission: Permission.DOCUMENTS_READ,
      scopes: { selfOnly: true, departmentIds: [], documentCategories: [], documentClassifications: [] },
    }]);
    const grant = (await h.evaluator.resolve(actor(userId, tenant, "EMPLOYEE"))).grants.get(Permission.DOCUMENTS_READ);
    assert.equal(grant?.source, "base-role");
    assert.equal(grant?.scope?.selfOnly, true);
    assert.equal(
      (await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.DOCUMENTS_READ })).denialCode,
      "RESOURCE_CONTEXT_REQUIRED",
    );
    assert.equal(
      (await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.DOCUMENTS_READ, resource: { tenantId: tenant, ownerId: userId } })).allowed,
      true,
    );
    assert.equal(
      (await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.DOCUMENTS_READ, resource: { tenantId: tenant, ownerId: new mongoose.Types.ObjectId().toString() } })).denialCode,
      "SCOPE_MISMATCH",
    );
  });

  test(`${label}: inherited permission is narrowed by an explicit documentCategories override`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const roleId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "EMPLOYEE", roleId);
    await h.addRole(roleId, tenant, "EMPLOYEE", [{
      permission: Permission.DOCUMENTS_READ,
      scopes: { selfOnly: false, departmentIds: [], documentCategories: ["finance"], documentClassifications: [] },
    }]);
    const grant = (await h.evaluator.resolve(actor(userId, tenant, "EMPLOYEE"))).grants.get(Permission.DOCUMENTS_READ);
    assert.equal(grant?.source, "base-role");
    assert.deepEqual(grant?.scope?.documentCategories, ["finance"]);
    assert.equal(
      (await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.DOCUMENTS_READ, resource: { tenantId: tenant, documentCategory: "Finance" } })).allowed,
      true,
    );
    assert.equal(
      (await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.DOCUMENTS_READ, resource: { tenantId: tenant, documentCategory: "human resources" } })).denialCode,
      "SCOPE_MISMATCH",
    );
  });

  test(`${label}: inherited permission is narrowed by an explicit documentClassifications override`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const roleId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "EMPLOYEE", roleId);
    await h.addRole(roleId, tenant, "EMPLOYEE", [{
      permission: Permission.DOCUMENTS_READ,
      scopes: { selfOnly: false, departmentIds: [], documentCategories: [], documentClassifications: ["internal"] },
    }]);
    const grant = (await h.evaluator.resolve(actor(userId, tenant, "EMPLOYEE"))).grants.get(Permission.DOCUMENTS_READ);
    assert.equal(grant?.source, "base-role");
    assert.deepEqual(grant?.scope?.documentClassifications, ["internal"]);
    assert.equal(
      (await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.DOCUMENTS_READ, resource: { tenantId: tenant, documentClassification: "INTERNAL" } })).allowed,
      true,
    );
    assert.equal(
      (await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.DOCUMENTS_READ, resource: { tenantId: tenant, documentClassification: "confidential" } })).denialCode,
      "SCOPE_MISMATCH",
    );
  });

  test(`${label}: non-inherited permission explicitly custom-granted retains custom-role source`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const roleId = new mongoose.Types.ObjectId().toString();
    const departmentId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "EMPLOYEE", roleId);
    await h.addRole(roleId, tenant, "EMPLOYEE", [{
      permission: Permission.ANALYTICS_READ,
      scopes: { selfOnly: false, departmentIds: [departmentId], documentCategories: [], documentClassifications: [] },
    }]);
    const grant = (await h.evaluator.resolve(actor(userId, tenant, "EMPLOYEE"))).grants.get(Permission.ANALYTICS_READ);
    assert.equal(grant?.source, "custom-role");
    assert.deepEqual(grant?.scope?.departmentIds, [departmentId]);
    assert.equal(
      (await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.ANALYTICS_READ, resource: { tenantId: tenant, departmentId } })).allowed,
      true,
    );
    assert.equal(
      (await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.ANALYTICS_READ, resource: { tenantId: tenant, departmentId: new mongoose.Types.ObjectId().toString() } })).denialCode,
      "SCOPE_MISMATCH",
    );
  });

  test(`${label}: unrelated inherited permission is not narrowed by another scoped override`, async () => {
    const h = createHarness();
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const roleId = new mongoose.Types.ObjectId().toString();
    await h.addUser(userId, tenant, "EMPLOYEE", roleId);
    await h.addRole(roleId, tenant, "EMPLOYEE", [
      { permission: Permission.CHAT_READ, scopes: { selfOnly: true, departmentIds: [], documentCategories: [], documentClassifications: [] } },
      { permission: Permission.DOCUMENTS_READ },
    ]);
    const grants = (await h.evaluator.resolve(actor(userId, tenant, "EMPLOYEE"))).grants;
    const readGrant = grants.get(Permission.DOCUMENTS_READ);
    assert.equal(readGrant?.source, "base-role");
    assert.equal(readGrant?.scope, null);
    const chatGrant = grants.get(Permission.CHAT_READ);
    assert.equal(chatGrant?.source, "base-role");
    assert.equal(chatGrant?.scope?.selfOnly, true);
    assert.equal(
      (await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.DOCUMENTS_READ })).allowed,
      true,
    );
  });

  test(`${label}: production and fake evaluators resolve identical scoped overrides`, async () => {
    const tenant = new mongoose.Types.ObjectId().toString();
    const userId = new mongoose.Types.ObjectId().toString();
    const roleId = new mongoose.Types.ObjectId().toString();
    const departmentId = new mongoose.Types.ObjectId().toString();
    const grants = [{
      permission: Permission.DOCUMENTS_READ,
      scopes: { selfOnly: false, departmentIds: [departmentId], documentCategories: [], documentClassifications: [] },
    }];

    const fake = new InMemoryPermissionEvaluator();
    fake.addUser(userId, tenant, "EMPLOYEE", roleId);
    fake.addRole(roleId, tenant, "EMPLOYEE", grants);
    const fakeGrant = (await fake.resolve(actor(userId, tenant, "EMPLOYEE"))).grants.get(Permission.DOCUMENTS_READ);

    let actorUser = await UserModel.findOne({ tenantId: tenant }).exec();
    if (!actorUser) {
      actorUser = await UserModel.create({ tenantId: tenant, name: "Fixture", email: `${tenant}@example.test`, passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true });
    }
    await RoleModel.collection.deleteOne({ _id: new mongoose.Types.ObjectId(roleId), tenantId: new mongoose.Types.ObjectId(tenant) });
    await RoleModel.collection.insertOne({
      _id: new mongoose.Types.ObjectId(roleId),
      tenantId: new mongoose.Types.ObjectId(tenant),
      name: "Scoped",
      normalizedName: "scoped",
      baseRole: "EMPLOYEE",
      grants,
      contractVersion: PERMISSION_CONTRACT_VERSION,
      status: "active",
      version: 1,
      migrationState: "complete",
      createdBy: actorUser._id,
      updatedBy: actorUser._id,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await UserModel.findOneAndUpdate(
      { _id: userId, tenantId: tenant },
      { $set: { role: "EMPLOYEE", customRoleId: new mongoose.Types.ObjectId(roleId), status: "active" }, $setOnInsert: { name: "Scoped User", email: `${userId}@example.test`, passwordHash: "test", emailVerified: true } },
      { upsert: true, runValidators: true },
    ).exec();

    const prodGrant = (await new PermissionEvaluatorImpl().resolve(actor(userId, tenant, "EMPLOYEE"))).grants.get(Permission.DOCUMENTS_READ);
    assert.equal(prodGrant?.source, fakeGrant?.source);
    assert.deepEqual(prodGrant?.scope, fakeGrant?.scope);
    assert.equal(prodGrant?.source, "base-role");
    assert.deepEqual(prodGrant?.scope?.departmentIds, [departmentId]);
  });

  for (const [caseName, grants, options] of [
    ["unknown permission", [{ permission: "unknown:value" }], {}],
    ["deprecated permission fixture", [{ permission: "documents:view" }], {}],
    ["platform permission fixture", [{ permission: "platform:test-only" }], {}],
    ["non-delegable permission", [{ permission: Permission.BILLING_MANAGE }], {}],
    ["malformed scopes", [{ permission: Permission.ANALYTICS_READ, scopes: { departmentIds: "bad" } }], {}],
    ["incompatible scopes", [{ permission: Permission.BILLING_READ, scopes: { selfOnly: true, departmentIds: [], documentCategories: [], documentClassifications: [] } }], {}],
    ["duplicate grants", [{ permission: Permission.ANALYTICS_READ, scopes: { selfOnly: false, departmentIds: [new mongoose.Types.ObjectId().toString()], documentCategories: [], documentClassifications: [] } }, { permission: Permission.ANALYTICS_READ, scopes: { selfOnly: false, departmentIds: [new mongoose.Types.ObjectId().toString()], documentCategories: [], documentClassifications: [] } }], {}],
    ["unsupported contract", [{ permission: Permission.ANALYTICS_READ }], { contractVersion: 999 }],
    ["quarantined role", [{ permission: Permission.ANALYTICS_READ }], { migrationState: "quarantined" }],
    ["missing migration state", [{ permission: Permission.ANALYTICS_READ }], { omitMigrationState: true }],
    ["invalid provenance", [{ permission: Permission.ANALYTICS_READ }], { provenanceValid: false }],
  ] as const) {
    test(`${label}: corrupt ${caseName} fails closed`, async () => {
      const h = createHarness();
      const tenant = new mongoose.Types.ObjectId().toString();
      const userId = new mongoose.Types.ObjectId().toString();
      const roleId = new mongoose.Types.ObjectId().toString();
      await h.addUser(userId, tenant, "EMPLOYEE", roleId);
      await h.addRole(roleId, tenant, "EMPLOYEE", grants, { ...options, raw: true });
      const decision = await h.evaluator.evaluate({ ...actor(userId, tenant, "EMPLOYEE"), permission: Permission.ANALYTICS_READ });
      assert.equal(decision.allowed, false);
      assert.equal(decision.denialCode, "INVALID_ROLE");
      assert.equal(
        (await h.evaluator.resolve(actor(userId, tenant, "EMPLOYEE"))).permissions.size,
        0,
      );
    });
  }
}

function otherTenantId(tenantId: string) {
  let value = new mongoose.Types.ObjectId().toString();
  if (value === tenantId) value = new mongoose.Types.ObjectId().toString();
  return value;
}

const fake = new InMemoryPermissionEvaluator();
runContract("InMemoryPermissionEvaluator", () => ({
  evaluator: fake,
  addUser: async (...args) => { fake.addUser(...args); },
  addRole: async (...args) => { fake.addRole(...args); },
  deleteRole: async (...args) => { fake.removeRole(...args); },
}));

let mongo: MongoMemoryServer | null = null;
before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "permission-contract" });
  } else {
    mongo = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      instance: { launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) },
    });
    await mongoose.connect(mongo.getUri(), { dbName: "permission-contract" });
  }
});
beforeEach(async () => {
  fake.clear();
  if (mongoose.connection.readyState === 1) {
    await Promise.all([
      UserModel.deleteMany({}),
      RoleModel.deleteMany({}),
      TenantModel.deleteMany({}),
    ]);
  }
});
after(async () => { await mongoose.disconnect(); await mongo?.stop(); });

runContract("PermissionEvaluatorImpl", () => ({
  evaluator: new PermissionEvaluatorImpl(),
  addUser: async (id, tenantId, role, customRoleId = null, status = "active") => {
    if (role === "SUPER_ADMIN") {
      await TenantModel.findOneAndUpdate(
        { _id: tenantId },
        {
          $set: {
            name: "Documind Platform",
            slug: PLATFORM_TENANT_SLUG,
            status: "active",
            plan: "free",
            isSystemTenant: true,
          },
        },
        { upsert: true, runValidators: true },
      ).exec();
    }
    await UserModel.findOneAndUpdate(
      { _id: id, tenantId },
      { $set: { role, customRoleId, status }, $setOnInsert: { name: `User ${id.slice(-6)}`, email: `${id}@example.test`, passwordHash: "test", emailVerified: true } },
      { upsert: true, runValidators: true },
    ).exec();
  },
  addRole: async (id, tenantId, baseRole, grants, options = {}) => {
    let actorUser = await UserModel.findOne({ tenantId }).exec();
    actorUser ??= await UserModel.create({ tenantId, name: "Fixture Actor", email: `${tenantId}@example.test`, passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true });
    await RoleModel.collection.deleteOne({ _id: new mongoose.Types.ObjectId(id), tenantId: new mongoose.Types.ObjectId(tenantId) });
    await RoleModel.collection.insertOne({
      _id: new mongoose.Types.ObjectId(id), tenantId: new mongoose.Types.ObjectId(tenantId),
      name: `Role ${id.slice(-6)}`, normalizedName: `role ${id.slice(-6)}`, baseRole,
      grants, contractVersion: options.contractVersion ?? PERMISSION_CONTRACT_VERSION,
      status: options.status ?? "active", version: options.version ?? 1,
      ...(!options.omitMigrationState ? { migrationState: options.migrationState ?? "complete" } : {}),
      createdBy: options.provenanceValid === false ? new mongoose.Types.ObjectId() : actorUser._id,
      updatedBy: actorUser._id,
      createdAt: new Date(), updatedAt: new Date(),
    });
  },
  deleteRole: async (id, tenantId) => {
    await RoleModel.collection.deleteOne({ _id: new mongoose.Types.ObjectId(id), tenantId: new mongoose.Types.ObjectId(tenantId) });
  },
}));

test("PermissionEvaluatorImpl: SUPER_ADMIN fails closed outside the canonical platform tenant", async () => {
  const tenant = await TenantModel.create({
    name: "Customer Tenant",
    slug: "customer-super-admin",
    status: "active",
    plan: "free",
    isSystemTenant: false,
  });
  const user = await UserModel.create({
    tenantId: tenant._id,
    name: "Invalid Super Admin",
    email: "invalid-super-admin@example.test",
    passwordHash: "test",
    role: "SUPER_ADMIN",
    status: "active",
    emailVerified: true,
  });
  const evaluator = new PermissionEvaluatorImpl();

  const resolved = await evaluator.resolve(
    actor(user.id, tenant.id, "SUPER_ADMIN"),
  );
  assert.equal(resolved.permissions.size, 0);
  assert.equal(
    (await evaluator.evaluate({
      ...actor(user.id, tenant.id, "SUPER_ADMIN"),
      permission: Permission.ROLES_READ,
    })).denialCode,
    "PERMISSION_REQUIRED",
  );
});
