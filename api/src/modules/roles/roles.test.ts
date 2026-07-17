import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.NODE_ENV = "test";

import type { Express } from "express";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import RoleModel from "../../db/models/role.model.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { disconnectRedis } from "../../db/redis.js";
import { assignRole, deleteRole, updateRole } from "./roles.service.js";

const app: Express = (await import("../../app.js")).default;

const TEST_PASSWORD = "StrongPass123!";

let mongoServer: MongoMemoryReplSet;

async function createTenantAndAdmin() {
  const tenant = await TenantModel.create({
    name: "Test Corp",
    slug: "test-corp",
    status: "active",
    plan: "free",
  });
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Admin User",
    email: "admin@test.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return { tenant, user };
}

async function createServer() {
  return new Promise<Server>((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
}

function closeServer(server: Server) {
  return new Promise<void>((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

async function login(port: number, slug = "test-corp", email = "admin@test.com") {
  const response = await fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companySlug: slug, email, password: TEST_PASSWORD }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { data: { tokens: { accessToken: string } } };
  return body.data.tokens.accessToken;
}

before(async () => {
  mongoServer = await MongoMemoryReplSet.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
    replSet: { count: 1 },
    instanceOpts: [{ launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) }],
  });
  await mongoose.connect(mongoServer.getUri(), { dbName: "roles-test" });
});

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await RoleModel.deleteMany({});
});

after(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongoServer) {
    await mongoServer.stop();
  }
});

void test("POST /roles — creates a custom role", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  const response = await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "HR", baseRole: "EMPLOYEE" }),
  });

  assert.equal(response.status, 201);
  const body = (await response.json()) as Record<string, unknown>;
  const role = (body.data as Record<string, unknown>).role as Record<string, unknown>;
  assert.equal(role.name, "HR");
  assert.equal(role.baseRole, "EMPLOYEE");
  assert.ok(role.id);

  await closeServer(server);
});

void test("POST /roles — rejects reserved name", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  for (const name of ["SUPER_ADMIN", "COMPANY_ADMIN", "EMPLOYEE", "super_admin", "Company_Admin"]) {
    const response = await fetch(`http://127.0.0.1:${port}/roles`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ name, baseRole: "EMPLOYEE" }),
    });
    assert.equal(response.status, 400, `Expected 400 for reserved name: ${name}`);
  }

  await closeServer(server);
});

void test("POST /roles — rejects duplicate name (case-insensitive)", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  const first = await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "HR", baseRole: "EMPLOYEE" }),
  });
  assert.equal(first.status, 201);

  const second = await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "hr", baseRole: "COMPANY_ADMIN" }),
  });
  assert.equal(second.status, 409);
  const duplicateBody = (await second.json()) as { error: { code: string } };
  assert.equal(duplicateBody.error.code, "DUPLICATE_ROLE_NAME");

  await closeServer(server);
});

void test("role routes return a stable error for malformed ObjectIds", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  for (const [method, body] of [["PATCH", JSON.stringify({ name: "Valid Name" })], ["DELETE", undefined]] as const) {
    const response = await fetch(`http://127.0.0.1:${port}/roles/not-an-object-id`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body,
    });
    assert.equal(response.status, 400);
    const responseBody = (await response.json()) as { error: { code: string } };
    assert.equal(responseBody.error.code, "MALFORMED_OBJECT_ID");
  }

  await closeServer(server);
});

void test("POST /roles — returns 403 for EMPLOYEE", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant } = await createTenantAndAdmin();
  await UserModel.create({
    tenantId: tenant.id,
    name: "Employee User",
    email: "emp@test.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "EMPLOYEE",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  const token = await login(port, "test-corp", "emp@test.com");

  const response = await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "HR", baseRole: "EMPLOYEE" }),
  });

  assert.equal(response.status, 403);

  await closeServer(server);
});

void test("GET /roles — lists tenant-scoped roles", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "HR", baseRole: "EMPLOYEE" }),
  });
  await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "IT", baseRole: "COMPANY_ADMIN" }),
  });

  const response = await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "GET",
    headers: { Authorization: `Bearer ${token}` },
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as Record<string, unknown>;
  const roles = (body.data as Record<string, unknown>).roles as Array<Record<string, unknown>>;
  assert.equal(roles.length, 2);

  await closeServer(server);
});

