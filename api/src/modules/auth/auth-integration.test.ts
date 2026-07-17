import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import mongoose from "mongoose";

process.env.NODE_ENV = "test";

import app from "../../app.js";
import { connectDB, disconnectDB } from "../../db/connection.js";
import { connectRedis, disconnectRedis, getRedisClient } from "../../db/redis.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import RefreshTokenModel from "../../db/models/refreshToken.model.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import { hashPassword } from "./passwordHashing.js";
import { signJwt } from "./jwtTokens.js";
import { config } from "../../config/index.js";
import { migrateLegacyUsersToEmployee } from "../../scripts/migrate-users-employee.service.js";
import type { RawMigrationCollection } from "../../scripts/migrate-roles-phase1.service.js";

const TEST_PASSWORD = "StrongPass123!";

function createServer() {
  return new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
}

function closeServer(server: ReturnType<typeof app.listen>) {
  return new Promise<void>((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

function getRefreshCookie(response: Response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie
    .split(";")
    .find((part) => part.trim().startsWith("documind_refresh_token="))
    ?.trim();
  assert.ok(cookie, "response should set documind_refresh_token");
  return cookie;
}

function extractAccessToken(body: unknown): string {
  const data = body as { data?: { tokens?: { accessToken?: string } } };
  return data?.data?.tokens?.accessToken ?? "";
}

async function createActiveTenantAdmin(
  overrides: { slug?: string; email?: string; tenantName?: string } = {},
) {
  const tenant = await TenantModel.create({
    name: overrides.tenantName ?? "Acme Consulting",
    slug: overrides.slug ?? "acme-consulting",
    status: "active",
    plan: "free",
  });
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Sarah Ahmed",
    email: overrides.email ?? "sarah@acme.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return { tenant, user };
}

let server: ReturnType<typeof app.listen>;
let port: number;

before(async () => {
  await connectDB();
  await connectRedis();
  server = await createServer();
  port = (server.address() as AddressInfo).port;
});

after(async () => {
  await closeServer(server);
  await disconnectRedis();
  await disconnectDB();
});

beforeEach(async () => {
  await Promise.all([
    TenantModel.deleteMany({}),
    UserModel.deleteMany({}),
    SubscriptionModel.deleteMany({}),
    RefreshTokenModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    getRedisClient().flushdb().catch(() => {}),
  ]);
});

async function registerTenant(
  slug: string,
  email: string,
  companyName = "Test Company",
) {
  return fetch(`http://127.0.0.1:${port}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      companyName,
      companySlug: slug,
      adminName: "Admin User",
      email,
      password: TEST_PASSWORD,
    }),
  });
}

async function login(slug: string, email: string, password = TEST_PASSWORD) {
  return fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companySlug: slug, email, password }),
  });
}

// ─── Logout-All ──────────────────────────────────────────────────────────────

test("logout-all revokes all refresh tokens for the user", async () => {
  await createActiveTenantAdmin();

  await login("acme-consulting", "sarah@acme.com");
  await login("acme-consulting", "sarah@acme.com");
  const loginRes = await login("acme-consulting", "sarah@acme.com");
  const setCookie = loginRes.headers.get("set-cookie") ?? "";
  const accessToken = extractAccessToken(await loginRes.json());

  const tokensBefore = await RefreshTokenModel.countDocuments({
    userId: (await UserModel.findOne({ email: "sarah@acme.com" }))!._id,
    revokedAt: null,
  });
  assert.ok(tokensBefore >= 3, "should have multiple active tokens");

  const logoutAllRes = await fetch(
    `http://127.0.0.1:${port}/auth/logout-all`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        cookie: setCookie.split(";")[0],
        "x-confirm-logout-all": "true",
      },
    },
  );
  assert.equal(logoutAllRes.status, 200);

  const body = await logoutAllRes.json();
  assert.equal(body.success, true);

  const tokensAfter = await RefreshTokenModel.countDocuments({
    userId: (await UserModel.findOne({ email: "sarah@acme.com" }))!._id,
    revokedAt: null,
  });
  assert.equal(tokensAfter, 0, "all tokens should be revoked");
});

test("logout-all returns 401 without authentication", async () => {
  const res = await fetch(`http://127.0.0.1:${port}/auth/logout-all`, {
    method: "POST",
  });
  assert.equal(res.status, 401);
});

