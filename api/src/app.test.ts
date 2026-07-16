import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

process.env.NODE_ENV = "test";

import app from "./app.js";
import {
  calculateRetryDelay,
  connectDB,
  disconnectDB,
  getMongoConnectionState,
  isMongoConnected,
} from "./db/connection.js";
import mongoose from "mongoose";
import {
  connectRedis,
  disconnectRedis,
  getRedisClient,
  isRedisConnected,
} from "./db/redis.js";
import TenantModel from "./db/models/tenant.model.js";
import UserModel from "./db/models/user.model.js";
import AuditLogModel from "./db/models/auditLog.model.js";
import RefreshTokenModel from "./db/models/refreshToken.model.js";
import DocumentModel from "./db/models/document.model.js";
import UsageLogModel from "./db/models/usageLog.model.js";
import { createEmailVerificationTokenForUser } from "./modules/auth/auth.service.js";
import { buildEmailVerificationTemplate } from "./modules/auth/auth.mailer.js";
import {
  hashPassword,
  verifyPassword,
} from "./modules/auth/passwordHashing.js";
import { signJwt } from "./modules/auth/jwtTokens.js";
import { config } from "./config/index.js";
import { recordQuestionAsked } from "./modules/usage/usage.service.js";
import { seedSuperAdmin } from "./scripts/seed-super-admin.service.js";

interface TenantDTO {
  id: string;
  name: string;
  slug: string;
  status: string;
  plan: string;
  createdAt: string;
  updatedAt: string;
  stats: { users: number; documents: number; questions: number };
}

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

const TEST_PASSWORD = "StrongPass123!";

async function createActiveTenantAdmin(
  options: {
    slug?: string;
    companyName?: string;
    email?: string;
  } = {},
) {
  const tenant = await TenantModel.create({
    name: options.companyName ?? "Acme Consulting",
    slug: options.slug ?? "acme-consulting",
    status: "active",
    plan: "free",
  });
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Sarah Ahmed",
    email: options.email ?? "sarah@acme.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });

  return { tenant, user };
}

function getRefreshCookie(response: Response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  const cookie = setCookie
    .split(";")
    .find((part) => part.trim().startsWith("documind_refresh_token="))
    ?.trim();

  assert.ok(cookie, "response should set documind_refresh_token");
  return { cookie, setCookie, rawToken: cookie.slice(cookie.indexOf("=") + 1) };
}

async function postLogin(
  port: number,
  companySlug = "acme-consulting",
  email = "sarah@acme.com",
) {
  return fetch(`http://127.0.0.1:${port}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      companySlug,
      email,
      password: TEST_PASSWORD,
    }),
  });
}

type RegisterValidationErrorBody = {
  success: false;
  message: string;
  error: string;
  details: Array<{ field: string; message: string }> | null;
};

function assertNoDuplicateDetailFields(
  details: Array<{ field: string; message: string }> | null,
) {
  assert.ok(Array.isArray(details));

  const fields = details.map((detail) => detail.field);
  assert.equal(new Set(fields).size, fields.length);
}

function assertNoSensitiveFields(value: unknown) {
  const sensitiveFields = new Set([
    "accessToken",
    "refreshToken",
    "passwordHash",
    "emailVerificationTokenHash",
    "emailVerificationExpiresAt",
    "verificationToken",
    "token",
  ]);

  function inspect(candidate: unknown) {
    if (!candidate || typeof candidate !== "object") {
      return;
    }

    if (Array.isArray(candidate)) {
      for (const item of candidate) {
        inspect(item);
      }
      return;
    }

    for (const [key, nestedValue] of Object.entries(candidate)) {
      assert.equal(
        sensitiveFields.has(key),
        false,
        `response exposed sensitive field ${key}`,
      );
      inspect(nestedValue);
    }
  }

  inspect(value);
}

before(async () => {
  await connectDB();
  await connectRedis();
  await UsageLogModel.syncIndexes();
});

beforeEach(async () => {
  await RefreshTokenModel.deleteMany({});
  await AuditLogModel.deleteMany({});
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await DocumentModel.deleteMany({});
  await UsageLogModel.deleteMany({});
});

after(async () => {
  await disconnectRedis();
  await disconnectDB();
});

test("builds a verification email with html and plain text content", () => {
  const verificationUrl = "http://localhost:3000/verify-email?token=test-token";
  const template = buildEmailVerificationTemplate({
    adminName: "Sarah Ahmed",
    companyName: "Acme Consulting",
    verificationUrl,
    expiryLabel: "24 hours",
  });

  assert.equal(template.subject, "Verify your DocuMind AI account");
  assert.match(template.text, /Hi Sarah Ahmed,/);
  assert.match(
    template.text,
    /Please verify your DocuMind AI account for Acme Consulting\./,
  );
  assert.ok(template.text.includes(verificationUrl));
  assert.ok(template.html.includes(`<a href="${verificationUrl}"`));
  assert.ok(template.html.includes(">Verify Email</a>"));
  assert.match(template.html, /Sarah Ahmed/);
  assert.match(template.html, /Acme Consulting/);

  for (const secret of [
    "passwordHash",
    "SMTP_PASS",
    "refreshTokens",
    "internalSecret",
  ]) {
    assert.equal(template.html.includes(secret), false);
  }
});

test("hashPassword returns salted argon2id hashes", async () => {
  const password = "StrongPass123!";
  const firstHash = await hashPassword(password);
  const secondHash = await hashPassword(password);

  assert.equal(typeof firstHash, "string");
  assert.notEqual(firstHash, password);
  assert.match(firstHash, /^\$argon2id\$/);
  assert.notEqual(firstHash, secondHash);
});

test("verifyPassword accepts the correct password and rejects the wrong one", async () => {
  const password = "StrongPass123!";
  const passwordHash = await hashPassword(password);

  assert.equal(await verifyPassword(passwordHash, password), true);
  assert.equal(await verifyPassword(passwordHash, "WrongPass123!"), false);
});

test("verifyPassword safely rejects malformed hashes", async () => {
  assert.equal(
    await verifyPassword("not-an-argon2-hash", "StrongPass123!"),
    false,
  );
});

test("registers a tenant and first company admin", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/auth/register`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companyName: "Acme Consulting",
          companySlug: "acme-consulting",
          adminName: "Sarah Ahmed",
          email: "sarah@acme.com",
          password: "StrongPass123!",
        }),
      },
    );
    const body = (await response.json()) as {
      success: boolean;
      message: string;
      data: {
        tenant: {
          id: string;
          name: string;
          slug: string;
          status: string;
          plan: string;
          createdAt: string;
        };
        user: {
          id: string;
          tenantId: string;
          name: string;
          email: string;
          role: string;
          status: string;
          emailVerified: boolean;
          createdAt: string;
        };
      };
    };

    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.equal(
      body.message,
      "Tenant and company admin created successfully. Please verify your email to activate the account.",
    );
    assert.equal(body.data.tenant.name, "Acme Consulting");
    assert.equal(body.data.tenant.slug, "acme-consulting");
    assert.equal(body.data.tenant.status, "pending_verification");
    assert.equal(body.data.tenant.plan, "free");
    assert.equal(typeof body.data.tenant.createdAt, "string");
    assert.equal(body.data.user.role, "COMPANY_ADMIN");
    assert.equal(body.data.user.status, "pending_email_verification");
    assert.equal(body.data.user.email, "sarah@acme.com");
    assert.equal(body.data.user.emailVerified, false);
    assert.equal(typeof body.data.user.createdAt, "string");
    assert.equal(typeof body.data.user.tenantId, "string");
    assertNoSensitiveFields(body);

    const tenant = await TenantModel.findById(body.data.tenant.id)
      .lean()
      .exec();
    const user = await UserModel.findById(body.data.user.id)
      .select("+passwordHash")
      .lean()
      .exec();

    assert.equal(tenant?.status, "pending_verification");
    assert.equal(user?.status, "pending_email_verification");
    assert.equal(user?.emailVerified, false);
    assert.equal(user?.emailVerifiedAt, null);
    assert.match(user?.passwordHash ?? "", /^\$argon2id\$/);
    assert.equal(
      await verifyPassword(user?.passwordHash ?? "", "StrongPass123!"),
      true,
    );
    assert.equal("passwordHash" in body.data.user, false);
  } finally {
    await closeServer(server);
  }
});

