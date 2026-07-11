import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";

process.env.NODE_ENV = "test";

import type { Express } from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import RoleModel from "../../db/models/role.model.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { disconnectRedis } from "../../db/redis.js";

const app: Express = (await import("../../app.js")).default;

const TEST_PASSWORD = "StrongPass123!";

let mongoServer: MongoMemoryServer;

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
  mongoServer = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "6.0.20" },
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

  const updateRes = await fetch(`http://127.0.0.1:${port}/roles/${roleId.id}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: "Human Resources" }),
  });

  assert.equal(updateRes.status, 200);
  const body = (await updateRes.json()) as Record<string, unknown>;
  const updated = (body.data as Record<string, unknown>).role as Record<string, unknown>;
  assert.equal(updated.name, "Human Resources");

  await closeServer(server);
});

void test("PATCH /roles/:id — changing baseRole cascades to assigned users", async () => {
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
    body: JSON.stringify({ baseRole: "COMPANY_ADMIN" }),
  });

  assert.equal(updateRes.status, 200);

  const updatedUser = await UserModel.findById(user.id).lean().exec();
  assert.equal(updatedUser?.role, "COMPANY_ADMIN");

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

  const deleteRes = await fetch(`http://127.0.0.1:${port}/roles/${roleId.id}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
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
    headers: { Authorization: `Bearer ${token}` },
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

void test("POST /users (invite) — with customRoleId resolves baseRole", async () => {
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
    body: JSON.stringify({ name: "HR", baseRole: "COMPANY_ADMIN" }),
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
  assert.equal(user.role, "COMPANY_ADMIN");
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
    body: JSON.stringify({ name: "Manager", baseRole: "COMPANY_ADMIN" }),
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
  assert.equal(updatedUser.role, "COMPANY_ADMIN");
  assert.equal(updatedUser.customRoleId, roleId.id);

  await closeServer(server);
});