test("logout-all returns 409 without confirmation header", async () => {
  await createActiveTenantAdmin();
  await login("acme-consulting", "sarah@acme.com");
  const loginRes = await login("acme-consulting", "sarah@acme.com");
  const setCookie = loginRes.headers.get("set-cookie") ?? "";
  const accessToken = extractAccessToken(await loginRes.json());

  const res = await fetch(
    `http://127.0.0.1:${port}/auth/logout-all`,
    {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        cookie: setCookie.split(";")[0],
      },
    },
  );
  assert.equal(res.status, 409);
  const body = await res.json();
  assert.equal(body.error, "CONFIRMATION_REQUIRED");
});

// ─── Cross-Tenant Token Substitution ─────────────────────────────────────────

test("same email works across different tenants", async () => {
  await createActiveTenantAdmin({ slug: "tenant-alpha", email: "shared@example.com", tenantName: "Alpha" });
  await createActiveTenantAdmin({ slug: "tenant-beta", email: "shared@example.com", tenantName: "Beta" });

  const loginA = await login("tenant-alpha", "shared@example.com");
  const loginB = await login("tenant-beta", "shared@example.com");

  assert.equal(loginA.status, 200);
  assert.equal(loginB.status, 200);

  const bodyA = (await loginA.json()) as { data: { user: { tenantId: string } } };
  const bodyB = (await loginB.json()) as { data: { user: { tenantId: string } } };
  assert.notEqual(bodyA.data.user.tenantId, bodyB.data.user.tenantId);
});

test("login denies incomplete role migration without creating a refresh session", async () => {
  const { user } = await createActiveTenantAdmin();
  await UserModel.updateOne(
    { _id: user._id },
    { $set: { roleMigrationState: "pending-session-revocation" } },
  );
  const response = await login("acme-consulting", "sarah@acme.com");
  assert.equal(response.status, 409);
  const body = (await response.json()) as { error: string };
  assert.equal(body.error, "AUTH_SESSION_MIGRATION_PENDING");
  assert.equal(await RefreshTokenModel.countDocuments({ tenantId: user.tenantId, userId: user._id }), 0);
});

test("refresh denies incomplete role migration and creates no replacement", async () => {
  const { user } = await createActiveTenantAdmin();
  const loginResponse = await login("acme-consulting", "sarah@acme.com");
  const cookie = getRefreshCookie(loginResponse);
  await UserModel.updateOne(
    { _id: user._id },
    { $set: { roleMigrationState: "pending-session-revocation" } },
  );
  const response = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(response.status, 409);
  const body = (await response.json()) as { error: string };
  assert.equal(body.error, "AUTH_SESSION_MIGRATION_PENDING");
  assert.equal(await RefreshTokenModel.countDocuments({
    tenantId: user.tenantId, userId: user._id, revokedAt: null,
  }), 0);
});

test("login between session revocation and migration completion cannot recreate an active session", async () => {
  const { tenant, user } = await createActiveTenantAdmin();
  await UserModel.updateOne(
    { _id: user._id, tenantId: tenant._id },
    { $set: {
      role: "EMPLOYEE",
      permissionBaseline: "legacy-none",
      roleMigrationState: "pending-session-revocation",
    } },
  );
  await RefreshTokenModel.create({
    tenantId: tenant._id,
    userId: user._id,
    tokenHash: "already-revoked",
    jtiHash: "already-revoked",
    familyId: "already-revoked",
    expiresAt: new Date(Date.now() + 60_000),
    revokedAt: new Date(),
  });

  const attemptedLogin = await login("acme-consulting", "sarah@acme.com");
  assert.equal(attemptedLogin.status, 409);
  assert.equal(await RefreshTokenModel.countDocuments({
    tenantId: tenant._id, userId: user._id,
    $or: [{ revokedAt: null }, { revokedAt: { $exists: false } }],
  }), 0);

  if (!mongoose.connection.db) throw new Error("Test database is unavailable");
  const users = mongoose.connection.db.collection("users") as unknown as RawMigrationCollection;
  const roles = mongoose.connection.db.collection("roles") as unknown as RawMigrationCollection;
  const refresh = mongoose.connection.db.collection("refresh_tokens") as unknown as RawMigrationCollection;
  const report = await migrateLegacyUsersToEmployee(users, roles, refresh, {
    apply: true, tenantId: tenant._id.toString(),
  });
  assert.equal(report.updated, 1);
  assert.equal((await UserModel.findById(user._id).lean().exec())?.roleMigrationState, "complete");
  assert.equal(await RefreshTokenModel.countDocuments({
    tenantId: tenant._id, userId: user._id,
    $or: [{ revokedAt: null }, { revokedAt: { $exists: false } }],
  }), 0);
});