test("verifies email with a valid token and activates user and tenant", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const registerResponse = await fetch(
      `http://127.0.0.1:${address.port}/auth/register`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companyName: "Acme Consulting",
          companySlug: "acme-consulting",
          adminName: "Sarah Ahmed",
          email: "sarah@acme.com",
          password: "StrongPass123!",
        }),
      },
    );

    assert.equal(registerResponse.status, 201);

    const registerBody = (await registerResponse.json()) as {
      success: true;
      data: {
        tenant: { id: string };
        user: { id: string; tenantId: string; email: string };
      };
    };

    const user = await UserModel.findById(registerBody.data.user.id).exec();

    assert.ok(user);
    assert.equal(user.tenantId.toString(), registerBody.data.tenant.id);
    assert.equal(user.email, "sarah@acme.com");

    const token = await createEmailVerificationTokenForUser(user);
    const verifyResponse = await fetch(
      `http://127.0.0.1:${address.port}/auth/verify-email`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ token }),
      },
    );
    const body = (await verifyResponse.json()) as {
      success: boolean;
      message: string;
      data: {
        user: {
          id: string;
          tenantId: string;
          status: string;
          emailVerified: boolean;
        };
        tenant: { id: string; status: string };
      };
    };

    assert.equal(verifyResponse.status, 200);
    assert.equal(body.success, true);
    assert.equal(
      body.message,
      "Email verified successfully. You can now sign in.",
    );
    assert.equal(body.data.user.status, "active");
    assert.equal(body.data.user.emailVerified, true);
    assert.equal(body.data.tenant.status, "active");
    assertNoSensitiveFields(body);

    const verifiedUser = await UserModel.findById(user.id)
      .select("+emailVerificationTokenHash +emailVerificationExpiresAt")
      .lean()
      .exec();
    const activatedTenant = await TenantModel.findById(user.tenantId)
      .lean()
      .exec();

    assert.equal(verifiedUser?.status, "active");
    assert.equal(verifiedUser?.emailVerified, true);
    assert.ok(verifiedUser?.emailVerifiedAt instanceof Date);
    assert.equal(verifiedUser?.emailVerificationTokenHash, null);
    assert.equal(verifiedUser?.emailVerificationExpiresAt, null);
    assert.equal(activatedTenant?.status, "active");
  } finally {
    await closeServer(server);
  }
});

test("invites a user with a valid company admin token", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    await createActiveTenantAdmin();

    const loginResponse = await postLogin(address.port);
    assert.equal(loginResponse.status, 200);

    const loginBody = (await loginResponse.json()) as {
      success: boolean;
      data: { tokens: { accessToken: string } };
    };

    const response = await fetch(`http://127.0.0.1:${address.port}/users`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${loginBody.data.tokens.accessToken}`,
      },
      body: JSON.stringify({
        name: "Alex Employee",
        email: "alex@acme.com",
        role: "EMPLOYEE",
      }),
    });
    const body = (await response.json()) as {
      success: boolean;
      message: string;
      data: {
        user: {
          id: string;
          tenantId: string;
          name: string;
          email: string;
          role: string;
          status: string;
          emailVerified: boolean;
          createdAt: string;
        };
      };
    };

    assert.equal(response.status, 201);
    assert.equal(body.success, true);
    assert.equal(body.data.user.name, "Alex Employee");
    assert.equal(body.data.user.email, "alex@acme.com");
    assert.equal(body.data.user.role, "EMPLOYEE");
    assert.equal(body.data.user.status, "pending_email_verification");
    assert.equal(body.data.user.emailVerified, false);
    assertNoSensitiveFields(body);

    const user = await UserModel.findById(body.data.user.id).select(
      "+emailVerificationTokenHash +emailVerificationExpiresAt",
    );

    assert.ok(user);
    assert.equal(user?.status, "pending_email_verification");
    assert.equal(user?.emailVerified, false);
    assert.ok(user?.emailVerificationTokenHash);
    assert.ok(user?.emailVerificationExpiresAt instanceof Date);
  } finally {
    await closeServer(server);
  }
});

test("invalid invite password preserves the token and successful acceptance consumes it once", async () => {
  const { tenant } = await createActiveTenantAdmin();
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Invited Admin",
    email: "invited-admin@acme.com",
    passwordHash: await hashPassword("TemporaryPassword123!"),
    role: "COMPANY_ADMIN",
    status: "pending_email_verification",
    emailVerified: false,
    emailVerifiedAt: null,
  });
  const token = await createEmailVerificationTokenForUser(user);
  const server = await createServer();
  try {
    const port = (server.address() as AddressInfo).port;
    const endpoint = `http://127.0.0.1:${port}/users/set-password-from-invite`;
    const invalid = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: "weak" }),
    });
    const invalidBody = await invalid.json();
    assert.equal(invalid.status, 400);
    assert.equal((invalidBody.error as unknown as { code: string }).code, "PASSWORD_VALIDATION_FAILED");
    assert.ok(
      invalidBody.error.details.some(
        (detail: { field: string }) => detail.field === "password",
      ),
    );
    const pendingUser = await UserModel.findById(user.id).select(
      "+emailVerificationTokenHash +emailVerificationExpiresAt",
    );
    assert.equal(pendingUser?.status, "pending_email_verification");
    assert.equal(pendingUser?.emailVerified, false);
    assert.ok(pendingUser?.emailVerificationTokenHash);

    const inspection = await fetch(
      `http://127.0.0.1:${port}/users/validate-invite`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token }),
      },
    );
    const inspectionBody = await inspection.json();
    assert.equal(inspection.status, 200);
    assert.equal(inspectionBody.data.companyName, tenant.name);
    assert.equal(inspectionBody.data.email, user.email);
    assert.equal(inspectionBody.data.role, "COMPANY_ADMIN");

    const accepted = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: "ValidPassword123!" }),
    });
    assert.equal(accepted.status, 200);
    const activeUser = await UserModel.findById(user.id).select(
      "+emailVerificationTokenHash",
    );
    assert.equal(activeUser?.status, "active");
    assert.equal(activeUser?.emailVerified, true);
    assert.equal(activeUser?.emailVerificationTokenHash, null);

    const duplicate = await fetch(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, password: "ValidPassword123!" }),
    });
    assert.equal(duplicate.status, 400);
    assert.equal(
      await UserModel.countDocuments({
        tenantId: tenant.id,
        email: user.email,
      }),
      1,
    );
  } finally {
    await closeServer(server);
  }
});

test("updates a tenant user role and status and writes an audit log", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const { tenant } = await createActiveTenantAdmin();

    const employee = await UserModel.create({
      tenantId: tenant.id,
      name: "Dev Employee",
      email: "dev@acme.com",
      passwordHash: await hashPassword(TEST_PASSWORD),
      role: "EMPLOYEE",
      status: "pending_email_verification",
      emailVerified: false,
      emailVerifiedAt: null,
    });

    const loginResponse = await postLogin(address.port);
    assert.equal(loginResponse.status, 200);

    const loginBody = (await loginResponse.json()) as {
      success: boolean;
      data: { tokens: { accessToken: string } };
    };

    const response = await fetch(
      `http://127.0.0.1:${address.port}/users/${employee.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${loginBody.data.tokens.accessToken}`,
        },
        body: JSON.stringify({
          role: "COMPANY_ADMIN",
          status: "active",
        }),
      },
    );

    const body = (await response.json()) as {
      success: boolean;
      data: {
        user: {
          id: string;
          tenantId: string;
          role: string;
          status: string;
          email: string;
          emailVerified: boolean;
          createdAt: string;
        };
      };
    };

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.user.id, employee.id);
    assert.equal(body.data.user.role, "COMPANY_ADMIN");
    assert.equal(body.data.user.status, "active");
    assert.equal(body.data.user.email, "dev@acme.com");
    assertNoSensitiveFields(body);

    const auditRecord = await AuditLogModel.findOne({
      tenantId: employee.tenantId,
      resourceType: "User",
      resourceId: employee.id,
    })
      .lean()
      .exec();

    assert.ok(auditRecord, "expected audit log record to be created");
    assert.equal(auditRecord?.action, "USER_UPDATED");
    assert.equal(auditRecord?.actorEmail, "sarah@acme.com");
    assert.deepEqual(auditRecord?.changes, {
      role: { before: "EMPLOYEE", after: "COMPANY_ADMIN" },
      status: { before: "pending_email_verification", after: "active" },
    });
  } finally {
    await closeServer(server);
  }
});

