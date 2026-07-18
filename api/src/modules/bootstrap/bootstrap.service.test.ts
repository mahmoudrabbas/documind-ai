import assert from "node:assert/strict";
import test, { afterEach, mock } from "node:test";

import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { config } from "../../config/index.js";
import { AppError } from "../../common/errors/AppError.js";
import { bootstrapSuperAdmin } from "./bootstrap.service.js";

const originalEnableBootstrap = config.ENABLE_SUPER_ADMIN_BOOTSTRAP;
const originalBootstrapKey = config.SUPER_ADMIN_BOOTSTRAP_KEY;
const originalTenantFindOneAndUpdate = TenantModel.findOneAndUpdate;
const originalUserFindOne = UserModel.findOne;
const originalUserExists = UserModel.exists;
const originalUserCreate = UserModel.create;

afterEach(() => {
  config.ENABLE_SUPER_ADMIN_BOOTSTRAP = originalEnableBootstrap;
  config.SUPER_ADMIN_BOOTSTRAP_KEY = originalBootstrapKey;
  mock.restoreAll();
  TenantModel.findOneAndUpdate = originalTenantFindOneAndUpdate;
  UserModel.findOne = originalUserFindOne;
  UserModel.exists = originalUserExists;
  UserModel.create = originalUserCreate;
});

function enableBootstrap() {
  config.ENABLE_SUPER_ADMIN_BOOTSTRAP = true;
  config.SUPER_ADMIN_BOOTSTRAP_KEY = "bootstrap-secret";
}

function platformTenant() {
  return {
    _id: "tenant-1",
    id: "tenant-1",
    name: "DocuMind Platform",
    slug: "documind.ai",
    status: "active",
    plan: "free",
    isSystemTenant: true,
  };
}

function superAdminUser(email = "admin@example.com") {
  return {
    _id: "user-1",
    id: "user-1",
    name: "Platform Admin",
    email,
    role: "SUPER_ADMIN" as const,
    status: "active",
    emailVerified: true,
    createdAt: new Date("2026-07-18T10:00:00.000Z"),
  };
}

test("bootstrap scopes same-email checks to the platform tenant and allows a customer account with that email", async () => {
  enableBootstrap();

  mock.method(TenantModel, "findOneAndUpdate", async () => platformTenant());
  mock.method(UserModel, "findOne", async (query: Record<string, unknown>) => {
    assert.equal(query.tenantId, "tenant-1");
    assert.equal(query.email, "shared@example.com");
    return null;
  });
  mock.method(UserModel, "exists", async (query: Record<string, unknown>) => {
    assert.deepEqual(query, { tenantId: "tenant-1", role: "SUPER_ADMIN" });
    return false;
  });
  mock.method(UserModel, "create", async (input: Record<string, unknown>) => ({
    ...superAdminUser("shared@example.com"),
    ...input,
    createdAt: new Date("2026-07-18T10:00:00.000Z"),
  }));

  const result = await bootstrapSuperAdmin(
    {
      name: "Platform Admin",
      email: "shared@example.com",
      password: "StrongPassword1",
    },
    "bootstrap-secret",
  );

  assert.equal(result.email, "shared@example.com");
  assert.equal(result.role, "SUPER_ADMIN");
});

test("bootstrap is idempotent for the same platform-tenant email", async () => {
  enableBootstrap();

  mock.method(TenantModel, "findOneAndUpdate", async () => platformTenant());
  mock.method(UserModel, "findOne", async () =>
    superAdminUser("admin@example.com"));
  mock.method(UserModel, "exists", async () => false);
  mock.method(UserModel, "create", async () => {
    throw new Error("should not create");
  });

  const result = await bootstrapSuperAdmin(
    {
      name: "Platform Admin",
      email: "admin@example.com",
      password: "StrongPassword1",
    },
    "bootstrap-secret",
  );

  assert.equal(result.email, "admin@example.com");
  assert.equal(result.role, "SUPER_ADMIN");
});

test("bootstrap fails safely when the same email exists in the platform tenant with a non-Super-Admin role", async () => {
  enableBootstrap();

  mock.method(TenantModel, "findOneAndUpdate", async () => platformTenant());
  mock.method(UserModel, "findOne", async () => ({
    ...superAdminUser("admin@example.com"),
    role: "EMPLOYEE",
  }));
  mock.method(UserModel, "exists", async () => false);

  await assert.rejects(
    bootstrapSuperAdmin(
      {
        name: "Platform Admin",
        email: "admin@example.com",
        password: "StrongPassword1",
      },
      "bootstrap-secret",
    ),
    (error: unknown) =>
      error instanceof AppError &&
      error.code === "PLATFORM_TENANT_DATA_CONFLICT",
  );
});