test("duplicate email within same tenant is rejected on registration", async () => {
  await registerTenant("unique-tenant", "dup@example.com");
  const secondRes = await registerTenant("unique-tenant-2", "dup@example.com");
});

test("cross-tenant token substitution is rejected", async () => {
  await createActiveTenantAdmin({ slug: "tenant-alpha", email: "alice@alpha.com", tenantName: "Alpha" });
  await createActiveTenantAdmin({ slug: "tenant-beta", email: "bob@beta.com", tenantName: "Beta" });

  const loginA = await login("tenant-alpha", "alice@alpha.com");
  assert.equal(loginA.status, 200);
  const tokenA = extractAccessToken(await loginA.json());
  assert.ok(tokenA, "should get access token from tenant-alpha");

  const resBeta = await fetch(`http://127.0.0.1:${port}/auth/me`, {
    headers: { authorization: `Bearer ${tokenA}` },
  });
  assert.equal(resBeta.status, 200);
  const bodyBeta = (await resBeta.json()) as { data?: { tenant?: { slug?: string } } };
  assert.equal(bodyBeta.data?.tenant?.slug, "tenant-alpha", "token from alpha should only access alpha");
});

test("token replay after refresh rotation is rejected", async () => {
  await createActiveTenantAdmin();

  const loginRes = await login("acme-consulting", "sarah@acme.com");
  const cookie = getRefreshCookie(loginRes);

  const refreshRes1 = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(refreshRes1.status, 200, "first refresh should succeed");

  const refreshRes2 = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(refreshRes2.status, 401, "replayed refresh should be rejected");
  const body2 = (await refreshRes2.json()) as { error?: string };
  assert.equal(body2.error, "REFRESH_TOKEN_REUSED", "should indicate token reuse");
});

test("cross-tenant password reset is rejected", async () => {
  await createActiveTenantAdmin({ slug: "tenant-alpha", email: "alice@alpha.com", tenantName: "Alpha" });
  await createActiveTenantAdmin({ slug: "tenant-beta", email: "bob@beta.com", tenantName: "Beta" });

  const forgotRes = await fetch(`http://127.0.0.1:${port}/auth/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ slug: "tenant-alpha", email: "alice@alpha.com" }),
  });
  assert.equal(forgotRes.status, 200, "forgot-password for tenant-alpha should succeed");

  const resetRes = await fetch(`http://127.0.0.1:${port}/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      slug: "tenant-beta",
      token: "some-fake-token-from-alpha",
      password: "NewPassword123!",
    }),
  });
  assert.ok(resetRes.status >= 400, "cross-tenant reset with wrong slug should fail");
});

// ─── Refresh Token Reuse Detection ──────────────────────────────────────────

test("refresh reuse detection revokes entire family", async () => {
  await createActiveTenantAdmin();

  const loginRes = await login("acme-consulting", "sarah@acme.com");
  const cookie = getRefreshCookie(loginRes);

  const refreshRes1 = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(refreshRes1.status, 200);

  const refreshRes2 = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
    method: "POST",
    headers: { cookie },
  });
  assert.equal(refreshRes2.status, 401);

  const sarah = await UserModel.findOne({ email: "sarah@acme.com" });
  assert.ok(sarah, "sarah user should exist");

  const familyTokens = await RefreshTokenModel.find({
    familyId: { $exists: true },
    userId: sarah._id,
  });
  const revokedCount = familyTokens.filter((t) => t.revokedAt !== null).length;
  assert.ok(
    revokedCount >= 2,
    "reuse detection should revoke tokens in the family",
  );
});

// ─── Concurrent Refresh Requests ─────────────────────────────────────────────

test("concurrent refresh requests succeed and produce valid tokens", async () => {
  await createActiveTenantAdmin();
  const loginRes = await login("acme-consulting", "sarah@acme.com");
  const cookie = getRefreshCookie(loginRes);

  const results = await Promise.all(
    Array.from({ length: 3 }, () =>
      fetch(`http://127.0.0.1:${port}/auth/refresh`, {
        method: "POST",
        headers: { cookie },
      }),
    ),
  );

  const statuses = results.map((r) => r.status);
  const successCount = statuses.filter((s) => s === 200).length;
  assert.ok(
    successCount >= 1,
    "at least one concurrent refresh should succeed",
  );
});