test("rejects invalid user update payloads", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    await createActiveTenantAdmin();

    const loginResponse = await postLogin(address.port);
    assert.equal(loginResponse.status, 200);

    const loginBody = (await loginResponse.json()) as {
      success: boolean;
      data: { tokens: { accessToken: string } };
    };

    const response = await fetch(
      `http://127.0.0.1:${address.port}/users/000000000000000000000000`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          Authorization: `Bearer ${loginBody.data.tokens.accessToken}`,
        },
        body: JSON.stringify({
          role: "EXECUTIVE",
        }),
      },
    );

    const body = (await response.json()) as {
      success: false;
      error: { code: string; details: Array<{ field: string; message: string }> | null };
    };

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(Array.isArray(body.error.details));
  } finally {
    await closeServer(server);
  }
});

test("rejects invalid invite payloads", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    await createActiveTenantAdmin();

    const loginResponse = await postLogin(address.port);
    assert.equal(loginResponse.status, 200);

    const loginBody = (await loginResponse.json()) as {
      success: boolean;
      data: { tokens: { accessToken: string } };
    };

    const response = await fetch(`http://127.0.0.1:${address.port}/users`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${loginBody.data.tokens.accessToken}`,
      },
      body: JSON.stringify({
        name: "A",
        email: "invalid-email",
      }),
    });
    const body = (await response.json()) as {
      success: false;
      error: { code: string; details: Array<{ field: string; message: string }> | null };
    };

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(Array.isArray(body.error.details));
    assert.ok(body.error.details?.some((detail) => detail.field === "name"));
    assert.ok(body.error.details?.some((detail) => detail.field === "email"));
    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("returns a paginated list of tenant users", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const { tenant } = await createActiveTenantAdmin();

    await Promise.all([
      UserModel.create({
        tenantId: tenant.id,
        name: "Alice Employee",
        email: "alice@acme.com",
        passwordHash: await hashPassword(TEST_PASSWORD),
        role: "EMPLOYEE",
        status: "active",
        emailVerified: true,
        emailVerifiedAt: new Date(),
      }),
      UserModel.create({
        tenantId: tenant.id,
        name: "Bob Employee",
        email: "bob@acme.com",
        passwordHash: await hashPassword(TEST_PASSWORD),
        role: "EMPLOYEE",
        status: "active",
        emailVerified: true,
        emailVerifiedAt: new Date(),
      }),
    ]);

    const loginResponse = await postLogin(address.port);
    assert.equal(loginResponse.status, 200);

    const loginBody = (await loginResponse.json()) as {
      success: boolean;
      data: { tokens: { accessToken: string } };
    };

    const response = await fetch(
      `http://127.0.0.1:${address.port}/users?page=1&pageSize=2`,
      {
        headers: {
          Authorization: `Bearer ${loginBody.data.tokens.accessToken}`,
        },
      },
    );

    const body = (await response.json()) as {
      success: boolean;
      data: {
        users: Array<{
          id: string;
          name: string;
          email: string;
          role: string;
          status: string;
          emailVerified: boolean;
          createdAt: string;
        }>;
        pagination: {
          page: number;
          pageSize: number;
          totalPages: number;
          totalRecords: number;
        };
      };
    };

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.data.pagination.page, 1);
    assert.equal(body.data.pagination.pageSize, 2);
    assert.equal(body.data.pagination.totalRecords, 3);
    assert.equal(body.data.pagination.totalPages, 2);
    assert.equal(body.data.users.length, 2);
    assert.ok(
      body.data.users.some((user) => user.email === "alice@acme.com") ||
        body.data.users.some((user) => user.email === "bob@acme.com"),
    );
    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("rejects invalid pagination query parameters", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    await createActiveTenantAdmin();

    const loginResponse = await postLogin(address.port);
    assert.equal(loginResponse.status, 200);

    const loginBody = (await loginResponse.json()) as {
      success: boolean;
      data: { tokens: { accessToken: string } };
    };

    const response = await fetch(
      `http://127.0.0.1:${address.port}/users?page=0&pageSize=-1`,
      {
        headers: {
          Authorization: `Bearer ${loginBody.data.tokens.accessToken}`,
        },
      },
    );

    const body = (await response.json()) as {
      success: false;
      error: { code: string; details: Array<{ field: string; message: string }> | null };
    };

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "VALIDATION_ERROR");
    assert.ok(Array.isArray(body.error.details));
    assert.ok(body.error.details?.some((detail) => detail.field === "page"));
    assert.ok(body.error.details?.some((detail) => detail.field === "pageSize"));
    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("rejects invalid email verification tokens", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/auth/verify-email`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ token: "not-a-jwt" }),
      },
    );
    const body = (await response.json()) as {
      success: false;
      message: string;
      error: string;
      details: null;
    };

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.message, "Invalid or expired verification token");
    assert.equal(body.error, "INVALID_OR_EXPIRED_VERIFICATION_TOKEN");
    assert.equal(body.details, null);
    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("rejects expired email verification tokens", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    await fetch(`http://127.0.0.1:${address.port}/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        companyName: "Acme Consulting",
        adminName: "Sarah Ahmed",
        email: "sarah@acme.com",
        password: "StrongPass123!",
      }),
    });

    const user = await UserModel.findOne({ email: "sarah@acme.com" }).exec();
    assert.ok(user);

    const token = await createEmailVerificationTokenForUser(user, {
      expiresIn: "0s",
    });
    const response = await fetch(
      `http://127.0.0.1:${address.port}/auth/verify-email`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ token }),
      },
    );
    const body = (await response.json()) as {
      success: false;
      message: string;
      error: string;
    };

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.message, "Invalid or expired verification token");
    assert.equal(body.error, "INVALID_OR_EXPIRED_VERIFICATION_TOKEN");
    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("rejects email verification tokens with the wrong purpose", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    await fetch(`http://127.0.0.1:${address.port}/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        companyName: "Acme Consulting",
        adminName: "Sarah Ahmed",
        email: "sarah@acme.com",
        password: "StrongPass123!",
      }),
    });

    const user = await UserModel.findOne({ email: "sarah@acme.com" }).exec();
    assert.ok(user);

    const token = await createEmailVerificationTokenForUser(user, {
      purpose: "password_reset",
    });
    const response = await fetch(
      `http://127.0.0.1:${address.port}/auth/verify-email`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ token }),
      },
    );
    const body = (await response.json()) as {
      success: false;
      message: string;
      error: string;
    };

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.message, "Invalid or expired verification token");
    assert.equal(body.error, "INVALID_OR_EXPIRED_VERIFICATION_TOKEN");
    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("resend verification email returns a generic response", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    await fetch(`http://127.0.0.1:${address.port}/auth/register`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({
        companyName: "Acme Consulting",
        adminName: "Sarah Ahmed",
        email: "sarah@acme.com",
        password: "StrongPass123!",
      }),
    });

    const knownResponse = await fetch(
      `http://127.0.0.1:${address.port}/auth/resend-verification-email`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "sarah@acme.com" }),
      },
    );
    const unknownResponse = await fetch(
      `http://127.0.0.1:${address.port}/auth/resend-verification-email`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ email: "missing@example.com" }),
      },
    );
    const knownBody = await knownResponse.json();
    const unknownBody = await unknownResponse.json();

    assert.equal(knownResponse.status, 200);
    assert.equal(unknownResponse.status, 200);
    assert.deepEqual(knownBody, {
      success: true,
      message:
        "If the email exists and is not verified, a verification email has been sent",
    });
    assert.deepEqual(unknownBody, knownBody);
    assertNoSensitiveFields(knownBody);
    assertNoSensitiveFields(unknownBody);
  } finally {
    await closeServer(server);
  }
});