void test("PATCH /roles/:id — updates role name", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  const createRes = await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "HR", baseRole: "EMPLOYEE" }),
  });
  const created = (await createRes.json()) as Record<string, unknown>;
  const roleId = (created.data as Record<string, unknown>).role as Record<string, unknown>;

  const missingVersion = await fetch(`http://127.0.0.1:${port}/roles/${roleId.id}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Missing Version" }),
  });
  assert.equal(missingVersion.status, 400);

  const updateRes = await fetch(`http://127.0.0.1:${port}/roles/${roleId.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Human Resources", version: 1 }),
  });

  assert.equal(updateRes.status, 200);
  const body = (await updateRes.json()) as Record<string, unknown>;
  const updated = (body.data as Record<string, unknown>).role as Record<string, unknown>;
  assert.equal(updated.name, "Human Resources");
  assert.equal(updated.version, 2);

  const staleRes = await fetch(`http://127.0.0.1:${port}/roles/${roleId.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Stale Rename", version: 1 }),
  });
  assert.equal(staleRes.status, 409);
  const staleBody = (await staleRes.json()) as { error: { code: string } };
  assert.equal(staleBody.error.code, "STALE_ROLE_VERSION");

  await closeServer(server);
});

void test("simultaneous role updates allow one version winner and no partial write", async () => {
  const { tenant, user: admin } = await createTenantAndAdmin();
  const role = await RoleModel.create({
    tenantId: tenant.id, name: "Concurrent Role", normalizedName: "concurrent role", baseRole: "EMPLOYEE",
    grants: [], createdBy: admin._id, updatedBy: admin._id,
  });
  const results = await Promise.allSettled([
    updateRole({ name: "Winner One", version: 1 }, tenant.id, role.id, admin.id),
    updateRole({ name: "Winner Two", version: 1 }, tenant.id, role.id, admin.id),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected" && result.reason?.code === "STALE_ROLE_VERSION").length, 1);
  const persisted = await RoleModel.findById(role.id).lean().exec();
  assert.equal(persisted?.version, 2);
  assert.ok(persisted?.name === "Winner One" || persisted?.name === "Winner Two");
});

void test("PATCH /roles/:id — rejects baseRole changes while assigned", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant } = await createTenantAndAdmin();
  const token = await login(port);

  const createRes = await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Intern", baseRole: "EMPLOYEE" }),
  });
  const created = (await createRes.json()) as Record<string, unknown>;
  const roleId = (created.data as Record<string, unknown>).role as Record<string, unknown>;

  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Intern User",
    email: "intern@test.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "EMPLOYEE",
    customRoleId: new mongoose.Types.ObjectId(roleId.id as string),
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });

  const updateRes = await fetch(`http://127.0.0.1:${port}/roles/${roleId.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ baseRole: "COMPANY_ADMIN", version: 1 }),
  });

  assert.equal(updateRes.status, 409);
  const updateBody = (await updateRes.json()) as { error: { code: string } };
  assert.equal(updateBody.error.code, "ROLE_IN_USE");

  const updatedUser = await UserModel.findById(user.id).lean().exec();
  assert.equal(updatedUser?.role, "EMPLOYEE");

  await closeServer(server);
});

void test("DELETE /roles/:id — deletes unassigned role", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  const createRes = await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Temp", baseRole: "EMPLOYEE" }),
  });
  const created = (await createRes.json()) as Record<string, unknown>;
  const roleId = (created.data as Record<string, unknown>).role as Record<string, unknown>;

  const missingVersion = await fetch(`http://127.0.0.1:${port}/roles/${roleId.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert.equal(missingVersion.status, 400);
  const staleVersion = await fetch(`http://127.0.0.1:${port}/roles/${roleId.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ version: 2 }),
  });
  assert.equal(staleVersion.status, 409);

  const deleteRes = await fetch(`http://127.0.0.1:${port}/roles/${roleId.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ version: 1 }),
  });

  assert.equal(deleteRes.status, 200);

  const deleted = await RoleModel.findById(roleId.id).exec();
  assert.equal(deleted, null);

  await closeServer(server);
});

void test("DELETE /roles/:id — returns 409 when users assigned", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant } = await createTenantAndAdmin();
  const token = await login(port);

  const createRes = await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "HR", baseRole: "EMPLOYEE" }),
  });
  const created = (await createRes.json()) as Record<string, unknown>;
  const roleId = (created.data as Record<string, unknown>).role as Record<string, unknown>;

  await UserModel.create({
    tenantId: tenant.id,
    name: "Assigned User",
    email: "assigned@test.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "EMPLOYEE",
    customRoleId: new mongoose.Types.ObjectId(roleId.id as string),
    status: "active",
    emailVerified: true,
  });

  const deleteRes = await fetch(`http://127.0.0.1:${port}/roles/${roleId.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ version: 1 }),
  });

  assert.equal(deleteRes.status, 409);
  const deleteBody = await deleteRes.json() as {
    success: boolean;
    error: { code: string; message: string };
  };
  assert.equal(deleteBody.success, false);
  assert.equal(deleteBody.error.code, "ROLE_IN_USE");
  assert.equal(typeof deleteBody.error.message, "string");
  assert.ok(await RoleModel.findById(roleId.id as string));

  await closeServer(server);
});

