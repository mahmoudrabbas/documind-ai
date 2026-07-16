import assert from "node:assert/strict";
import test from "node:test";
import mongoose from "mongoose";
import { BASE_ROLES, TENANT_ROLE_BASES, isBaseRole } from "../../common/auth/baseRoles.js";
import RoleModel from "../../db/models/role.model.js";
import UserModel from "../../db/models/user.model.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  ALL_PERMISSIONS,
  PERMISSION_CATALOG,
  TENANT_PERMISSION_CATALOG_GROUPS,
  Permission,
  assertPersistableTenantPermissions,
} from "./permissions.catalog.js";
import { validateCreateRoleInput } from "../roles/roles.validator.js";
import { getPermissionCatalogController } from "./permissions.controller.js";
import type { Request, Response } from "express";

const actorId = new mongoose.Types.ObjectId();
const tenantId = new mongoose.Types.ObjectId();
function role(values: Record<string, unknown> = {}) {
  return new RoleModel({ tenantId, name: "Finance Reader", normalizedName: "finance reader", baseRole: "EMPLOYEE", grants: [], createdBy: actorId, updatedBy: actorId, ...values });
}

test("base-role contract contains exactly the three approved roles at runtime and schema level", () => {
  assert.deepEqual(BASE_ROLES, ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE"]);
  assert.deepEqual(TENANT_ROLE_BASES, ["COMPANY_ADMIN", "EMPLOYEE"]);
  assert.deepEqual((UserModel.schema.path("role") as mongoose.SchemaType & { enumValues: string[] }).enumValues, [...BASE_ROLES]);
  assert.deepEqual((RoleModel.schema.path("baseRole") as mongoose.SchemaType & { enumValues: string[] }).enumValues, [...TENANT_ROLE_BASES]);
  for (const unsupported of ["USER", "ADMIN", "MANAGER", "COMPANY_OWNER", "PLATFORM_ADMIN", "SUPERADMIN", "arbitrary"]) {
    assert.equal(isBaseRole(unsupported), false);
    assert.ok(new UserModel({
      tenantId, name: "Invalid Role", email: `${unsupported.toLowerCase()}@example.test`,
      passwordHash: "test", role: unsupported,
    }).validateSync()?.errors.role);
  }
});

test("tenant catalog exposes exactly active tenant-grantable permissions", () => {
  const visible = TENANT_PERMISSION_CATALOG_GROUPS.flatMap((group) => group.permissions).sort();
  const expected = PERMISSION_CATALOG.filter((permission) =>
    permission.active && !permission.deprecated && !permission.platformOnly &&
    permission.tenantGrantable && permission.delegableByTenantAdmin)
    .map((permission) => permission.id).sort();
  assert.deepEqual(visible, expected);
  assert.ok(!visible.includes(Permission.BILLING_MANAGE));
  assert.ok(!PERMISSION_CATALOG.some((permission) => permission.id === ("documents:view" as never)));
  assert.ok(!PERMISSION_CATALOG.some((permission) => permission.id === ("audit:platform-read" as never)));
});

test("catalog identifiers are normalized, unique, versioned, and cover all ten groups", () => {
  const ids = PERMISSION_CATALOG.map((item) => item.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.ok(ids.every((id) => id === id.trim().toLowerCase()));
  assert.deepEqual([...new Set(PERMISSION_CATALOG.map((item) => item.group))].sort(), ["analytics", "audit", "billing", "chat", "company-settings", "documents", "imports", "knowledge-gaps", "roles", "users"]);
  assert.ok(PERMISSION_CATALOG.every((item) => item.label && item.description && item.contractVersion === 1));
  assert.ok(!ALL_PERMISSIONS.includes("documents:view" as never));
});

test("permission persistence normalizes and deduplicates but rejects unknown, deprecated, and platform identifiers", () => {
  assert.deepEqual(assertPersistableTenantPermissions([" analytics:read ", "analytics:read"]), ["analytics:read"]);
  assert.throws(() => assertPersistableTenantPermissions(["unknown:value"]), /UNKNOWN_PERMISSION/);
  assert.throws(() => assertPersistableTenantPermissions(["documents:view"]), /UNKNOWN_PERMISSION/);
  assert.throws(() => assertPersistableTenantPermissions(["audit:platform-read"]), /UNKNOWN_PERMISSION/);
});

test("role API delegation rejects non-delegable and platform grants with stable escalation errors", () => {
  assert.throws(
    () => validateCreateRoleInput({ name: "Billing Manager", baseRole: "EMPLOYEE", grants: [{ permission: Permission.BILLING_MANAGE }] }),
    (error: unknown) => error instanceof AppError && error.code === "PRIVILEGE_ESCALATION",
  );
  assert.throws(
    () => validateCreateRoleInput({ name: "Platform Fixture", baseRole: "EMPLOYEE", grants: [{ permission: "audit:platform-read" }] }),
    (error: unknown) => error instanceof AppError && error.code === "UNKNOWN_PERMISSION",
  );
});

test("Role schema normalizes scopes and permissions and exposes Phase 1 indexes", async () => {
  const departmentId = new mongoose.Types.ObjectId().toString();
  const document = role({ grants: [{ permission: "documents:update", scopes: { departmentIds: [departmentId, departmentId], documentCategories: [" Finance ", "finance"], documentClassifications: [], selfOnly: false } }] });
  await document.validate();
  assert.deepEqual(document.grants.map((grant) => grant.permission), [Permission.DOCUMENTS_UPDATE]);
  assert.deepEqual(document.grants[0]?.scopes?.documentCategories, ["finance"]);
  const indexes = (RoleModel.schema.indexes() as Array<[Record<string, 1 | -1>, unknown]>).map(([fields]) => fields);
  assert.ok(indexes.some((fields) => fields.tenantId === 1 && fields.normalizedName === 1));
  assert.ok(indexes.some((fields) => fields.tenantId === 1 && fields.status === 1));
  assert.ok((UserModel.schema.indexes() as Array<[Record<string, 1 | -1>, unknown]>).some(([fields]) => fields.tenantId === 1 && fields.customRoleId === 1));
  assert.equal(document.status, "active");
  assert.equal(document.version, 1);
});

test("Role schema rejects malformed and incompatible scopes", async () => {
  await assert.rejects(role({ grants: [{ permission: Permission.DOCUMENTS_UPDATE, scopes: { departmentIds: ["not-an-id"] } }] }).validate());
  await assert.rejects(role({ grants: [{ permission: Permission.BILLING_READ, scopes: { selfOnly: true } }] }).validate(), /not supported/);
});

test("permission catalog controller returns only the versioned tenant-safe DTO", async () => {
  let body: unknown;
  const response = {
    status: (status: number) => {
      assert.equal(status, 200);
      return response;
    },
    json: (value: unknown) => { body = value; return response; },
  } as unknown as Response;
  await getPermissionCatalogController({} as Request, response, (error) => { throw error; });
  const data = (body as { data: { contractVersion: number; groups: Array<{ permissions: Array<Record<string, unknown>> }> } }).data;
  assert.equal(data.contractVersion, 1);
  for (const permission of data.groups.flatMap((group) => group.permissions)) {
    assert.deepEqual(Object.keys(permission).sort(), ["description", "id", "label"]);
  }
  const serialized = JSON.stringify(data);
  assert.ok(!serialized.includes("defaultBaseRoles"));
  assert.ok(!serialized.includes("platformOnly"));
  assert.ok(!serialized.includes("documents:view"));
  assert.ok(!serialized.includes("audit:platform-read"));
});