test("rejects missing companyName", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/auth/register`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companySlug: "acme-consulting",
          adminName: "Sarah Ahmed",
          email: "sarah@acme.com",
          password: "StrongPass123!",
        }),
      },
    );
    const body = (await response.json()) as RegisterValidationErrorBody;

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.message, "Validation failed");
    assert.equal(body.error, "VALIDATION_ERROR");
    assert.ok(Array.isArray(body.details));
    assert.equal(body.details?.[0].field, "companyName");
    assert.equal(typeof body.details?.[0].message, "string");
    assertNoDuplicateDetailFields(body.details);
  } finally {
    await closeServer(server);
  }
});

test("rejects invalid email", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/auth/register`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companyName: "Acme Consulting",
          adminName: "Sarah Ahmed",
          email: "invalid-email",
          password: "StrongPass123!",
        }),
      },
    );
    const body = (await response.json()) as RegisterValidationErrorBody;

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.message, "Validation failed");
    assert.equal(body.error, "VALIDATION_ERROR");
    assert.ok(body.details?.some((item) => item.field === "email"));
    assertNoDuplicateDetailFields(body.details);
  } finally {
    await closeServer(server);
  }
});

test("rejects weak password", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/auth/register`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companyName: "Acme Consulting",
          adminName: "Sarah Ahmed",
          email: "sarah@acme.com",
          password: "123",
        }),
      },
    );
    const body = (await response.json()) as RegisterValidationErrorBody;

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.message, "Validation failed");
    assert.equal(body.error, "VALIDATION_ERROR");
    assert.deepEqual(body.details, [
      {
        field: "password",
        message:
          "password must be at least 8 characters and contain at least one letter and one number",
      },
    ]);
    assertNoDuplicateDetailFields(body.details);
  } finally {
    await closeServer(server);
  }
});

test("rejects invalid email and weak password with one detail per field", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/auth/register`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companyName: "Acme Consulting",
          adminName: "Sarah Ahmed",
          email: "invalid-email",
          password: "123",
        }),
      },
    );
    const body = (await response.json()) as RegisterValidationErrorBody;

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.message, "Validation failed");
    assert.equal(body.error, "VALIDATION_ERROR");
    assert.deepEqual(body.details, [
      {
        field: "email",
        message: "email must be a valid address",
      },
      {
        field: "password",
        message:
          "password must be at least 8 characters and contain at least one letter and one number",
      },
    ]);
    assertNoDuplicateDetailFields(body.details);
  } finally {
    await closeServer(server);
  }
});

test("allows the same email across different tenants", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;

    const first = await fetch(
      `http://127.0.0.1:${address.port}/auth/register`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companyName: "Acme Consulting",
          companySlug: "acme-consulting-same-email-test",
          adminName: "Sarah Ahmed",
          email: "sarah@acme.com",
          password: "StrongPass123!",
        }),
      },
    );

    const second = await fetch(
      `http://127.0.0.1:${address.port}/auth/register`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companyName: "Acme Solutions",
          companySlug: "acme-solutions-same-email-test",
          adminName: "Jane Smith",
          email: "sarah@acme.com",
          password: "StrongPass123!",
        }),
      },
    );

    assert.equal(first.status, 201);
    assert.equal(second.status, 201);

    const firstBody = (await first.json()) as {
      success: true;
      data: {
        tenant: {
          id: string;
          slug: string;
        };
        user: {
          id: string;
          tenantId: string;
          email: string;
        };
      };
    };

    const secondBody = (await second.json()) as {
      success: true;
      data: {
        tenant: {
          id: string;
          slug: string;
        };
        user: {
          id: string;
          tenantId: string;
          email: string;
        };
      };
    };

    assert.equal(firstBody.success, true);
    assert.equal(secondBody.success, true);

    assert.equal(firstBody.data.user.email, "sarah@acme.com");
    assert.equal(secondBody.data.user.email, "sarah@acme.com");

    assert.notEqual(firstBody.data.tenant.id, secondBody.data.tenant.id);
    assert.notEqual(
      firstBody.data.user.tenantId,
      secondBody.data.user.tenantId,
    );

    assert.equal(firstBody.data.user.tenantId, firstBody.data.tenant.id);
    assert.equal(secondBody.data.user.tenantId, secondBody.data.tenant.id);
  } finally {
    await closeServer(server);
  }
});

test("register error response never returns empty error object", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/auth/register`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companySlug: "acme-consulting",
          adminName: "Sarah Ahmed",
          email: "invalid-email",
          password: "123",
        }),
      },
    );
    const body = await response.json();

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error, "VALIDATION_ERROR");
    assertNoDuplicateDetailFields(body.details);
    assert.notDeepEqual(body, { success: false, error: {} });
  } finally {
    await closeServer(server);
  }
});

test("rejects duplicate tenant slugs", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const first = await fetch(
      `http://127.0.0.1:${address.port}/auth/register`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companyName: "Acme Consulting",
          companySlug: "acme-consulting",
          adminName: "Sarah Ahmed",
          email: "sarah@acme.com",
          password: "StrongPass123!",
        }),
      },
    );
    const second = await fetch(
      `http://127.0.0.1:${address.port}/auth/register`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          companyName: "Acme Consulting",
          companySlug: "acme-consulting",
          adminName: "Jane Smith",
          email: "jane@acme.com",
          password: "StrongPass123!",
        }),
      },
    );

    assert.equal(first.status, 201);
    assert.equal(second.status, 409);
    const body = (await second.json()) as {
      success: false;
      message: string;
      error: string;
      details: null;
    };

    assert.equal(body.success, false);
    assert.equal(body.message, "Tenant already exists");
    assert.equal(body.error, "TENANT_ALREADY_EXISTS");
    assert.equal(body.details, null);
  } finally {
    await closeServer(server);
  }
});

test("returns a standardized error envelope for handled errors", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/boom`);
    const body = (await response.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
        details: { field: string; issue: string } | null;
        path: string;
        method: string;
        timestamp: string;
      };
    };

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "BAD_REQUEST");
    assert.equal(body.error.message, "Bad request");
    assert.deepEqual(body.error.details, {
      field: "email",
      issue: "invalid format",
    });
    assert.equal(body.error.path, "/boom");
    assert.equal(body.error.method, "GET");
    assert.match(body.error.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await closeServer(server);
  }
});

test("returns a standardized 404 envelope for unknown routes", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(
      `http://127.0.0.1:${address.port}/does-not-exist`,
    );
    const body = (await response.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
        details: null;
        path: string;
        method: string;
        timestamp: string;
      };
    };

    assert.equal(response.status, 404);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "NOT_FOUND");
    assert.equal(body.error.message, "Route not found");
    assert.equal(body.error.details, null);
    assert.equal(body.error.path, "/does-not-exist");
    assert.equal(body.error.method, "GET");
    assert.match(body.error.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await closeServer(server);
  }
});

test("returns a standardized validation error envelope with a route-specific code", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/signup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "invalid" }),
    });
    const body = (await response.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
        details: { errors: Array<{ field: string; issue: string }> } | null;
        path: string;
        method: string;
        timestamp: string;
      };
    };

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "AUTH_SIGNUP_VALIDATION_ERROR");
    assert.equal(body.error.message, "Validation failed");
    assert.deepEqual(body.error.details, {
      errors: [{ field: "email", issue: "invalid format" }],
    });
    assert.equal(body.error.path, "/signup");
    assert.equal(body.error.method, "POST");
    assert.match(body.error.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await closeServer(server);
  }
});