void test("cross-tenant isolation — roles not visible across tenants", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const tokenA = await login(port, "test-corp", "admin@test.com");

  const tenantB = await TenantModel.create({
    name: "Other Corp",
    slug: "other-corp",
    status: "active",
    plan: "free",
  });
  await UserModel.create({
    tenantId: tenantB.id,
    name: "Admin B",
    email: "admin@other.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  const tokenB = await login(port, "other-corp", "admin@other.com");

  await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${tokenA}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "HR", baseRole: "EMPLOYEE" }),
  });

  const responseB = await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "GET",
    headers: { Authorization: `Bearer ${tokenB}` },
  });

  assert.equal(responseB.status, 200);
  const body = (await responseB.json()) as Record<string, unknown>;
  const roles = (body.data as Record<string, unknown>).roles as Array<Record<string, unknown>>;
  assert.equal(roles.length, 0);

  await closeServer(server);
});

void test("POST /users (invite) — rejects the deprecated customRoleId assignment path", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  const createRoleRes = await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "HR", baseRole: "EMPLOYEE" }),
  });
  const roleData = (await createRoleRes.json()) as Record<string, unknown>;
  const roleId = (roleData.data as Record<string, unknown>).role as Record<string, unknown>;

  const inviteRes = await fetch(`http://127.0.0.1:${port}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "New Hire",
      email: "hire@test.com",
      customRoleId: roleId.id,
    }),
  });

  assert.equal(inviteRes.status, 400);
  const inviteBody = (await inviteRes.json()) as { error: { code: string } };
  assert.equal(inviteBody.error.code, "VALIDATION_ERROR");
  assert.equal(await UserModel.exists({ email: "hire@test.com" }), null);

  await closeServer(server);
});

void test("POST /users (invite) — with system role works as before", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  const inviteRes = await fetch(`http://127.0.0.1:${port}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: "Regular Hire",
      email: "regular@test.com",
      role: "EMPLOYEE",
    }),
  });

  assert.equal(inviteRes.status, 201);
  const inviteBody = (await inviteRes.json()) as Record<string, unknown>;
  const user = (inviteBody.data as Record<string, unknown>).user as Record<string, unknown>;
  assert.equal(user.role, "EMPLOYEE");
  assert.equal(user.customRoleId, undefined);

  await closeServer(server);
});

void test("POST /users (invite) — requires an explicit base role", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  await createTenantAndAdmin();
  const token = await login(port);

  const inviteRes = await fetch(`http://127.0.0.1:${port}/users`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Bad", email: "bad@test.com" }),
  });

  assert.equal(inviteRes.status, 400);

  await closeServer(server);
});

void test("PATCH /users/:id — rejects the deprecated customRoleId assignment path", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant } = await createTenantAndAdmin();
  const token = await login(port);

  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Target User",
    email: "target@test.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "EMPLOYEE",
    status: "active",
    emailVerified: true,
  });

  const createRoleRes = await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Manager", baseRole: "EMPLOYEE" }),
  });
  const roleData = (await createRoleRes.json()) as Record<string, unknown>;
  const roleId = (roleData.data as Record<string, unknown>).role as Record<string, unknown>;

  const updateRes = await fetch(`http://127.0.0.1:${port}/users/${user.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ customRoleId: roleId.id }),
  });

  assert.equal(updateRes.status, 400);
  const updateBody = (await updateRes.json()) as { error: { code: string } };
  assert.equal(updateBody.error.code, "VALIDATION_ERROR");

  const persisted = await UserModel.findById(user.id).lean().exec();
  assert.equal(persisted?.role, "EMPLOYEE");
  assert.equal(persisted?.customRoleId, null);

  await closeServer(server);
});

void test("dedicated custom-role assignment rejects both base-role mismatch directions", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user: admin } = await createTenantAndAdmin();
  const token = await login(port);
  const employee = await UserModel.create({
    tenantId: tenant.id, name: "Employee", email: "employee@test.com",
    passwordHash: await hashPassword(TEST_PASSWORD), role: "EMPLOYEE", status: "active", emailVerified: true,
  });
  const employeeRole = await RoleModel.create({
    tenantId: tenant.id, name: "Employee Role", normalizedName: "employee role", baseRole: "EMPLOYEE",
    grants: [], createdBy: admin._id, updatedBy: admin._id,
  });
  const adminRole = await RoleModel.create({
    tenantId: tenant.id, name: "Admin Role", normalizedName: "admin role", baseRole: "COMPANY_ADMIN",
    grants: [], createdBy: admin._id, updatedBy: admin._id,
  });

  for (const [targetId, customRoleId] of [[employee.id, adminRole.id], [admin.id, employeeRole.id]]) {
    const response = await fetch(`http://127.0.0.1:${port}/roles/${customRoleId}/assignments`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ userId: targetId, roleVersion: 1 }),
    });
    assert.equal(response.status, 409);
    const body = (await response.json()) as { error: { code: string } };
    assert.equal(body.error.code, "ROLE_NOT_ASSIGNABLE");
  }

  await closeServer(server);
});

