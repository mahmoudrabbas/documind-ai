import test, { after, before } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

process.env.NODE_ENV = "test";

import app from "../../app.js";
import { connectDB, disconnectDB } from "../../db/connection.js";
import { disconnectRedis } from "../../db/redis.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import ConversationModel from "../../db/models/conversation.model.js";
import { PLATFORM_TENANT_SLUG } from "../../common/auth/platformTenant.js";
import { hashPassword } from "./passwordHashing.js";
import { signJwt } from "./jwtTokens.js";
import { config } from "../../config/index.js";

const TEST_PASSWORD = "StrongPass123!";

let server: ReturnType<typeof app.listen>;
let port = 0;
let platformTenantId = "";
let superAdminUserId = "";

function closeServer() {
  return new Promise<void>((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function createTenantAdmin(slug: string, email: string) {
  const tenant = await TenantModel.create({
    name: slug,
    slug,
    status: "active",
    plan: "free",
  });
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: `${slug} Admin`,
    email,
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return { tenant, user };
}

async function login(slug: string, email: string) {
  const response = await fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companySlug: slug, email, password: TEST_PASSWORD }),
  });
  const body = await response.json() as {
    data?: { tokens?: { accessToken?: string } };
  };
  return {
    response,
    accessToken: body.data?.tokens?.accessToken ?? "",
    refreshCookie: (response.headers.get("set-cookie") ?? "").split(";")[0] ?? "",
  };
}

function platformToken(): string {
  return signJwt(
    {
      sub: superAdminUserId,
      tenantId: platformTenantId,
      role: "SUPER_ADMIN",
      email: "superadmin@documind.ai",
      type: "access",
    },
    config.JWT_SECRET,
    "1h",
  );
}

function bearer(token: string, json = false): Record<string, string> {
  return {
    authorization: `Bearer ${token}`,
    ...(json ? { "content-type": "application/json" } : {}),
  };
}

async function assertTenantInactive(response: Response) {
  assert.equal(response.status, 403);
  const body = await response.json() as { error?: { code?: string } };
  assert.equal(body.error?.code, "TENANT_NOT_ACTIVE");
}

before(async () => {
  await connectDB();
  const platformTenant = await TenantModel.create({
    name: "DocuMind AI",
    slug: PLATFORM_TENANT_SLUG,
    status: "active",
    plan: "free",
    isSystemTenant: true,
  });
  platformTenantId = platformTenant.id;
  const superAdmin = await UserModel.create({
    tenantId: platformTenantId,
    name: "Platform Admin",
    email: "superadmin@documind.ai",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "SUPER_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  superAdminUserId = superAdmin.id;
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once("listening", resolve));
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  await closeServer();
  await disconnectRedis();
  await disconnectDB();
});

test("suspension immediately blocks existing tokens at shared authenticated entry points", async () => {
  const tenantA = await createTenantAdmin("suspension-a", "admin@suspension-a.test");
  const tenantB = await createTenantAdmin("suspension-b", "admin@suspension-b.test");
  const loginA = await login(tenantA.tenant.slug, tenantA.user.email);
  const loginB = await login(tenantB.tenant.slug, tenantB.user.email);
  assert.equal(loginA.response.status, 200);
  assert.equal(loginB.response.status, 200);
  assert.notEqual(loginA.accessToken, "");
  assert.notEqual(loginA.refreshCookie, "");

  const adminToken = platformToken();
  const suspend = await fetch(
    `http://127.0.0.1:${port}/platform/tenants/${tenantA.tenant.id}/suspend`,
    {
      method: "POST",
      headers: bearer(adminToken, true),
      body: JSON.stringify({ reason: "Existing-token suspension regression" }),
    },
  );
  assert.equal(suspend.status, 200);

  const chatCountBefore = await ConversationModel.countDocuments({ tenantId: tenantA.tenant.id });
  const protectedResponses = await Promise.all([
    fetch(`http://127.0.0.1:${port}/documents`, {
      headers: bearer(loginA.accessToken),
    }),
    fetch(`http://127.0.0.1:${port}/permissions/me`, {
      headers: bearer(loginA.accessToken),
    }),
    fetch(`http://127.0.0.1:${port}/settings`, {
      headers: bearer(loginA.accessToken),
    }),
    fetch(`http://127.0.0.1:${port}/chat/send`, {
      method: "POST",
      headers: bearer(loginA.accessToken, true),
      body: JSON.stringify({ message: "Must not reach chat execution" }),
    }),
    fetch(`http://127.0.0.1:${port}/chat/send/stream`, {
      method: "POST",
      headers: bearer(loginA.accessToken, true),
      body: JSON.stringify({ message: "Must not open an SSE stream" }),
    }),
  ]);
  for (const response of protectedResponses) await assertTenantInactive(response);
  assert.equal(
    await ConversationModel.countDocuments({ tenantId: tenantA.tenant.id }),
    chatCountBefore,
  );

  const loginAfterSuspension = await login(tenantA.tenant.slug, tenantA.user.email);
  assert.equal(loginAfterSuspension.response.status, 403);
  const refreshAfterSuspension = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
    method: "POST",
    headers: { cookie: loginA.refreshCookie },
  });
  assert.ok(refreshAfterSuspension.status >= 400);

  const inspect = await fetch(
    `http://127.0.0.1:${port}/platform/tenants/${tenantA.tenant.id}/detail`,
    { headers: bearer(adminToken) },
  );
  assert.equal(inspect.status, 200);
  const tenantBPermissions = await fetch(`http://127.0.0.1:${port}/permissions/me`, {
    headers: bearer(loginB.accessToken),
  });
  assert.equal(tenantBPermissions.status, 200);

  const reinstate = await fetch(
    `http://127.0.0.1:${port}/platform/tenants/${tenantA.tenant.id}/reinstate`,
    {
      method: "POST",
      headers: bearer(adminToken, true),
      body: JSON.stringify({ reason: "Existing-token suspension regression complete" }),
    },
  );
  assert.equal(reinstate.status, 200);
  const oldTokenAfterReinstatement = await fetch(
    `http://127.0.0.1:${port}/permissions/me`,
    { headers: bearer(loginA.accessToken) },
  );
  assert.equal(oldTokenAfterReinstatement.status, 200);

  await UserModel.updateOne(
    { _id: tenantB.user._id, tenantId: tenantB.tenant._id },
    { $set: { status: "disabled" } },
  );
  const disabledUser = await fetch(`http://127.0.0.1:${port}/auth/me`, {
    headers: bearer(loginB.accessToken),
  });
  assert.equal(disabledUser.status, 403);
});