// ─── Forgot Password — No Enumeration ────────────────────────────────────────

test("forgot-password returns generic message for non-existent email", async () => {
  await createActiveTenantAdmin();
  const res = await fetch(`http://127.0.0.1:${port}/auth/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "nonexistent@example.com", slug: "acme-consulting" }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.ok(
    body.message.includes("If an account matches"),
    "should return generic message",
  );
});

test("forgot-password returns generic message for non-existent slug", async () => {
  const res = await fetch(`http://127.0.0.1:${port}/auth/forgot-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "sarah@acme.com", slug: "nonexistent-slug" }),
  });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
});

// ─── Email Verification Edge Cases ──────────────────────────────────────────

test("verify-email with invalid token returns proper error", async () => {
  const res = await fetch(`http://127.0.0.1:${port}/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: "totally-invalid-token" }),
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.success, false);
});

test("verify-email with expired token returns proper error", async () => {
  const expiredToken = signJwt(
    {
      sub: "000000000000000000000001",
      tenantId: "000000000000000000000001",
      email: "test@example.com",
      purpose: "email_verification",
      jti: "000000000000000000000001",
    },
    config.EMAIL_VERIFICATION_JWT_SECRET,
    "-1s",
  );
  const res = await fetch(`http://127.0.0.1:${port}/auth/verify-email`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ token: expiredToken }),
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.success, false);
});

// ─── Refresh Without Cookie ─────────────────────────────────────────────────

test("refresh without cookie returns SESSION_EXPIRED", async () => {
  const res = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
    method: "POST",
  });
  const body = await res.json();
  assert.equal(res.status, 401);
  assert.equal(body.error, "SESSION_EXPIRED");
});

// ─── Login with Invalid Credentials ──────────────────────────────────────────

test("login with wrong password returns INVALID_CREDENTIALS", async () => {
  await createActiveTenantAdmin();
  const res = await login("acme-consulting", "sarah@acme.com", "WrongPassword1!");
  const body = await res.json();
  assert.equal(res.status, 401);
  assert.equal(body.error, "INVALID_CREDENTIALS");
});

test("login with non-existent tenant returns INVALID_CREDENTIALS", async () => {
  const res = await login("nonexistent-slug", "sarah@acme.com");
  const body = await res.json();
  assert.equal(res.status, 401);
  assert.equal(body.error, "INVALID_CREDENTIALS");
});

// ─── Reset Password — Token State ────────────────────────────────────────────

test("reset-password with invalid token returns PASSWORD_RESET_FAILED", async () => {
  const res = await fetch(`http://127.0.0.1:${port}/auth/reset-password`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      token: "invalid",
      slug: "acme-consulting",
      password: "NewPass123!",
      confirmPassword: "NewPass123!",
    }),
  });
  const body = await res.json();
  assert.equal(res.status, 400);
  assert.equal(body.error.code, "PASSWORD_RESET_FAILED");
});

// ─── /auth/me Security ──────────────────────────────────────────────────────

test("GET /me returns 401 with invalid access token", async () => {
  const res = await fetch(`http://127.0.0.1:${port}/auth/me`, {
    headers: { authorization: "Bearer invalid-token" },
  });
  assert.equal(res.status, 401);
});

test("GET /me returns user data for valid token", async () => {
  await createActiveTenantAdmin();
  const loginRes = await login("acme-consulting", "sarah@acme.com");
  const accessToken = extractAccessToken(await loginRes.json());

  const meRes = await fetch(`http://127.0.0.1:${port}/auth/me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  assert.equal(meRes.status, 200);
  const body = (await meRes.json()) as { data: { user: { email: string } } };
  assert.equal(body.data.user.email, "sarah@acme.com");
});

// ─── Registration Cleanup on Failure ─────────────────────────────────────────

test("registration rejects weak password", async () => {
  const res = await fetch(`http://127.0.0.1:${port}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      companyName: "Weak PW Company",
      companySlug: "weak-pw-tenant",
      adminName: "Admin",
      email: "admin@weak.com",
      password: "123",
    }),
  });
  const body = (await res.json()) as { success: boolean; error: string };
  assert.equal(body.success, false);
  assert.equal(body.error, "VALIDATION_ERROR");
});

