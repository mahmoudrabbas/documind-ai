import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";

process.env.NODE_ENV = "test";

import app from "../../app.js";
import { connectDB, disconnectDB } from "../../db/connection.js";
import { connectRedis, disconnectRedis } from "../../db/redis.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import RefreshTokenModel from "../../db/models/refreshToken.model.js";
import RoleModel from "../../db/models/role.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import EmailMessageModel from "../../db/models/emailMessage.model.js";
import { PLATFORM_TENANT_SLUG } from "../../common/auth/platformTenant.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { signJwt } from "../auth/jwtTokens.js";
import { config } from "../../config/index.js";
import { emailService } from "../email/email.service.js";
import type { TemplateIdType } from "../email/email-templates/templateRegistry.js";
import { buildDedupKey } from "workers/contracts";
import { randomUUID } from "node:crypto";
import {
  normalizeAndDedupeEmails,
  notifyCompanyLifecycleTransition,
  resolveActiveCompanyAdminEmails,
} from "./admin.lifecycleNotifications.js";

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

async function createTenant(options: {
  slug?: string;
  companyName?: string;
  status?: string;
  defaultLanguage?: "en" | "ar";
} = {}) {
  const tenant = await TenantModel.create({
    name: options.companyName ?? "Acme Consulting",
    slug: options.slug ?? "acme-consulting",
    status: options.status ?? "active",
    plan: "free",
    settings: {
      ...(options.defaultLanguage
        ? { defaultLanguage: options.defaultLanguage }
        : {}),
    },
  });
  return tenant;
}