void test("role deletion and base-role changes serialize with assignment", async () => {
  const { tenant, user: admin } = await createTenantAndAdmin();
  const employee = await UserModel.create({
    tenantId: tenant.id, name: "Race Employee", email: "race-employee@test.com", passwordHash: "test",
    role: "EMPLOYEE", status: "active", emailVerified: true,
  });

  for (const operation of ["delete", "base-change"] as const) {
    const role = await RoleModel.create({
      tenantId: tenant.id, name: `Race ${operation}`, normalizedName: `race ${operation}`, baseRole: "EMPLOYEE",
      grants: [], createdBy: admin._id, updatedBy: admin._id,
    });
    const assignment = assignRole(
      { userId: employee.id, roleVersion: 1 },
      { tenantId: tenant.id, actorId: admin.id, actorRole: "COMPANY_ADMIN" },
      role.id,
    );
    const lifecycle = operation === "delete"
      ? deleteRole(tenant.id, role.id, 1, admin.id)
      : updateRole({ baseRole: "COMPANY_ADMIN", version: 1 }, tenant.id, role.id, admin.id);
    const results = await Promise.allSettled([assignment, lifecycle]);
    assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
    const persistedUser = await UserModel.findById(employee.id).lean().exec();
    const persistedRole = await RoleModel.findById(role.id).lean().exec();
    if (persistedUser?.customRoleId?.toString() === role.id) {
      assert.ok(persistedRole);
      assert.equal(persistedRole.baseRole, "EMPLOYEE");
    } else if (persistedRole) {
      assert.equal(persistedRole.baseRole, "COMPANY_ADMIN");
    }
    await UserModel.updateOne({ _id: employee.id }, { $set: { customRoleId: null } });
  }
});

void test("Phase 2 role lifecycle and assignment routes preserve version and tenant contracts", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant } = await createTenantAndAdmin();
  const employee = await UserModel.create({
    tenantId: tenant.id, name: "API Employee", email: "api-employee@test.com",
    passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true,
  });
  const token = await login(port);
  const request = async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const payload = await response.json() as { data: Record<string, unknown>; error?: { code: string } };
    return { response, payload };
  };

  const catalog = await request("/permissions");
  assert.equal(catalog.response.status, 200);
  assert.equal(catalog.payload.data.contractVersion, 1);

  const sourceResponse = await request("/roles", "POST", { name: "API Source", baseRole: "EMPLOYEE", grants: [] });
  const destinationResponse = await request("/roles", "POST", { name: "API Destination", baseRole: "EMPLOYEE", grants: [] });
  assert.equal(sourceResponse.response.status, 201);
  type ApiRole = { id: string; version: number; status: string };
  const source = sourceResponse.payload.data.role as ApiRole;
  const destination = destinationResponse.payload.data.role as ApiRole;
  assert.equal((await request(`/roles/${source.id}`)).response.status, 200);
  assert.equal((await request(`/roles/${source.id}/usage`)).payload.data.assignedUserCount, 0);

  const clone = await request(`/roles/${source.id}/clone`, "POST", { name: "API Clone", version: source.version });
  assert.equal(clone.response.status, 201);
  const clonedRole = clone.payload.data.role as ApiRole;
  const archived = await request(`/roles/${clonedRole.id}/archive`, "POST", { version: clonedRole.version });
  const archivedRole = archived.payload.data.role as ApiRole;
  assert.equal(archivedRole.status, "archived");
  const reactivated = await request(`/roles/${clonedRole.id}/reactivate`, "POST", { version: archivedRole.version });
  const reactivatedRole = reactivated.payload.data.role as ApiRole;
  assert.equal(reactivatedRole.status, "active");

  const assigned = await request(`/roles/${source.id}/assignments`, "POST", { userId: employee.id, roleVersion: source.version });
  assert.equal(assigned.payload.data.changed, true);
  const migrated = await request(`/roles/${source.id}/user-migrations`, "POST", {
    destinationRoleId: destination.id,
    sourceVersion: source.version,
    destinationVersion: destination.version,
  });
  assert.equal(migrated.payload.data.affected, 1);
  const removed = await request(`/roles/${destination.id}/assignments`, "DELETE", { userId: employee.id, roleVersion: destination.version });
  assert.equal(removed.payload.data.changed, true);
  assert.equal((await request(`/roles/${clonedRole.id}`, "DELETE", { version: reactivatedRole.version })).response.status, 200);

  await closeServer(server);
});

