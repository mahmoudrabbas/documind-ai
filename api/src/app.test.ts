import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import mongoose from "mongoose";

process.env.NODE_ENV = "test";

import app from "./app.js";
import { connectDB } from "./db/connection.js";
import TenantModel from "./db/models/tenant.model.js";
import UserModel from "./db/models/user.model.js";
import { createEmailVerificationTokenForUser } from "./modules/auth/auth.service.js";
import { buildEmailVerificationTemplate } from "./modules/auth/auth.mailer.js";

function createServer() {
  return new Promise<ReturnType<typeof app.listen>>((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
}

function closeServer(server: ReturnType<typeof app.listen>) {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

type RegisterValidationErrorBody = {
  success: false;
  message: string;
  error: string;
  details: Array<{ field: string; message: string }> | null;
};

function assertNoDuplicateDetailFields(details: Array<{ field: string; message: string }> | null) {
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
      assert.equal(sensitiveFields.has(key), false, `response exposed sensitive field ${key}`);
      inspect(nestedValue);
    }
  }

  inspect(value);
}

before(async () => {
  await connectDB();
});

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
});

after(async () => {
  await mongoose.disconnect();
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
  assert.match(template.text, /Please verify your DocuMind AI account for Acme Consulting\./);
  assert.ok(template.text.includes(verificationUrl));
  assert.ok(template.html.includes(`<a href="${verificationUrl}"`));
  assert.ok(template.html.includes(">Verify Email</a>"));
  assert.match(template.html, /Sarah Ahmed/);
  assert.match(template.html, /Acme Consulting/);

  for (const secret of ["passwordHash", "SMTP_PASS", "refreshTokens", "internalSecret"]) {
    assert.equal(template.html.includes(secret), false);
  }
});

test("registers a tenant and first company admin", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/auth/register`, {
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
    });
    const body = (await response.json()) as {
      success: boolean;
      message: string;
      data: {
        tenant: { id: string; name: string; slug: string; status: string; plan: string; createdAt: string };
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
      "Tenant and company admin created successfully. Please verify your email to activate the account."
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

    const tenant = await TenantModel.findById(body.data.tenant.id).lean().exec();
    const user = await UserModel.findById(body.data.user.id).lean().exec();

    assert.equal(tenant?.status, "pending_verification");
    assert.equal(user?.status, "pending_email_verification");
    assert.equal(user?.emailVerified, false);
    assert.equal(user?.emailVerifiedAt, null);
  } finally {
    await closeServer(server);
  }
});

test("verifies email with a valid token and activates user and tenant", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const registerResponse = await fetch(`http://127.0.0.1:${address.port}/auth/register`, {
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
    });

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
      const verifyResponse = await fetch(`http://127.0.0.1:${address.port}/auth/verify-email`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ token }),
      });
      const body = (await verifyResponse.json()) as {
        success: boolean;
        message: string;
        data: {
          user: { id: string; tenantId: string; status: string; emailVerified: boolean };
          tenant: { id: string; status: string };
        };
      };

    assert.equal(verifyResponse.status, 200);
    assert.equal(body.success, true);
    assert.equal(body.message, "Email verified successfully. You can now sign in.");
    assert.equal(body.data.user.status, "active");
    assert.equal(body.data.user.emailVerified, true);
    assert.equal(body.data.tenant.status, "active");
    assertNoSensitiveFields(body);

    const verifiedUser = await UserModel.findById(user.id)
      .select("+emailVerificationTokenHash +emailVerificationExpiresAt")
      .lean()
      .exec();
    const activatedTenant = await TenantModel.findById(user.tenantId).lean().exec();

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

test("rejects invalid email verification tokens", async () => {
  const server = await createServer();

  try {
    const address = server.address() as AddressInfo;
    const response = await fetch(`http://127.0.0.1:${address.port}/auth/verify-email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ token: "not-a-jwt" }),
    });
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

    const token = await createEmailVerificationTokenForUser(user, { expiresIn: "0s" });
    const response = await fetch(`http://127.0.0.1:${address.port}/auth/verify-email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ token }),
    });
    const body = (await response.json()) as { success: false; message: string; error: string };

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

    const token = await createEmailVerificationTokenForUser(user, { purpose: "password_reset" });
    const response = await fetch(`http://127.0.0.1:${address.port}/auth/verify-email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ token }),
    });
    const body = (await response.json()) as { success: false; message: string; error: string };

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

    const knownResponse = await fetch(`http://127.0.0.1:${address.port}/auth/resend-verification-email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "sarah@acme.com" }),
    });
    const unknownResponse = await fetch(`http://127.0.0.1:${address.port}/auth/resend-verification-email`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify({ email: "missing@example.com" }),
    });
    const knownBody = await knownResponse.json();
    const unknownBody = await unknownResponse.json();

    assert.equal(knownResponse.status, 200);
    assert.equal(unknownResponse.status, 200);
    assert.deepEqual(knownBody, {
      success: true,
      message: "If the email exists and is not verified, a verification email has been sent",
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
    const response = await fetch(`http://127.0.0.1:${address.port}/auth/register`, {
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
    });
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
    const response = await fetch(`http://127.0.0.1:${address.port}/auth/register`, {
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
    });
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
    const response = await fetch(`http://127.0.0.1:${address.port}/auth/register`, {
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
    });
    const body = (await response.json()) as RegisterValidationErrorBody;

    assert.equal(response.status, 400);
    assert.equal(body.success, false);
    assert.equal(body.message, "Validation failed");
    assert.equal(body.error, "VALIDATION_ERROR");
    assert.deepEqual(body.details, [
      {
        field: "password",
        message: "password must be at least 8 characters and contain at least one letter and one number",
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
    const response = await fetch(`http://127.0.0.1:${address.port}/auth/register`, {
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
    });
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
        message: "password must be at least 8 characters and contain at least one letter and one number",
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

    const first = await fetch(`http://127.0.0.1:${address.port}/auth/register`, {
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
    });

    const second = await fetch(`http://127.0.0.1:${address.port}/auth/register`, {
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
    });

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
    assert.notEqual(firstBody.data.user.tenantId, secondBody.data.user.tenantId);

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
    const response = await fetch(`http://127.0.0.1:${address.port}/auth/register`, {
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
    });
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
    const first = await fetch(`http://127.0.0.1:${address.port}/auth/register`, {
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
    });
    const second = await fetch(`http://127.0.0.1:${address.port}/auth/register`, {
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
    });

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
    const response = await fetch(`http://127.0.0.1:${address.port}/does-not-exist`);
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