test("returns a standardized 400 envelope for malformed JSON", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/signup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: '{"brokenJson":',
    });
    const body = (await response.json()) as {
      success: boolean;
      error: {
        code: string;
        message: string;
        details: null;
        path: string;
        method: string;
        timestamp: string;
      };
    };

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.error.code, "BAD_REQUEST");
    assert.equal(body.error.message, "Invalid JSON payload");
    assert.equal(body.error.details, null);
    assert.equal(body.error.path, "/signup");
    assert.equal(body.error.method, "POST");
    assert.match(body.error.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await closeServer(server);
  }
});

test("login stores a hashed refresh token record without exposing the token", async () => {
  const { tenant, user } = await createActiveTenantAdmin();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await postLogin(port);
    const body = await response.json();
    const { rawToken, setCookie } = getRefreshCookie(response);

    assert.equal(response.status, 200);
    assert.match(setCookie, /HttpOnly/i);
    assert.equal(JSON.stringify(body).includes("refreshToken"), false);
    assert.equal(JSON.stringify(body).includes(rawToken), false);

    const records = await RefreshTokenModel.find({
      tenantId: tenant.id,
      userId: user.id,
    })
      .lean()
      .exec();

    assert.equal(records.length, 1);
    assert.ok(records[0]?.tokenHash);
    assert.ok(records[0]?.jtiHash);
    assert.ok(records[0]?.familyId);
    assert.equal(JSON.stringify(records[0]).includes(rawToken), false);
  } finally {
    await closeServer(server);
  }
});

test("refresh rotates the persisted refresh token within the same family", async () => {
  await createActiveTenantAdmin();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const loginResponse = await postLogin(port);
    const originalCookie = getRefreshCookie(loginResponse);
    const oldRecord = await RefreshTokenModel.findOne().lean().exec();
    assert.ok(oldRecord);

    const refreshResponse = await fetch(
      `http://127.0.0.1:${port}/auth/refresh`,
      {
        method: "POST",
        headers: { cookie: originalCookie.cookie },
      },
    );
    const body = (await refreshResponse.json()) as {
      success: boolean;
      data: { tokens: { accessToken: string } };
    };
    const rotatedCookie = getRefreshCookie(refreshResponse);

    assert.equal(refreshResponse.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data.tokens.accessToken);
    assert.notEqual(rotatedCookie.rawToken, originalCookie.rawToken);

    const persistedOldRecord = await RefreshTokenModel.findById(oldRecord._id)
      .lean()
      .exec();
    const activeRecord = await RefreshTokenModel.findOne({
      familyId: oldRecord.familyId,
      revokedAt: null,
    })
      .lean()
      .exec();

    assert.ok(persistedOldRecord?.revokedAt instanceof Date);
    assert.ok(persistedOldRecord?.replacedByTokenId);
    assert.ok(activeRecord);
    assert.equal(activeRecord.familyId, oldRecord.familyId);
    assert.notEqual(activeRecord.tokenHash, oldRecord.tokenHash);
    assert.notEqual(activeRecord.jtiHash, oldRecord.jtiHash);
    assert.equal(
      persistedOldRecord.replacedByTokenId?.toString(),
      activeRecord._id.toString(),
    );
  } finally {
    await closeServer(server);
  }
});

test("reusing a rotated refresh token revokes its whole family", async () => {
  await createActiveTenantAdmin();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const loginResponse = await postLogin(port);
    const originalCookie = getRefreshCookie(loginResponse);
    const originalRecord = await RefreshTokenModel.findOne().lean().exec();
    assert.ok(originalRecord);

    const firstRefresh = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
      method: "POST",
      headers: { cookie: originalCookie.cookie },
    });
    assert.equal(firstRefresh.status, 200);

    const reuseResponse = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
      method: "POST",
      headers: { cookie: originalCookie.cookie },
    });
    const body = (await reuseResponse.json()) as {
      success: false;
      error: string;
    };

    assert.equal(reuseResponse.status, 401);
    assert.equal(body.error, "REFRESH_TOKEN_REUSED");

    const familyRecords = await RefreshTokenModel.find({
      familyId: originalRecord.familyId,
    })
      .lean()
      .exec();

    assert.equal(familyRecords.length, 2);
    assert.ok(
      familyRecords.every((record) => record.revokedAt instanceof Date),
    );
    assert.ok(
      familyRecords.some((record) => record.reuseDetectedAt instanceof Date),
    );
  } finally {
    await closeServer(server);
  }
});

test("refresh without a cookie returns SESSION_EXPIRED", async () => {
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
      method: "POST",
    });
    const body = (await response.json()) as { error: string };

    assert.equal(response.status, 401);
    assert.equal(body.error, "SESSION_EXPIRED");
  } finally {
    await closeServer(server);
  }
});

test("refresh with an invalid token returns SESSION_EXPIRED", async () => {
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/auth/refresh`, {
      method: "POST",
      headers: { cookie: "documind_refresh_token=invalid-token" },
    });
    const body = (await response.json()) as { error: string };

    assert.equal(response.status, 401);
    assert.equal(body.error, "SESSION_EXPIRED");
  } finally {
    await closeServer(server);
  }
});

test("logout revokes the current refresh token and clears its cookie", async () => {
  await createActiveTenantAdmin();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const loginResponse = await postLogin(port);
    const loginCookie = getRefreshCookie(loginResponse);
    const tokenRecord = await RefreshTokenModel.findOne().lean().exec();
    assert.ok(tokenRecord);

    const response = await fetch(`http://127.0.0.1:${port}/auth/logout`, {
      method: "POST",
      headers: { cookie: loginCookie.cookie },
    });
    const body = (await response.json()) as {
      success: boolean;
      message: string;
    };
    const setCookie = response.headers.get("set-cookie") ?? "";
    const revokedRecord = await RefreshTokenModel.findById(tokenRecord._id)
      .lean()
      .exec();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.message, "Logged out successfully");
    assert.match(setCookie, /documind_refresh_token=/);
    assert.match(setCookie, /Max-Age=0|Expires=Thu, 01 Jan 1970/i);
    assert.ok(revokedRecord?.revokedAt instanceof Date);
  } finally {
    await closeServer(server);
  }
});

test("logout without a cookie remains idempotent", async () => {
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/auth/logout`, {
      method: "POST",
    });
    const body = (await response.json()) as {
      success: boolean;
      message: string;
    };
    const setCookie = response.headers.get("set-cookie") ?? "";

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.message, "Logged out successfully");
    assert.match(setCookie, /documind_refresh_token=/);
  } finally {
    await closeServer(server);
  }
});

test("refresh token records isolate the same email across tenants", async () => {
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const tenantA = await TenantModel.create({
    name: "Tenant Alpha",
    slug: "tenant-alpha",
    status: "active",
    plan: "free",
  });
  const tenantB = await TenantModel.create({
    name: "Tenant Beta",
    slug: "tenant-beta",
    status: "active",
    plan: "free",
  });
  const sharedUserFields = {
    name: "Shared Email User",
    email: "shared@example.com",
    passwordHash,
    role: "COMPANY_ADMIN" as const,
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  };
  const [userA, userB] = await Promise.all([
    UserModel.create({ ...sharedUserFields, tenantId: tenantA.id }),
    UserModel.create({ ...sharedUserFields, tenantId: tenantB.id }),
  ]);
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const [loginA, loginB] = await Promise.all([
      postLogin(port, tenantA.slug, sharedUserFields.email),
      postLogin(port, tenantB.slug, sharedUserFields.email),
    ]);

    assert.equal(loginA.status, 200);
    assert.equal(loginB.status, 200);

    const [recordsA, recordsB] = await Promise.all([
      RefreshTokenModel.find({
        tenantId: tenantA.id,
        userId: userA.id,
      })
        .lean()
        .exec(),
      RefreshTokenModel.find({
        tenantId: tenantB.id,
        userId: userB.id,
      })
        .lean()
        .exec(),
    ]);

    assert.equal(recordsA.length, 1);
    assert.equal(recordsB.length, 1);
    assert.notEqual(
      recordsA[0]?.tenantId.toString(),
      recordsB[0]?.tenantId.toString(),
    );
    assert.notEqual(recordsA[0]?.tokenHash, recordsB[0]?.tokenHash);
  } finally {
    await closeServer(server);
  }
});

test("redis responds to PING", async () => {
  const redis = getRedisClient();
  const result = await redis.ping();

  assert.equal(result, "PONG");
});

test("isRedisConnected returns true after connect", () => {
  assert.equal(isRedisConnected(), true);
});

test("/readyz returns 200 when redis and mongo are connected", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/readyz`);
    const body = (await response.json()) as {
      status: string;
      checks: { mongo: string; redis: string };
    };

    assert.equal(response.status, 200);
    assert.equal(body.status, "ready");
    assert.equal(body.checks.mongo, "connected");
    assert.equal(body.checks.redis, "connected");
  } finally {
    await closeServer(server);
  }
});