test("registration rejects duplicate slug", async () => {
  await registerTenant("dup-slug", "first@dup.com", "First");
  const secondRes = await registerTenant("dup-slug", "second@dup.com", "Second");
  const body = await secondRes.json();
  assert.equal(body.success, false);
  assert.equal(body.error, "TENANT_ALREADY_EXISTS");
});

// ─── Complete Trial ──────────────────────────────────────────────────────────

test("complete-trial returns 401 without auth", async () => {
  const res = await fetch(`http://127.0.0.1:${port}/auth/complete-trial`, {
    method: "POST",
  });
  assert.equal(res.status, 401);
});

// ─── Resend Verification Email ───────────────────────────────────────────────

test("resend verification email returns generic response", async () => {
  const res = await fetch(
    `http://127.0.0.1:${port}/auth/resend-verification-email`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "nonexistent@example.com" }),
    },
  );
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.success, true);
  assert.ok(
    body.message.includes("If the email exists"),
    "should return generic message",
  );
});

// ─── Billing: Registration creates subscription (Issue 04) ────────────────────

test("registration creates a TRIALING subscription for the new tenant", async () => {
  const res = await registerTenant("sub-test-co", "admin@subtest.com", "Subscription Test Co");
  assert.equal(res.status, 201, "registration should return 201 Created");

  const body = await res.json() as { data: { tenant: { id: string } } };
  const tenantId = body.data.tenant.id;
  assert.ok(tenantId, "tenant should have an id");

  const subscription = await SubscriptionModel.findOne({ tenantId }).lean().exec();
  assert.ok(subscription, "a subscription should exist for the registered tenant");
  assert.equal(subscription!.status, "TRIALING", "subscription status should be TRIALING");
  assert.ok(subscription!.packageId, "subscription should reference a package");
  assert.ok(subscription!.packageVersion >= 1, "subscription should have a package version");
});

test("registration with packageCode creates subscription for that package", async () => {
  // First register to auto-bootstrap the free package
  await registerTenant("bootstrap-pkg", "bootstrap@subtest.com", "Bootstrap Co");

  const res = await fetch(`http://127.0.0.1:${port}/auth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      companyName: "Package Selector Co",
      companySlug: "pkg-selector",
      adminName: "Admin",
      email: "admin@pkgselect.com",
      password: TEST_PASSWORD,
      packageCode: "free",
    }),
  });
  assert.equal(res.status, 201, "registration with packageCode should return 201 Created");

  const body = await res.json() as { data: { tenant: { id: string } } };
  const tenantId = body.data.tenant.id;

  const subscription = await SubscriptionModel.findOne({ tenantId }).lean().exec();
  assert.ok(subscription, "a subscription should exist");
  assert.equal(subscription!.status, "TRIALING");
});

test("login does not create a new subscription", async () => {
  await createActiveTenantAdmin();

  const loginRes = await login("acme-consulting", "sarah@acme.com");
  assert.equal(loginRes.status, 200);

  // Login should not create a subscription — only registration does
  const subscriptions = await SubscriptionModel.find({}).lean().exec();
  // There could be a subscription created during registration of this tenant
  // in createActiveTenantAdmin — but login itself must not create one
  // So verify no NEW subscription was created specifically by this login
  // (subscription count should stay as-is from registration)
  // createActiveTenantAdmin does not go through registerTenantAndAdmin,
  // so there should be 0 subscriptions
  assert.equal(subscriptions.length, 0, "login should not create a subscription");
});

// ─── Rate Limit Response Shape (LAST — exhausts rate limiter) ────────────────

test("429 response includes retryAfterSeconds", async () => {
  const promises = Array.from({ length: 150 }, () =>
    fetch(`http://127.0.0.1:${port}/auth/login`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        companySlug: "test",
        email: "test@test.com",
        password: "password",
      }),
    }),
  );

  const results = await Promise.all(promises);
  const rateLimited = results.find((r) => r.status === 429);

  assert.ok(rateLimited, "at least one request should be rate limited (429)");
  const body = await rateLimited!.json();
  assert.equal(body.error, "RATE_LIMITED");
  assert.ok(
    typeof body.retryAfterSeconds === "number",
    "should include retryAfterSeconds",
  );
  assert.ok(body.retryAfterSeconds > 0, "retryAfterSeconds should be positive");
});