void test("every Phase 2 role route rejects unauthenticated requests with the canonical envelope and no mutation", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createTenantAndAdmin();
  const role = await RoleModel.create({
    tenantId: tenant.id,
    name: "Protected Role",
    normalizedName: "protected role",
    baseRole: "EMPLOYEE",
    grants: [],
    createdBy: user._id,
    updatedBy: user._id,
  });
  const routes = [
    ["GET", "/roles", undefined],
    ["GET", `/roles/${role.id}`, undefined],
    ["GET", `/roles/${role.id}/usage`, undefined],
    ["POST", "/roles", { name: "Denied Create", baseRole: "EMPLOYEE", grants: [] }],
    ["PATCH", `/roles/${role.id}`, { name: "Denied Update", version: 1 }],
    ["POST", `/roles/${role.id}/clone`, { name: "Denied Clone", version: 1 }],
    ["POST", `/roles/${role.id}/archive`, { version: 1 }],
    ["POST", `/roles/${role.id}/reactivate`, { version: 1 }],
    ["DELETE", `/roles/${role.id}`, { version: 1 }],
    ["POST", `/roles/${role.id}/assignments`, { userId: user.id, roleVersion: 1 }],
    ["DELETE", `/roles/${role.id}/assignments`, { userId: user.id, roleVersion: 1 }],
    ["POST", `/roles/${role.id}/user-migrations`, {
      destinationRoleId: role.id,
      sourceVersion: 1,
      destinationVersion: 1,
    }],
  ] as const;
  for (const [method, path, body] of routes) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, 401, `${method} ${path}`);
    const payload = await response.json() as {
      success: boolean;
      error: { code: string; message: string };
    };
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "UNAUTHORIZED");
    assert.equal(typeof payload.error.message, "string");
  }
  const persisted = await RoleModel.findById(role.id).lean().exec();
  assert.equal(persisted?.name, "Protected Role");
  assert.equal(persisted?.status, "active");
  assert.equal(await RoleModel.countDocuments({ tenantId: tenant.id }), 1);
  await closeServer(server);
});

void test("every Phase 2 role route rejects a stale admin JWT after database authority removal", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createTenantAndAdmin();
  const token = await login(port);
  const role = await RoleModel.create({
    tenantId: tenant.id,
    name: "Authority Protected",
    normalizedName: "authority protected",
    baseRole: "EMPLOYEE",
    grants: [],
    createdBy: user._id,
    updatedBy: user._id,
  });
  await UserModel.collection.updateOne({ _id: user._id }, { $set: { role: "EMPLOYEE" } });
  const routes = [
    ["GET", "/roles", undefined],
    ["GET", `/roles/${role.id}`, undefined],
    ["GET", `/roles/${role.id}/usage`, undefined],
    ["POST", "/roles", { name: "Denied Create", baseRole: "EMPLOYEE", grants: [] }],
    ["PATCH", `/roles/${role.id}`, { name: "Denied Update", version: 1 }],
    ["POST", `/roles/${role.id}/clone`, { name: "Denied Clone", version: 1 }],
    ["POST", `/roles/${role.id}/archive`, { version: 1 }],
    ["POST", `/roles/${role.id}/reactivate`, { version: 1 }],
    ["DELETE", `/roles/${role.id}`, { version: 1 }],
    ["POST", `/roles/${role.id}/assignments`, { userId: user.id, roleVersion: 1 }],
    ["DELETE", `/roles/${role.id}/assignments`, { userId: user.id, roleVersion: 1 }],
    ["POST", `/roles/${role.id}/user-migrations`, {
      destinationRoleId: role.id,
      sourceVersion: 1,
      destinationVersion: 1,
    }],
  ] as const;
  for (const [method, path, body] of routes) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, 403, `${method} ${path}`);
    const payload = await response.json() as {
      success: boolean;
      error: { code: string; message: string };
    };
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "PERMISSION_REQUIRED");
  }
  const persisted = await RoleModel.findById(role.id).lean().exec();
  assert.equal(persisted?.name, "Authority Protected");
  assert.equal(persisted?.status, "active");
  assert.equal(await RoleModel.countDocuments({ tenantId: tenant.id }), 1);
  await closeServer(server);
});