test("/healthz returns 200 with status ok", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/healthz`);
    const body = (await response.json()) as { status: string };

    assert.equal(response.status, 200);
    assert.equal(body.status, "ok");
    assert.ok(response.headers.get("x-request-id"));
  } finally {
    await closeServer(server);
  }
});

test("preserves a valid incoming X-Request-ID", async () => {
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
      headers: { "x-request-id": "test-request-123" },
    });

    assert.equal(response.status, 200);
    assert.equal(response.headers.get("x-request-id"), "test-request-123");
  } finally {
    await closeServer(server);
  }
});

test("uses X-Correlation-ID when X-Request-ID is missing", async () => {
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
      headers: { "x-correlation-id": "correlation-123" },
    });

    assert.equal(response.headers.get("x-request-id"), "correlation-123");
  } finally {
    await closeServer(server);
  }
});

test("replaces an invalid request ID", async () => {
  const server = await createServer();
  const invalidRequestId = "a".repeat(129);

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/healthz`, {
      headers: { "x-request-id": invalidRequestId },
    });
    const requestId = response.headers.get("x-request-id");

    assert.ok(requestId);
    assert.notEqual(requestId, invalidRequestId);
  } finally {
    await closeServer(server);
  }
});

test("includes the request ID in error responses", async () => {
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/unknown-route`, {
      headers: { "x-request-id": "error-test-123" },
    });
    const body = (await response.json()) as {
      error: {
        code: string;
        message: string;
        details: unknown;
        path: string;
        method: string;
        requestId: string;
        timestamp: string;
      };
    };

    assert.equal(response.status, 404);
    assert.equal(body.error.requestId, "error-test-123");
    assert.equal(body.error.code, "NOT_FOUND");
    assert.equal(typeof body.error.message, "string");
    assert.equal(body.error.details, null);
    assert.equal(body.error.path, "/unknown-route");
    assert.equal(body.error.method, "GET");
    assert.match(body.error.timestamp, /^\d{4}-\d{2}-\d{2}T/);
  } finally {
    await closeServer(server);
  }
});

test("includes the same request ID header in validation errors", async () => {
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/signup`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-request-id": "validation-test-123",
      },
      body: JSON.stringify({ email: "invalid" }),
    });
    const body = (await response.json()) as {
      error: { requestId: string };
    };

    assert.equal(response.status, 400);
    assert.equal(response.headers.get("x-request-id"), "validation-test-123");
    assert.equal(body.error.requestId, "validation-test-123");
  } finally {
    await closeServer(server);
  }
});

test("reports the connected MongoDB state after connectDB", () => {
  assert.equal(isMongoConnected(), true);
  assert.equal(getMongoConnectionState(), "connected");
});

test("calculates capped exponential MongoDB retry delays", () => {
  assert.equal(calculateRetryDelay(1, 100, 2, 250), 100);
  assert.equal(calculateRetryDelay(2, 100, 2, 250), 200);
  assert.equal(calculateRetryDelay(3, 100, 2, 250), 250);
});

test("disconnectDB is idempotent and readiness reflects disconnection", async () => {
  await disconnectDB();
  await disconnectDB();

  assert.equal(isMongoConnected(), false);
  assert.equal(getMongoConnectionState(), "disconnected");

  const server = await createServer();
  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/readyz`);

    assert.equal(response.status, 503);
  } finally {
    await closeServer(server);
    await connectDB();
  }
});

// Tests for GET /auth/me (T2.2.5)
test("GET /auth/me returns 401 when no access token is provided", async () => {
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/auth/me`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error?.code, "UNAUTHORIZED");
  } finally {
    await closeServer(server);
  }
});

test("GET /auth/me returns the current user and tenant for a valid access token", async () => {
  const { tenant, user } = await createActiveTenantAdmin();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    // Login to receive an access token
    const loginResponse = await postLogin(port, tenant.slug, user.email);
    const loginBody = await loginResponse.json();
    const accessToken = loginBody.data?.tokens?.accessToken;

    assert.ok(accessToken, "login should return an accessToken");

    const response = await fetch(`http://127.0.0.1:${port}/auth/me`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.ok(body.data?.user);
    assert.equal(body.data.user.email, user.email);
    assert.equal(body.data.tenant?.id, tenant.id);
    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("GET /auth/me returns 401 for an invalid or malformed access token", async () => {
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/auth/me`, {
      headers: { Authorization: "Bearer not-a-valid-token" },
    });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error?.code, "UNAUTHORIZED");
    assert.equal(body.error?.message, "Invalid or expired access token");
  } finally {
    await closeServer(server);
  }
});

test("GET /auth/me returns 401 for an expired access token", async () => {
  const { tenant, user } = await createActiveTenantAdmin();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const expiredToken = signJwt(
      { sub: user.id, tenantId: tenant.id, type: "access" },
      config.JWT_SECRET,
      "0s",
    );

    const response = await fetch(`http://127.0.0.1:${port}/auth/me`, {
      headers: { Authorization: `Bearer ${expiredToken}` },
    });
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error?.code, "UNAUTHORIZED");
    assert.equal(body.error?.message, "Invalid or expired access token");
  } finally {
    await closeServer(server);
  }
});

// ────────────────────────────────────────────────────────────────────────────
// GET /platform/tenants - List all tenants (SUPER_ADMIN only)
// ────────────────────────────────────────────────────────────────────────────