async function createUser(options: {
  tenantId: string;
  email: string;
  role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE";
  status?: string;
  name?: string;
}) {
  return UserModel.create({
    tenantId: options.tenantId,
    name: options.name ?? "Test User",
    email: options.email,
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: options.role,
    status: options.status ?? "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
}

function createSuperAdminToken(): string {
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

function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

async function findEmails(
  tenantId: string,
  templateId: TemplateIdType,
): Promise<Array<Record<string, unknown>>> {
  return EmailMessageModel.find({ tenantId, templateId })
    .select("recipientEmail templateId language variables subject state idempotencyKey")
    .lean()
    .exec() as unknown as Promise<Array<Record<string, unknown>>>;
}

let platformTenantId = "";
let superAdminUserId = "";

before(async () => {
  await connectDB();
  await connectRedis();
  await EmailMessageModel.syncIndexes();
  await UserModel.syncIndexes();

  const platformTenant = await TenantModel.findOneAndUpdate(
    { slug: PLATFORM_TENANT_SLUG },
    {
      $set: {
        name: "DocuMind AI",
        status: "active",
        plan: "free",
        isSystemTenant: true,
      },
      $setOnInsert: { slug: PLATFORM_TENANT_SLUG },
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  ).lean();
  platformTenantId = platformTenant?._id?.toString() ?? "";

  const superAdmin = await UserModel.findOneAndUpdate(
    { email: "superadmin@documind.ai", tenantId: platformTenantId },
    {
      $set: {
        name: "Platform Admin",
        role: "SUPER_ADMIN",
        status: "active",
        emailVerified: true,
        emailVerifiedAt: new Date(),
        passwordHash: await hashPassword(TEST_PASSWORD),
      },
      $setOnInsert: {
        tenantId: platformTenantId,
        email: "superadmin@documind.ai",
      },
    },
    { upsert: true, returnDocument: "after", runValidators: true },
  ).lean();
  superAdminUserId = superAdmin?._id?.toString() ?? "";
});

beforeEach(async () => {
  await RefreshTokenModel.deleteMany({});
  await AuditLogModel.deleteMany({});
  await TenantModel.deleteMany({ slug: { $ne: PLATFORM_TENANT_SLUG } });
  await UserModel.deleteMany({
    tenantId: { $ne: platformTenantId },
  });
  await RoleModel.deleteMany({});
  await SubscriptionModel.deleteMany({});
  await EmailMessageModel.deleteMany({});
});

after(async () => {
  await disconnectRedis();
  await disconnectDB();
});

test("company lifecycle email notifications", async (t) => {
  await t.test("recipients are ACTIVE COMPANY_ADMIN users of the affected tenant only", async () => {
    const tenant = await createTenant();
    const otherTenant = await createTenant({
      slug: "other-corp",
      companyName: "Other Corp",
    });

    await createUser({
      tenantId: tenant._id.toString(),
      email: "admin@acme.com",
      role: "COMPANY_ADMIN",
    });
    await createUser({
      tenantId: tenant._id.toString(),
      email: "admin2@acme.com",
      role: "COMPANY_ADMIN",
      status: "disabled",
    });
    await createUser({
      tenantId: tenant._id.toString(),
      email: "employee@acme.com",
      role: "EMPLOYEE",
    });
    await createUser({
      tenantId: otherTenant._id.toString(),
      email: "admin@other.com",
      role: "COMPANY_ADMIN",
    });

    const recipients = await resolveActiveCompanyAdminEmails(
      tenant._id.toString(),
    );
    assert.deepEqual(recipients, ["admin@acme.com"]);
  });

  await t.test("recipients collapse duplicate emails and normalize casing", async () => {
    assert.deepEqual(
      normalizeAndDedupeEmails([
        " Admin@Acme.com ",
        "admin@acme.com",
        "ADMIN@acme.com",
        "",
        "  ",
        "employee@acme.com",
      ]),
      ["admin@acme.com", "employee@acme.com"],
    );
  });

  await t.test("suspension enqueues one email per active admin with lifecycle wording", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const tenant = await createTenant({
        companyName: "Test Corp",
        defaultLanguage: "en",
      });
      await createUser({
        tenantId: tenant._id.toString(),
        email: "sarah@testcorp.com",
        role: "COMPANY_ADMIN",
      });
      await createUser({
        tenantId: tenant._id.toString(),
        email: "john@testcorp.com",
        role: "COMPANY_ADMIN",
      });

      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant._id.toString()}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Policy violation investigation" }),
        },
      );
      assert.equal(res.status, 200);

      const emails = await findEmails(
        tenant._id.toString(),
        "company_suspended",
      );
      assert.equal(emails.length, 2);
      const recipients = emails
        .map((email) => email.recipientEmail)
        .sort();
      assert.deepEqual(recipients, [
        "john@testcorp.com",
        "sarah@testcorp.com",
      ]);

      const message = emails[0] as Record<string, unknown>;
      assert.ok(String(message.subject).includes("has been suspended"));
      const variables = message.variables as Record<string, unknown>;
      assert.deepEqual(Object.keys(variables).sort(), [
        "companyName",
        "effectiveDate",
        "reason",
      ]);
      assert.equal(variables.companyName, "Test Corp");
      assert.equal(variables.reason, "Policy violation investigation");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("suspension does not email employees, inactive admins, or other tenants", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const tenant = await createTenant();
      await createUser({
        tenantId: tenant._id.toString(),
        email: "admin@acme.com",
        role: "COMPANY_ADMIN",
      });
      await createUser({
        tenantId: tenant._id.toString(),
        email: "inactive-admin@acme.com",
        role: "COMPANY_ADMIN",
        status: "disabled",
      });
      await createUser({
        tenantId: tenant._id.toString(),
        email: "employee@acme.com",
        role: "EMPLOYEE",
      });

      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant._id.toString()}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Compliance review" }),
        },
      );
      assert.equal(res.status, 200);

      const emails = await findEmails(
        tenant._id.toString(),
        "company_suspended",
      );
      assert.equal(emails.length, 1);
      assert.equal(emails[0]?.recipientEmail, "admin@acme.com");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("reactivation enqueues one reactivation email per active admin", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const tenant = await createTenant({ status: "suspended" });
      await createUser({
        tenantId: tenant._id.toString(),
        email: "admin@acme.com",
        role: "COMPANY_ADMIN",
      });

      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant._id.toString()}/reinstate`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Issue resolved" }),
        },
      );
      assert.equal(res.status, 200);

      const emails = await findEmails(
        tenant._id.toString(),
        "company_reactivated",
      );
      assert.equal(emails.length, 1);
      assert.equal(emails[0]?.recipientEmail, "admin@acme.com");
      const message = emails[0] as Record<string, unknown>;
      assert.ok(String(message.subject).includes("has been reactivated"));
      const reactivatedKey = String(message.idempotencyKey);
      assert.ok(
        !reactivatedKey.includes(":"),
        `reactivated key must be BullMQ-safe, got "${reactivatedKey}"`,
      );
      assert.ok(reactivatedKey.startsWith("company-lifecycle__reactivated__"));
    } finally {
      await closeServer(server);
    }
  });

  await t.test("already-suspended request does not produce a duplicate suspension email", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const tenant = await createTenant();
      await createUser({
        tenantId: tenant._id.toString(),
        email: "admin@acme.com",
        role: "COMPANY_ADMIN",
      });

      const first = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant._id.toString()}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "First suspension" }),
        },
      );
      assert.equal(first.status, 200);

      const second = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant._id.toString()}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Second attempt" }),
        },
      );
      assert.equal(second.status, 200);
      const body = (await second.json()) as {
        data: { alreadyInTargetState: boolean };
      };
      assert.equal(body.data.alreadyInTargetState, true);

      const emails = await findEmails(
        tenant._id.toString(),
        "company_suspended",
      );
      assert.equal(emails.length, 1);
      assert.equal(emails[0]?.recipientEmail, "admin@acme.com");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("email enqueue failure does not fail the completed suspension", async (inner) => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const tenant = await createTenant();
      await createUser({
        tenantId: tenant._id.toString(),
        email: "admin@acme.com",
        role: "COMPANY_ADMIN",
      });

      inner.mock.method(emailService, "enqueue", async () => {
        throw new Error("SMTP provider unavailable");
      });

      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant._id.toString()}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Suspension with failing mail" }),
        },
      );
      assert.equal(res.status, 200);

      const persisted = await TenantModel.findById(tenant._id).lean();
      assert.equal(persisted?.status, "suspended");

      const auditLogs = await AuditLogModel.find({
        resourceId: tenant._id.toString(),
        action: "TENANT_SUSPENDED",
      }).lean();
      assert.equal(auditLogs.length, 1);

      const emails = await findEmails(
        tenant._id.toString(),
        "company_suspended",
      );
      assert.equal(emails.length, 0);
    } finally {
      await closeServer(server);
    }
  });

  await t.test("lifecycle idempotency keys and queue job ids are BullMQ-safe and deterministic", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const tenant = await createTenant();
      await createUser({
        tenantId: tenant._id.toString(),
        email: "admin@acme.com",
        role: "COMPANY_ADMIN",
      });

      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant._id.toString()}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "BullMQ-safe idempotency" }),
        },
      );
      assert.equal(res.status, 200);

      const emails = await findEmails(
        tenant._id.toString(),
        "company_suspended",
      );
      assert.equal(emails.length, 1);
      const message = emails[0] as Record<string, unknown>;
      const idempotencyKey = String(message.idempotencyKey);

      // BullMQ rejects custom job ids containing ':', and the lifecycle key
      // flows directly into the queue jobId via buildDedupKey.
      assert.ok(
        !idempotencyKey.includes(":"),
        `idempotencyKey must not contain ':', got "${idempotencyKey}"`,
      );
      const jobId = buildDedupKey("email.send", idempotencyKey);
      assert.ok(
        !jobId.includes(":"),
        `derived queue jobId must not contain ':', got "${jobId}"`,
      );

      // Deterministic correlation: the key embeds transition, tenant, and the
      // transition event id, so the same transition + recipient is stable.
      assert.ok(idempotencyKey.startsWith("company-lifecycle__suspended__"));
      assert.ok(idempotencyKey.includes(tenant._id.toString()));

      // state QUEUED proves the queue accepted the custom jobId — a rejected
      // jobId leaves the message stuck in PENDING and enqueue() would throw.
      assert.equal(message.state, "QUEUED");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("notification summary enqueues exactly one email for a single eligible admin", async () => {
    const tenant = await createTenant();
    await createUser({
      tenantId: tenant._id.toString(),
      email: "admin@acme.com",
      role: "COMPANY_ADMIN",
    });

    const summary = await notifyCompanyLifecycleTransition({
      tenantId: tenant._id.toString(),
      companyName: tenant.name,
      transition: "suspended",
      eventId: randomUUID(),
      reason: "Policy review",
    });
    assert.deepEqual(summary, {
      transition: "suspended",
      recipients: 1,
      enqueued: 1,
      failed: 0,
    });
  });

  await t.test("lifecycle email payload exposes no internal ids or secrets", async () => {
    const tenant = await createTenant({ companyName: "Acme Corp" });
    await createUser({
      tenantId: tenant._id.toString(),
      email: "admin@acme.com",
      role: "COMPANY_ADMIN",
    });

    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant._id.toString()}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Investigation" }),
        },
      );
      assert.equal(res.status, 200);

      const emails = await findEmails(
        tenant._id.toString(),
        "company_suspended",
      );
      assert.equal(emails.length, 1);
      const message = emails[0] as Record<string, unknown>;
      const variables = message.variables as Record<string, unknown>;
      const allowedKeys = new Set(["companyName", "reason", "effectiveDate"]);
      for (const key of Object.keys(variables)) {
        assert.ok(
          allowedKeys.has(key),
          `unexpected variable "${key}" leaked into email payload`,
        );
      }
      const serialized = JSON.stringify(variables).toLowerCase();
      assert.ok(!serialized.includes("password"));
      assert.ok(!serialized.includes("secret"));
      assert.ok(!serialized.includes("token"));
      assert.ok(!serialized.includes(tenant._id.toString()));
    } finally {
      await closeServer(server);
    }
  });

  await t.test("audit metadata records the transition id used for notification", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const tenant = await createTenant();
      await createUser({
        tenantId: tenant._id.toString(),
        email: "admin@acme.com",
        role: "COMPANY_ADMIN",
      });

      await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant._id.toString()}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Audit transition id" }),
        },
      );

      const auditLogs = await AuditLogModel.find({
        resourceId: tenant._id.toString(),
        action: "TENANT_SUSPENDED",
      }).lean();
      assert.equal(auditLogs.length, 1);
      const metadata = (auditLogs[0].metadata ?? {}) as Record<string, unknown>;
      assert.equal(typeof metadata.transitionId, "string");

      const emails = await findEmails(
        tenant._id.toString(),
        "company_suspended",
      );
      assert.equal(emails.length, 1);
      const idempotencyKey = String(emails[0]?.idempotencyKey);
      assert.ok(idempotencyKey.includes(metadata.transitionId as string));
      assert.ok(
        !idempotencyKey.includes(":"),
        `idempotencyKey must not contain ':', got "${idempotencyKey}"`,
      );
    } finally {
      await closeServer(server);
    }
  });
});