void test("role HTTP version contracts preserve legacy and Phase 2 wire codes exactly", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant } = await createTenantAndAdmin();
  const token = await login(port);
  const employee = await UserModel.create({
    tenantId: tenant.id, name: "Version Employee", email: "version-employee@test.com",
    passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true,
  });
  const request = async (path: string, method: string, body: unknown) => {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as {
      success: boolean;
      error: { code: string; message: string };
    };
    assert.equal(payload.success, false);
    assert.equal(typeof payload.error.message, "string");
    return { response, payload };
  };
  const sourceResponse = await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Version Source", baseRole: "EMPLOYEE", grants: [] }),
  });
  const sourceBody = await sourceResponse.json() as { data: { role: { id: string; version: number } } };
  const destinationResponse = await fetch(`http://127.0.0.1:${port}/roles`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ name: "Version Destination", baseRole: "EMPLOYEE", grants: [] }),
  });
  const destinationBody = await destinationResponse.json() as { data: { role: { id: string; version: number } } };
  const source = sourceBody.data.role;
  const destination = destinationBody.data.role;
  const stale = source.version + 9;

  const cases = [
    ["PATCH", `/roles/${source.id}`, { name: "Never", version: stale }, "STALE_ROLE_VERSION"],
    ["DELETE", `/roles/${source.id}`, { version: stale }, "STALE_ROLE_VERSION"],
    ["POST", `/roles/${source.id}/clone`, { name: "Never Clone", version: stale }, "ROLE_VERSION_CONFLICT"],
    ["POST", `/roles/${source.id}/archive`, { version: stale }, "ROLE_VERSION_CONFLICT"],
    ["POST", `/roles/${source.id}/reactivate`, { version: stale }, "ROLE_VERSION_CONFLICT"],
    ["POST", `/roles/${source.id}/assignments`, { userId: employee.id, roleVersion: stale }, "ROLE_VERSION_CONFLICT"],
    ["DELETE", `/roles/${source.id}/assignments`, { userId: employee.id, roleVersion: stale }, "ROLE_VERSION_CONFLICT"],
    ["POST", `/roles/${source.id}/user-migrations`, {
      destinationRoleId: destination.id,
      sourceVersion: stale,
      destinationVersion: destination.version,
    }, "ROLE_VERSION_CONFLICT"],
    ["POST", `/roles/${source.id}/user-migrations`, {
      destinationRoleId: destination.id,
      sourceVersion: source.version,
      destinationVersion: destination.version + 9,
    }, "ROLE_VERSION_CONFLICT"],
  ] as const;
  for (const [method, path, body, code] of cases) {
    const result = await request(path, method, body);
    assert.equal(result.response.status, 409, `${method} ${path}`);
    assert.equal(result.payload.error.code, code, `${method} ${path}`);
  }
  assert.equal((await RoleModel.findById(source.id).lean().exec())?.name, "Version Source");
  assert.equal((await UserModel.findById(employee.id).lean().exec())?.customRoleId ?? null, null);
  await closeServer(server);
});