async function createSuperAdminUser() {
  // Create a super admin with a platform-level tenantId (required by User schema)
  // SUPER_ADMIN users operate at platform level and have access to all tenants
  const user = await UserModel.create({
    tenantId: new mongoose.Types.ObjectId(),
    name: "Platform Admin",
    email: "admin@platform.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "SUPER_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return user;
}

async function getSuperAdminAccessToken() {
  const user = await createSuperAdminUser();
  const token = signJwt(
    {
      sub: user.id,
      tenantId: user.tenantId.toString(),
      role: user.role,
      email: user.email,
      type: "access",
    },
    config.JWT_SECRET,
    "1h",
  );
  return token;
}

test("GET /platform/tenants returns 401 without authentication", async () => {
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/platform/tenants`);
    const body = await response.json();

    assert.equal(response.status, 401);
    assert.equal(body.error?.code, "UNAUTHORIZED");
    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("GET /platform/tenants returns 403 for non-SUPER_ADMIN users", async () => {
  const { tenant, user } = await createActiveTenantAdmin();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const token = signJwt(
      { sub: user.id, tenantId: tenant.id, type: "access", role: "COMPANY_ADMIN" },
      config.JWT_SECRET,
      "1h",
    );

    const response = await fetch(`http://127.0.0.1:${port}/platform/tenants`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();

    assert.equal(response.status, 403);
    assert.equal(body.error?.code, "FORBIDDEN");
    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("GET /platform/tenants returns all tenants for SUPER_ADMIN without filters", async () => {
  // Create multiple tenants
  await TenantModel.create([
    {
      name: "Acme Corp",
      slug: "acme-corp",
      status: "active",
      plan: "pro",
    },
    {
      name: "Tech Startup",
      slug: "tech-startup",
      status: "trial",
      plan: "trial",
    },
    {
      name: "Small Biz",
      slug: "small-biz",
      status: "pending",
      plan: "free",
    },
  ]);

  const token = await getSuperAdminAccessToken();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(`http://127.0.0.1:${port}/platform/tenants`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.success, true);
    assert.ok(Array.isArray(body.data?.tenants));
    assert.equal(body.data.tenants.length, 3);
    assert.equal(body.data.pagination.page, 1);
    assert.equal(body.data.pagination.pageSize, 20);
    assert.equal(body.data.pagination.totalRecords, 3);
    assert.equal(body.data.pagination.totalPages, 1);

    // Verify tenant structure
    const tenant = body.data.tenants[0];
    assert.ok(tenant.id);
    assert.ok(tenant.name);
    assert.ok(tenant.slug);
    assert.ok(tenant.status);
    assert.ok(tenant.plan);
    assert.ok(tenant.createdAt);
    assert.ok(tenant.updatedAt);

    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("GET /platform/tenants supports pagination", async () => {
  // Create 25 tenants to test pagination
  const tenants = [];
  for (let i = 1; i <= 25; i++) {
    tenants.push({
      name: `Tenant ${i}`,
      slug: `tenant-${i}`,
      status: "active",
      plan: "free",
    });
  }
  await TenantModel.create(tenants);

  const token = await getSuperAdminAccessToken();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;

    // Test page 1 with pageSize 10
    const response1 = await fetch(
      `http://127.0.0.1:${port}/platform/tenants?page=1&pageSize=10`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body1 = await response1.json();

    assert.equal(response1.status, 200);
    assert.equal(body1.data.tenants.length, 10);
    assert.equal(body1.data.pagination.page, 1);
    assert.equal(body1.data.pagination.pageSize, 10);
    assert.equal(body1.data.pagination.totalRecords, 25);
    assert.equal(body1.data.pagination.totalPages, 3);

    // Test page 2
    const response2 = await fetch(
      `http://127.0.0.1:${port}/platform/tenants?page=2&pageSize=10`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body2 = await response2.json();

    assert.equal(response2.status, 200);
    assert.equal(body2.data.tenants.length, 10);
    assert.equal(body2.data.pagination.page, 2);

    // Test page 3
    const response3 = await fetch(
      `http://127.0.0.1:${port}/platform/tenants?page=3&pageSize=10`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body3 = await response3.json();

    assert.equal(response3.status, 200);
    assert.equal(body3.data.tenants.length, 5);
    assert.equal(body3.data.pagination.page, 3);

    assertNoSensitiveFields(body1);
  } finally {
    await closeServer(server);
  }
});

test("GET /platform/tenants filters by status", async () => {
  await TenantModel.create([
    { name: "Active Tenant", slug: "active-1", status: "active", plan: "pro" },
    { name: "Trial Tenant", slug: "trial-1", status: "trial", plan: "trial" },
    {
      name: "Active Tenant 2",
      slug: "active-2",
      status: "active",
      plan: "free",
    },
    {
      name: "Pending Tenant",
      slug: "pending-1",
      status: "pending",
      plan: "free",
    },
  ]);

  const token = await getSuperAdminAccessToken();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/platform/tenants?status=active`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.tenants.length, 2);
    assert.ok(body.data.tenants.every((t: TenantDTO) => t.status === "active"));
    assert.equal(body.data.pagination.totalRecords, 2);

    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("GET /platform/tenants filters by plan", async () => {
  await TenantModel.create([
    { name: "Free 1", slug: "free-1", status: "active", plan: "free" },
    { name: "Pro 1", slug: "pro-1", status: "active", plan: "pro" },
    { name: "Free 2", slug: "free-2", status: "pending", plan: "free" },
    { name: "Trial 1", slug: "trial-1", status: "trial", plan: "trial" },
  ]);

  const token = await getSuperAdminAccessToken();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/platform/tenants?plan=free`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.tenants.length, 2);
    assert.ok(body.data.tenants.every((t: TenantDTO) => t.plan === "free"));
    assert.equal(body.data.pagination.totalRecords, 2);

    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("GET /platform/tenants searches by name and slug", async () => {
  await TenantModel.create([
    {
      name: "Acme Corporation",
      slug: "acme-corp",
      status: "active",
      plan: "pro",
    },
    {
      name: "Acme Consulting",
      slug: "acme-consult",
      status: "active",
      plan: "free",
    },
    {
      name: "TechVision Inc",
      slug: "techvision",
      status: "active",
      plan: "trial",
    },
    {
      name: "Beta Company",
      slug: "beta-tech",
      status: "pending",
      plan: "free",
    },
  ]);

  const token = await getSuperAdminAccessToken();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/platform/tenants?search=acme`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.tenants.length, 2);
    assert.ok(
      body.data.tenants.every(
        (t: TenantDTO) =>
          t.name.toLowerCase().includes("acme") ||
          t.slug.toLowerCase().includes("acme"),
      ),
    );

    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("GET /platform/tenants combines multiple filters", async () => {
  await TenantModel.create([
    { name: "Acme Pro", slug: "acme-pro", status: "active", plan: "pro" },
    { name: "Acme Free", slug: "acme-free", status: "pending", plan: "free" },
    { name: "Acme Trial", slug: "acme-trial", status: "trial", plan: "trial" },
    {
      name: "Other Active Pro",
      slug: "other-pro",
      status: "active",
      plan: "pro",
    },
  ]);

  const token = await getSuperAdminAccessToken();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/platform/tenants?search=acme&status=active&plan=pro`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.tenants.length, 1);
    assert.equal(body.data.tenants[0].name, "Acme Pro");
    assert.equal(body.data.tenants[0].status, "active");
    assert.equal(body.data.tenants[0].plan, "pro");

    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("GET /platform/tenants rejects invalid pagination values", async () => {
  const token = await getSuperAdminAccessToken();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;

    // Test invalid page (0)
    const response1 = await fetch(
      `http://127.0.0.1:${port}/platform/tenants?page=0`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body1 = await response1.json();

    assert.equal(response1.status, 400);
    assert.equal(body1.error, "VALIDATION_ERROR");

    // Test invalid pageSize (too large)
    const response2 = await fetch(
      `http://127.0.0.1:${port}/platform/tenants?pageSize=101`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body2 = await response2.json();

    assert.equal(response2.status, 400);
    assert.equal(body2.error, "VALIDATION_ERROR");

    assertNoSensitiveFields(body1);
  } finally {
    await closeServer(server);
  }
});

test("GET /platform/tenants rejects invalid filter values", async () => {
  const token = await getSuperAdminAccessToken();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;

    // Test invalid status
    const response1 = await fetch(
      `http://127.0.0.1:${port}/platform/tenants?status=invalid`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body1 = await response1.json();

    assert.equal(response1.status, 400);
    assert.equal(body1.error, "VALIDATION_ERROR");

    // Test invalid plan
    const response2 = await fetch(
      `http://127.0.0.1:${port}/platform/tenants?plan=invalid`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body2 = await response2.json();

    assert.equal(response2.status, 400);
    assert.equal(body2.error, "VALIDATION_ERROR");

    assertNoSensitiveFields(body1);
  } finally {
    await closeServer(server);
  }
});

test("GET /platform/tenants returns empty list when no tenants match filters", async () => {
  await TenantModel.create({
    name: "Acme Active",
    slug: "acme-active",
    status: "active",
    plan: "pro",
  });

  const token = await getSuperAdminAccessToken();
  const server = await createServer();

  try {
    const port = (server.address() as AddressInfo).port;
    const response = await fetch(
      `http://127.0.0.1:${port}/platform/tenants?status=pending`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    const body = await response.json();

    assert.equal(response.status, 200);
    assert.equal(body.data.tenants.length, 0);
    assert.equal(body.data.pagination.totalRecords, 0);
    assert.equal(body.data.pagination.totalPages, 0);

    assertNoSensitiveFields(body);
  } finally {
    await closeServer(server);
  }
});

test("platform tenant list and detail return isolated usage statistics", async () => {
  const [tenantA, tenantB] = await TenantModel.create([
    { name: "Stats A", slug: "stats-a", status: "active", plan: "pro" },
    { name: "Stats B", slug: "stats-b", status: "active", plan: "free" },
    {
      name: "Stats Empty",
      slug: "stats-empty",
      status: "active",
      plan: "free",
    },
  ]);
  const passwordHash = await hashPassword(TEST_PASSWORD);
  const users = await UserModel.create([
    {
      tenantId: tenantA.id,
      name: "A One",
      email: "a1@example.com",
      passwordHash,
      role: "EMPLOYEE",
      status: "active",
      emailVerified: true,
    },
    {
      tenantId: tenantA.id,
      name: "A Two",
      email: "a2@example.com",
      passwordHash,
      role: "EMPLOYEE",
      status: "active",
      emailVerified: true,
    },
    {
      tenantId: tenantB.id,
      name: "B One",
      email: "b1@example.com",
      passwordHash,
      role: "EMPLOYEE",
      status: "active",
      emailVerified: true,
    },
  ]);
  await DocumentModel.create([
    {
      tenantId: tenantA.id,
      fileName: "a-1.pdf",
      fileSize: 1,
      mimeType: "application/pdf",
      storagePath: "a/1",
      status: "processed",
      metadata: {},
      uploadedBy: users[0].id,
    },
    {
      tenantId: tenantA.id,
      fileName: "a-2.pdf",
      fileSize: 1,
      mimeType: "application/pdf",
      storagePath: "a/2",
      status: "processed",
      metadata: {},
      uploadedBy: users[0].id,
    },
    {
      tenantId: tenantB.id,
      fileName: "b-1.pdf",
      fileSize: 1,
      mimeType: "application/pdf",
      storagePath: "b/1",
      status: "processed",
      metadata: {},
      uploadedBy: users[2].id,
    },
  ]);
  await UsageLogModel.create([
    { tenantId: tenantA.id, eventType: "QUESTION_ASKED", requestId: "a-q1" },
    { tenantId: tenantA.id, eventType: "QUESTION_ASKED", requestId: "a-q2" },
    {
      tenantId: tenantA.id,
      eventType: "ASSISTANT_RESPONSE",
      requestId: "a-answer",
    },
    { tenantId: tenantA.id, eventType: "SYSTEM_EVENT", requestId: "a-system" },
    { tenantId: tenantB.id, eventType: "QUESTION_ASKED", requestId: "b-q1" },
    {
      tenantId: tenantB.id,
      eventType: "ASSISTANT_RESPONSE",
      requestId: "b-answer",
    },
  ]);

  const token = await getSuperAdminAccessToken();
  const server = await createServer();
  try {
    const port = (server.address() as AddressInfo).port;
    const headers = { Authorization: `Bearer ${token}` };
    const listResponse = await fetch(
      `http://127.0.0.1:${port}/platform/tenants?pageSize=10`,
      { headers },
    );
    const listBody = await listResponse.json();
    assert.equal(listResponse.status, 200);
    const bySlug = new Map<string, TenantDTO>(
      listBody.data.tenants.map((tenant: TenantDTO) => [tenant.slug, tenant]),
    );
    assert.deepEqual(bySlug.get("stats-a")?.stats, {
      users: 2,
      documents: 2,
      questions: 2,
    });
    assert.deepEqual(bySlug.get("stats-b")?.stats, {
      users: 1,
      documents: 1,
      questions: 1,
    });
    assert.deepEqual(bySlug.get("stats-empty")?.stats, {
      users: 0,
      documents: 0,
      questions: 0,
    });

    const detailResponse = await fetch(
      `http://127.0.0.1:${port}/platform/tenants/${tenantA.id}`,
      { headers },
    );
    const detailBody = await detailResponse.json();
    assert.equal(detailResponse.status, 200);
    assert.deepEqual(detailBody.data.stats, {
      users: 2,
      documents: 2,
      questions: 2,
    });

    const pageResponse = await fetch(
      `http://127.0.0.1:${port}/platform/tenants?page=1&pageSize=1`,
      { headers },
    );
    const pageBody = await pageResponse.json();
    assert.equal(pageResponse.status, 200);
    assert.equal(pageBody.data.tenants.length, 1);
    assert.equal(typeof pageBody.data.tenants[0].stats.questions, "number");
    assert.equal(pageBody.data.pagination.totalRecords, 3);
  } finally {
    await closeServer(server);
  }
});

test("GET /platform/tenants/:id validates missing and invalid IDs", async () => {
  const token = await getSuperAdminAccessToken();
  const server = await createServer();
  try {
    const port = (server.address() as AddressInfo).port;
    const headers = { Authorization: `Bearer ${token}` };
    const invalid = await fetch(
      `http://127.0.0.1:${port}/platform/tenants/not-an-id`,
      { headers },
    );
    assert.equal(invalid.status, 400);
    const missing = await fetch(
      `http://127.0.0.1:${port}/platform/tenants/${new mongoose.Types.ObjectId()}`,
      { headers },
    );
    assert.equal(missing.status, 404);
  } finally {
    await closeServer(server);
  }
});

test("question usage recording permits absent request IDs and deduplicates retries", async () => {
  const tenant = await TenantModel.create({
    name: "Usage",
    slug: "usage",
    status: "active",
    plan: "free",
  });
  await recordQuestionAsked({ tenantId: tenant.id });
  await recordQuestionAsked({ tenantId: tenant.id });
  await recordQuestionAsked({ tenantId: tenant.id, requestId: "request-1" });
  await recordQuestionAsked({ tenantId: tenant.id, requestId: "request-1" });
  assert.equal(
    await UsageLogModel.countDocuments({
      tenantId: tenant.id,
      eventType: "QUESTION_ASKED",
    }),
    3,
  );
  await assert.rejects(
    UsageLogModel.create({
      tenantId: tenant.id,
      eventType: "QUESTION_ASKED",
      requestId: "request-1",
    }),
    (error: unknown) =>
      Boolean(
        error &&
        typeof error === "object" &&
        "code" in error &&
        (error as { code: number }).code === 11000,
      ),
  );
});

test("Super Admin seed is idempotent, hashes credentials, and hides its system tenant", async () => {
  const input = {
    platformName: "DocuMind AI",
    platformSlug: "documind-ai",
    name: "Seed Admin",
    email: "seed@example.com",
    password: "SeedPassword123!",
  };
  await seedSuperAdmin(input);
  await seedSuperAdmin(input);
  assert.equal(await TenantModel.countDocuments({ slug: "documind-ai" }), 1);
  assert.equal(await UserModel.countDocuments({ role: "SUPER_ADMIN" }), 1);
  const user = await UserModel.findOne({ role: "SUPER_ADMIN" }).select(
    "+passwordHash",
  );
  assert.ok(user?.passwordHash);
  assert.notEqual(user.passwordHash, input.password);
  assert.equal(await verifyPassword(user.passwordHash, input.password), true);

  const tenant = await TenantModel.findOne({ slug: "documind-ai" });
  assert.ok(tenant);
  const token = signJwt(
    {
      sub: user.id,
      tenantId: tenant.id,
      role: "SUPER_ADMIN",
      email: user.email,
      type: "access",
    },
    config.JWT_SECRET,
    "1h",
  );
  const server = await createServer();
  try {
    const port = (server.address() as AddressInfo).port;
    const headers = {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    };
    const list = await fetch(`http://127.0.0.1:${port}/platform/tenants`, {
      headers,
    });
    assert.equal((await list.json()).data.tenants.length, 0);
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${port}/platform/tenants/${tenant.id}`, {
          headers,
        })
      ).status,
      404,
    );
    assert.equal(
      (
        await fetch(`http://127.0.0.1:${port}/platform/tenants/${tenant.id}`, {
          method: "PATCH",
          headers,
          body: JSON.stringify({ plan: "pro" }),
        })
      ).status,
      404,
    );
  } finally {
    await closeServer(server);
  }
});
