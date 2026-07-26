import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import type { Server } from "node:http";

process.env.NODE_ENV = "test";

import type { Express } from "express";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import { config } from "../../config/index.js";
import DocumentCategoryModel from "../../db/models/documentCategory.model.js";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import DepartmentModel from "../../db/models/department.model.js";
import RoleModel from "../../db/models/role.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { disconnectRedis } from "../../db/redis.js";
import { signJwt } from "../auth/jwtTokens.js";
import { Permission } from "../permissions/permissions.catalog.js";

const app: Express = (await import("../../app.js")).default;
let mongo: MongoMemoryServer | null = null;

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
    instance: { launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) },
  });
  await mongoose.connect(mongo.getUri(), { dbName: "document-taxonomy-routes" });
  await Promise.all([
    DocumentCategoryModel.init(),
    DepartmentModel.init(),
    DocumentClassificationModel.init(),
  ]);
});

beforeEach(async () => {
  await Promise.all([
    DocumentCategoryModel.deleteMany({}),
    DepartmentModel.deleteMany({}),
    DocumentClassificationModel.deleteMany({}),
    RoleModel.deleteMany({}),
    UserModel.deleteMany({}),
    TenantModel.deleteMany({}),
  ]);
});

after(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("tenant administrator can create, list, update, archive, and restore taxonomy", async () => {
  const identity = await createIdentity("route-a", "admin-a@example.test", "COMPANY_ADMIN");
  const server = await createServer();
  try {
    const createdResponse = await request(server, "POST", "/document-taxonomy/categories", identity.token, {
      name: "  Human   Resources ", description: "Policies",
    });
    assert.equal(createdResponse.status, 201);
    const createdBody = await json(createdResponse);
    const category = dataRecord(createdBody, "category");
    assert.equal(category.name, "Human Resources");
    assert.equal("normalizedName" in category, false);
    assert.equal("tenantId" in category, false);
    assert.equal("_id" in category, false);
    assert.equal("__v" in category, false);

    const listResponse = await request(server, "GET", "/document-taxonomy/categories", identity.token);
    const listBody = await json(listResponse);
    assert.equal(listResponse.status, 200);
    assert.equal((listBody.data?.categories as unknown[]).length, 1);

    const updatedResponse = await request(
      server,
      "PATCH",
      `/document-taxonomy/categories/${category.id}`,
      identity.token,
      { name: "People", version: category.version },
    );
    const updated = dataRecord(await json(updatedResponse), "category");
    const archivedResponse = await request(
      server,
      "POST",
      `/document-taxonomy/categories/${category.id}/archive`,
      identity.token,
      { version: updated.version },
    );
    const archived = dataRecord(await json(archivedResponse), "category");
    assert.equal(archived.status, "archived");
    const activeListBody = await json(
      await request(server, "GET", "/document-taxonomy/categories", identity.token),
    );
    const activeList = activeListBody.data?.categories as unknown[];
    assert.equal(activeList.length, 0);
    const restoredResponse = await request(
      server,
      "POST",
      `/document-taxonomy/categories/${category.id}/restore`,
      identity.token,
      { version: archived.version },
    );
    assert.equal(dataRecord(await json(restoredResponse), "category").status, "active");
  } finally {
    await closeServer(server);
  }
});

test("direct employee mutation is denied while custom-role read follows PermissionEvaluator", async () => {
  const identity = await createIdentity("route-b", "employee@example.test", "EMPLOYEE");
  const role = await RoleModel.create({
    tenantId: identity.tenant._id,
    name: "Taxonomy Reader",
    normalizedName: "taxonomy reader",
    baseRole: "EMPLOYEE",
    grants: [{ permission: Permission.COMPANY_SETTINGS_READ }],
    createdBy: identity.user._id,
    updatedBy: identity.user._id,
    migrationState: "complete",
  });
  identity.user.customRoleId = role._id;
  await identity.user.save();
  const server = await createServer();
  try {
    const read = await request(server, "GET", "/document-taxonomy/departments", identity.token);
    assert.equal(read.status, 200);
    const mutation = await request(server, "POST", "/document-taxonomy/departments", identity.token, {
      name: "Blocked",
    });
    assert.equal(mutation.status, 403);
    assert.equal((await json(mutation)).error?.code, "PERMISSION_REQUIRED");
  } finally {
    await closeServer(server);
  }
});

test("tenant context comes from authentication and cross-tenant IDs are hidden", async () => {
  const tenantA = await createIdentity("route-c", "admin-c@example.test", "COMPANY_ADMIN");
  const tenantB = await createIdentity("route-d", "admin-d@example.test", "COMPANY_ADMIN");
  const server = await createServer();
  try {
    const injected = await request(server, "POST", "/document-taxonomy/classifications", tenantA.token, {
      name: "Injected", level: "internal", tenantId: tenantB.tenant.id,
    });
    assert.equal(injected.status, 400);
    assert.equal((await json(injected)).error?.code, "TAXONOMY_VALIDATION_FAILED");

    const invalidLevel = await request(server, "POST", "/document-taxonomy/classifications", tenantA.token, {
      name: "Invalid", level: "top_secret",
    });
    assert.equal(invalidLevel.status, 400);
    assert.equal((await json(invalidLevel)).error?.code, "INVALID_CLASSIFICATION_LEVEL");

    const created = dataRecord(await json(await request(
      server, "POST", "/document-taxonomy/departments", tenantA.token, { name: "Private" },
    )), "department");
    const crossTenant = await request(
      server, "GET", `/document-taxonomy/departments/${created.id}`, tenantB.token,
    );
    assert.equal(crossTenant.status, 404);
    assert.equal((await json(crossTenant)).error?.code, "TAXONOMY_RECORD_NOT_FOUND");
  } finally {
    await closeServer(server);
  }
});

async function createIdentity(slug: string, email: string, role: "COMPANY_ADMIN" | "EMPLOYEE") {
  const tenant = await TenantModel.create({ name: slug, slug, status: "active", plan: "free" });
  const user = await UserModel.create({
    tenantId: tenant._id,
    name: email,
    email,
    passwordHash: "not-used",
    role,
    status: "active",
    emailVerified: true,
  });
  const token = signJwt({
    sub: user.id,
    tenantId: tenant.id,
    role,
    email,
    type: "access",
  }, config.JWT_SECRET, "5m");
  return { tenant, user, token };
}

function createServer(): Promise<Server> {
  return new Promise((resolve) => {
    const server = app.listen(0, () => resolve(server));
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((error) => error ? reject(error) : resolve());
  });
}

function request(
  server: Server,
  method: string,
  path: string,
  token: string,
  body?: Record<string, unknown>,
) {
  const port = (server.address() as { port: number }).port;
  return fetch(`http://127.0.0.1:${port}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function json(response: Response): Promise<{
  data?: Record<string, unknown>;
  error?: { code: string };
}> {
  return response.json() as Promise<{
    data?: Record<string, unknown>;
    error?: { code: string };
  }>;
}

function dataRecord(
  body: { data?: Record<string, unknown> },
  key: string,
): Record<string, unknown> {
  return body.data?.[key] as Record<string, unknown>;
}
