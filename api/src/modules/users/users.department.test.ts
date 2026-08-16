import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import DepartmentModel from "../../db/models/department.model.js";
import RoleModel from "../../db/models/role.model.js";
import RefreshTokenModel from "../../db/models/refreshToken.model.js";
import { InMemoryAuditWriter } from "../../common/observability/auditWriter.js";
import { setAuditWriter } from "../../common/observability/index.js";
import { Permission } from "../permissions/permissions.catalog.js";
import { getPermissionEvaluator, resetPermissionEvaluator } from "../permissions/permissions.evaluator.js";
import { inviteUser, updateUser } from "./users.service.js";
import { validateInviteUserInput, validateUpdateUserInput } from "./users.validator.js";

let replSet: MongoMemoryReplSet | null = null;
let tenantId: string;
let admin: InstanceType<typeof UserModel>;

before(async () => {
  if (process.env.MONGODB_URI) await mongoose.connect(process.env.MONGODB_URI, { dbName: "users-department-test" });
  else {
    replSet = await MongoMemoryReplSet.create({ binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" }, replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri(), { dbName: "users-department-test" });
  }
});

beforeEach(async () => {
  await Promise.all([TenantModel.deleteMany({}), UserModel.deleteMany({}), DepartmentModel.deleteMany({}), RoleModel.deleteMany({}), RefreshTokenModel.deleteMany({})]);
  setAuditWriter(new InMemoryAuditWriter());
  resetPermissionEvaluator();
  const tenant = await TenantModel.create({ name: "Local", slug: "local-users-dept", status: "active", plan: "free" });
  tenantId = tenant.id;
  admin = await UserModel.create({ tenantId, name: "Admin User", email: "admin@local.test", passwordHash: "test", role: "COMPANY_ADMIN", status: "active", emailVerified: true });
});

after(async () => {
  setAuditWriter(null);
  resetPermissionEvaluator();
  await mongoose.disconnect();
  if (replSet) await replSet.stop();
});

function context() {
  return { tenantId, actorId: admin.id, actorEmail: admin.email, actorRole: "COMPANY_ADMIN" as const };
}

async function department(name: string, status: "active" | "archived" = "active", owner = admin) {
  return DepartmentModel.create({ tenantId: owner.tenantId, name, normalizedName: name.toLowerCase(), status, createdBy: owner._id, updatedBy: owner._id });
}

test("invite persists and returns a valid same-tenant department", async () => {
  const hr = await department("HR");
  const result = await inviteUser({ name: "Employee HR", email: "hr@local.test", role: "EMPLOYEE", departmentId: hr.id }, context());
  assert.equal(result.user.departmentId, hr.id);
  assert.equal(result.user.departmentName, "HR");
  const stored = await UserModel.findById(result.user.id).lean().exec();
  assert.equal(stored?.employeeProfile?.departmentId?.toString(), hr.id);
});

test("invite rejects malformed, nonexistent, cross-tenant, and archived departments", async () => {
  assert.throws(() => validateInviteUserInput({ name: "Employee", email: "employee@local.test", role: "EMPLOYEE", departmentId: "bad" }), (error: unknown) => (error as { code?: string }).code === "VALIDATION_ERROR");
  await assert.rejects(inviteUser({ name: "Employee", email: "missing@local.test", role: "EMPLOYEE", departmentId: new mongoose.Types.ObjectId().toString() }, context()), (error: unknown) => (error as { code?: string }).code === "TAXONOMY_RECORD_NOT_FOUND");
  const foreignTenant = await TenantModel.create({ name: "Foreign", slug: "foreign-users-dept", status: "active", plan: "free" });
  const foreignAdmin = await UserModel.create({ tenantId: foreignTenant._id, name: "Foreign Admin", email: "admin@foreign.test", passwordHash: "test", role: "COMPANY_ADMIN", status: "active", emailVerified: true });
  const foreign = await department("Foreign", "active", foreignAdmin);
  await assert.rejects(inviteUser({ name: "Employee", email: "foreign@local.test", role: "EMPLOYEE", departmentId: foreign.id }, context()), (error: unknown) => (error as { code?: string }).code === "TAXONOMY_RECORD_NOT_FOUND");
  const archived = await department("Archived", "archived");
  await assert.rejects(inviteUser({ name: "Employee", email: "archived@local.test", role: "EMPLOYEE", departmentId: archived.id }, context()), (error: unknown) => (error as { code?: string }).code === "TAXONOMY_RECORD_ARCHIVED");
});

test("update changes and clears department while preserving role and status updates", async () => {
  const [hr, finance] = await Promise.all([department("HR"), department("Finance")]);
  const employee = await UserModel.create({ tenantId, name: "Employee", email: "employee@local.test", passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true, employeeProfile: { departmentId: hr._id } });
  const changed = await updateUser({ departmentId: finance.id, status: "disabled" }, context(), employee.id);
  assert.equal(changed.user.departmentId, finance.id);
  assert.equal(changed.user.status, "disabled");
  const cleared = await updateUser({ departmentId: null, role: "EMPLOYEE" }, context(), employee.id);
  assert.equal(cleared.user.departmentId, null);
  assert.equal(cleared.user.role, "EMPLOYEE");
  assert.doesNotThrow(() => validateUpdateUserInput({ departmentId: null }));
});

test("foreign-tenant users and departments fail closed on update", async () => {
  const foreignTenant = await TenantModel.create({ name: "Foreign", slug: "foreign-update-dept", status: "active", plan: "free" });
  const foreignAdmin = await UserModel.create({ tenantId: foreignTenant._id, name: "Foreign Admin", email: "foreign-admin@test", passwordHash: "test", role: "COMPANY_ADMIN", status: "active", emailVerified: true });
  const foreignDepartment = await department("Foreign", "active", foreignAdmin);
  const localEmployee = await UserModel.create({ tenantId, name: "Local Employee", email: "local@test", passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true });
  const foreignEmployee = await UserModel.create({ tenantId: foreignTenant._id, name: "Foreign Employee", email: "foreign@test", passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true });
  await assert.rejects(updateUser({ departmentId: foreignDepartment.id }, context(), localEmployee.id), (error: unknown) => (error as { code?: string }).code === "TAXONOMY_RECORD_NOT_FOUND");
  await assert.rejects(updateUser({ status: "disabled" }, context(), foreignEmployee.id), (error: unknown) => (error as { code?: string }).code === "NOT_FOUND");
});

test("persisted department changes constrain a department-scoped role on the next evaluation", async () => {
  const [hr, finance] = await Promise.all([department("HR"), department("Finance")]);
  const employee = await UserModel.create({ tenantId, name: "HR Reader", email: "reader@test", passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true, employeeProfile: { departmentId: hr._id } });
  const role = await RoleModel.create({ tenantId, name: "HR Reader", normalizedName: "hr reader", baseRole: "EMPLOYEE", grants: [{ permission: Permission.DOCUMENTS_READ, scopes: { selfOnly: false, departmentIds: [hr.id], documentCategories: [], documentClassifications: [] } }], createdBy: admin._id, updatedBy: admin._id });
  employee.customRoleId = role._id;
  await employee.save();
  const evaluator = getPermissionEvaluator();
  const input = { tenantId, actorId: employee.id, baseRole: "EMPLOYEE" as const, customRoleId: role.id, permission: Permission.DOCUMENTS_READ, resource: { tenantId, departmentId: hr.id } };
  assert.equal((await evaluator.evaluate(input)).allowed, true);
  await updateUser({ departmentId: finance.id }, context(), employee.id);
  assert.equal((await evaluator.evaluate(input)).allowed, false);
});

test("scoped users:update evaluates both current and proposed department state", async () => {
  const [hr, finance] = await Promise.all([department("HR"), department("Finance")]);
  const manager = await UserModel.create({ tenantId, name: "HR Manager", email: "manager@example.test", passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true, employeeProfile: { departmentId: hr._id } });
  const target = await UserModel.create({ tenantId, name: "HR Target", email: "target@example.test", passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true, employeeProfile: { departmentId: hr._id } });
  const role = await RoleModel.create({ tenantId, name: "HR User Manager", normalizedName: "hr user manager", baseRole: "EMPLOYEE", grants: [{ permission: Permission.USERS_UPDATE, scopes: { selfOnly: false, departmentIds: [hr.id], documentCategories: [], documentClassifications: [] } }], createdBy: admin._id, updatedBy: admin._id });
  manager.customRoleId = role._id;
  await manager.save();
  const scopedContext = { tenantId, actorId: manager.id, actorEmail: manager.email, actorRole: "EMPLOYEE" as const };
  await updateUser({ status: "disabled" }, scopedContext, target.id);
  await UserModel.updateOne({ _id: target._id }, { $set: { status: "active" } });
  await assert.rejects(
    updateUser({ departmentId: finance.id }, scopedContext, target.id),
    (error: unknown) => (error as { code?: string }).code === "SCOPE_MISMATCH",
  );
  assert.equal((await UserModel.findById(target.id).lean().exec())?.employeeProfile?.departmentId?.toString(), hr.id);
});