void test("role HTTP validators reject malformed and missing version inputs without mutation", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user } = await createTenantAndAdmin();
  const token = await login(port);
  const cases = [
    ["GET", "/roles/not-an-object-id", undefined],
    ["GET", "/roles/not-an-object-id/usage", undefined],
    ["PATCH", "/roles/not-an-object-id", { version: 1, name: "Never" }],
    ["POST", "/roles/not-an-object-id/clone", { version: 1, name: "Never" }],
    ["POST", "/roles/not-an-object-id/archive", { version: 1 }],
    ["POST", "/roles/not-an-object-id/reactivate", { version: 1 }],
    ["DELETE", "/roles/not-an-object-id", { version: 1 }],
    ["POST", "/roles/not-an-object-id/assignments", { userId: new mongoose.Types.ObjectId().toString(), roleVersion: 1 }],
    ["DELETE", "/roles/not-an-object-id/assignments", { userId: new mongoose.Types.ObjectId().toString(), roleVersion: 1 }],
    ["POST", "/roles/not-an-object-id/user-migrations", {
      destinationRoleId: new mongoose.Types.ObjectId().toString(), sourceVersion: 1, destinationVersion: 1,
    }],
  ] as const;
  for (const [method, path, body] of cases) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, 400, `${method} ${path}`);
    const payload = await response.json() as { success: boolean; error: { code: string } };
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "MALFORMED_OBJECT_ID");
  }
  const source = await RoleModel.create({
    tenantId: tenant.id, name: "Missing Version Source", normalizedName: "missing version source",
    baseRole: "EMPLOYEE", grants: [], createdBy: user._id, updatedBy: user._id,
  });
  const destination = await RoleModel.create({
    tenantId: tenant.id, name: "Missing Version Destination", normalizedName: "missing version destination",
    baseRole: "EMPLOYEE", grants: [], createdBy: user._id, updatedBy: user._id,
  });
  const employee = await UserModel.create({
    tenantId: tenant.id, name: "Missing Version User", email: "missing-version@test.com",
    passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true,
  });
  const missingVersionCases = [
    ["PATCH", `/roles/${source.id}`, { name: "Never" }],
    ["DELETE", `/roles/${source.id}`, {}],
    ["POST", `/roles/${source.id}/clone`, { name: "Never Clone" }],
    ["POST", `/roles/${source.id}/archive`, {}],
    ["POST", `/roles/${source.id}/reactivate`, {}],
    ["POST", `/roles/${source.id}/assignments`, { userId: employee.id }],
    ["DELETE", `/roles/${source.id}/assignments`, { userId: employee.id }],
    ["POST", `/roles/${source.id}/user-migrations`, { destinationRoleId: destination.id }],
  ] as const;
  for (const [method, path, body] of missingVersionCases) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, 400, `${method} ${path}`);
    const payload = await response.json() as { success: boolean; error: { code: string } };
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "VALIDATION_ERROR");
  }
  assert.equal((await RoleModel.findById(source.id).lean().exec())?.name, "Missing Version Source");
  assert.equal((await UserModel.findById(employee.id).lean().exec())?.customRoleId ?? null, null);
  await closeServer(server);
});

void test("Phase 2 HTTP mutations conceal cross-tenant role and target IDs without mutation", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const first = await createTenantAndAdmin();
  const token = await login(port);
  const secondTenant = await TenantModel.create({
    name: "Foreign Tenant", slug: "foreign-tenant", status: "active", plan: "free",
  });
  const foreignAdmin = await UserModel.create({
    tenantId: secondTenant.id, name: "Foreign Admin", email: "foreign-admin@test.com",
    passwordHash: "test", role: "COMPANY_ADMIN", status: "active", emailVerified: true,
  });
  const foreignUser = await UserModel.create({
    tenantId: secondTenant.id, name: "Foreign User", email: "foreign-user@test.com",
    passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true,
  });
  const localRole = await RoleModel.create({
    tenantId: first.tenant.id, name: "Local Isolation", normalizedName: "local isolation",
    baseRole: "EMPLOYEE", grants: [], createdBy: first.user._id, updatedBy: first.user._id,
  });
  const foreignRole = await RoleModel.create({
    tenantId: secondTenant.id, name: "Foreign Isolation", normalizedName: "foreign isolation",
    baseRole: "EMPLOYEE", grants: [], createdBy: foreignAdmin._id, updatedBy: foreignAdmin._id,
  });
  const cases = [
    ["GET", `/roles/${foreignRole.id}`, undefined],
    ["GET", `/roles/${foreignRole.id}/usage`, undefined],
    ["POST", `/roles/${foreignRole.id}/clone`, { name: "Never Foreign Clone", version: 1 }],
    ["POST", `/roles/${foreignRole.id}/archive`, { version: 1 }],
    ["POST", `/roles/${foreignRole.id}/reactivate`, { version: 1 }],
    ["DELETE", `/roles/${foreignRole.id}`, { version: 1 }],
    ["POST", `/roles/${foreignRole.id}/assignments`, { userId: foreignUser.id, roleVersion: 1 }],
    ["DELETE", `/roles/${foreignRole.id}/assignments`, { userId: foreignUser.id, roleVersion: 1 }],
    ["POST", `/roles/${foreignRole.id}/user-migrations`, {
      destinationRoleId: localRole.id, sourceVersion: 1, destinationVersion: 1,
    }],
    ["POST", `/roles/${localRole.id}/assignments`, { userId: foreignUser.id, roleVersion: 1 }],
    ["DELETE", `/roles/${localRole.id}/assignments`, { userId: foreignUser.id, roleVersion: 1 }],
    ["POST", `/roles/${localRole.id}/user-migrations`, {
      destinationRoleId: foreignRole.id, sourceVersion: 1, destinationVersion: 1,
    }],
  ] as const;
  for (const [method, path, body] of cases) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    assert.equal(response.status, 404, `${method} ${path}`);
    const payload = await response.json() as { success: boolean; error: { code: string } };
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, "NOT_FOUND");
  }
  assert.equal((await RoleModel.findById(foreignRole.id).lean().exec())?.status, "active");
  assert.equal((await UserModel.findById(foreignUser.id).lean().exec())?.customRoleId ?? null, null);
  await closeServer(server);
});

