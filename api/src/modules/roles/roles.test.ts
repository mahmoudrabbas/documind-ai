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
import { deleteRole, updateRole } from "./roles.service.js";
import { updateUser } from "../users/users.service.js";

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

void test("POST /users (invite) — custom role does not silently elevate base role", async () => {
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

  assert.equal(inviteRes.status, 201);
  const inviteBody = (await inviteRes.json()) as Record<string, unknown>;
  const user = (inviteBody.data as Record<string, unknown>).user as Record<string, unknown>;
  assert.equal(user.role, "EMPLOYEE");
  assert.equal(user.customRoleId, roleId.id);

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

void test("POST /users (invite) — with neither role nor customRoleId returns 400", async () => {
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

void test("PATCH /users/:id — assigns custom role", async () => {
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

  assert.equal(updateRes.status, 200);
  const updateBody = (await updateRes.json()) as Record<string, unknown>;
  const updatedUser = (updateBody.data as Record<string, unknown>).user as Record<string, unknown>;
  assert.equal(updatedUser.role, "EMPLOYEE");
  assert.equal(updatedUser.customRoleId, roleId.id);

  const persisted = await UserModel.findById(user.id).lean().exec();
  assert.equal(persisted?.role, "EMPLOYEE");

  await closeServer(server);
});

void test("custom-role assignment rejects both base-role mismatch directions", async () => {
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
    const response = await fetch(`http://127.0.0.1:${port}/users/${targetId}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ customRoleId }),
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
    const assignment = updateUser({ customRoleId: role.id }, tenant.id, employee.id, {
      userId: admin.id, role: "COMPANY_ADMIN",
    });
    const lifecycle = operation === "delete"
      ? deleteRole(tenant.id, role.id, 1)
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