void test("Phase 2 HTTP lifecycle and escalation denials use stable envelopes and do not mutate", async () => {
  const server = await createServer();
  const port = (server.address() as { port: number }).port;
  const { tenant, user: admin } = await createTenantAndAdmin();
  const token = await login(port);
  const employee = await UserModel.create({
    tenantId: tenant.id, name: "Lifecycle Employee", email: "lifecycle-employee@test.com",
    passwordHash: "test", role: "EMPLOYEE", status: "active", emailVerified: true,
  });
  const superAdmin = await UserModel.create({
    tenantId: tenant.id, name: "Lifecycle Super", email: "lifecycle-super@test.com",
    passwordHash: "test", role: "SUPER_ADMIN", status: "active", emailVerified: true,
  });
  const archived = await RoleModel.create({
    tenantId: tenant.id, name: "Archived HTTP", normalizedName: "archived http",
    baseRole: "EMPLOYEE", grants: [], status: "archived",
    createdBy: admin._id, updatedBy: admin._id,
  });
  const quarantinedId = new mongoose.Types.ObjectId();
  await RoleModel.collection.insertOne({
    _id: quarantinedId, tenantId: tenant._id, name: "Quarantined HTTP",
    normalizedName: "quarantined http", baseRole: "EMPLOYEE", grants: [],
    contractVersion: 1, status: "archived", version: 1,
    migrationState: "quarantined", migrationReason: "TEST",
    createdBy: admin._id, updatedBy: admin._id, createdAt: new Date(), updatedAt: new Date(),
  });
  const active = await RoleModel.create({
    tenantId: tenant.id, name: "Super Target HTTP", normalizedName: "super target http",
    baseRole: "EMPLOYEE", grants: [], createdBy: admin._id, updatedBy: admin._id,
  });
  const cases = [
    ["POST", `/roles/${archived.id}/clone`, { name: "Never Archived Clone", version: 1 }, 409, "ROLE_NOT_ASSIGNABLE"],
    ["POST", `/roles/${archived.id}/assignments`, { userId: employee.id, roleVersion: 1 }, 409, "ROLE_NOT_ASSIGNABLE"],
    ["POST", `/roles/${quarantinedId}/reactivate`, { version: 1 }, 409, "ROLE_NOT_ASSIGNABLE"],
    ["POST", `/roles/${quarantinedId}/assignments`, { userId: employee.id, roleVersion: 1 }, 409, "ROLE_NOT_ASSIGNABLE"],
    ["POST", `/roles/${active.id}/assignments`, { userId: superAdmin.id, roleVersion: 1 }, 409, "ROLE_NOT_ASSIGNABLE"],
    ["POST", "/roles", {
      name: "Never Escalated", baseRole: "EMPLOYEE",
      grants: [{ permission: "billing:manage" }],
    }, 403, "PRIVILEGE_ESCALATION"],
  ] as const;
  for (const [method, path, body, status, code] of cases) {
    const response = await fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    assert.equal(response.status, status, `${method} ${path}`);
    const payload = await response.json() as {
      success: boolean;
      error: { code: string; message: string };
    };
    assert.equal(payload.success, false);
    assert.equal(payload.error.code, code);
    assert.equal(typeof payload.error.message, "string");
  }
  assert.equal(await RoleModel.exists({ tenantId: tenant.id, normalizedName: "never archived clone" }), null);
  assert.equal(await RoleModel.exists({ tenantId: tenant.id, normalizedName: "never escalated" }), null);
  assert.equal((await UserModel.findById(employee.id).lean().exec())?.customRoleId ?? null, null);
  assert.equal((await UserModel.findById(superAdmin.id).lean().exec())?.customRoleId ?? null, null);
  assert.equal((await RoleModel.collection.findOne({ _id: quarantinedId }))?.status, "archived");
  await closeServer(server);
});
