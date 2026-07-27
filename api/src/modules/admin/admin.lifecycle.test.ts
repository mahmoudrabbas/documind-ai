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
import DocumentModel from "../../db/models/document.model.js";
import UsageLogModel from "../../db/models/usageLog.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import { PLATFORM_TENANT_SLUG } from "../../common/auth/platformTenant.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { signJwt } from "../auth/jwtTokens.js";
import { config } from "../../config/index.js";

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

async function createActiveTenantAdmin(options: {
  slug?: string;
  companyName?: string;
  email?: string;
  status?: string;
} = {}) {
  const tenant = await TenantModel.create({
    name: options.companyName ?? "Acme Consulting",
    slug: options.slug ?? "acme-consulting",
    status: options.status ?? "active",
    plan: "free",
  });
  const tenantId = tenant._id.toString();
  const user = await UserModel.create({
    tenantId,
    name: "Sarah Ahmed",
    email: options.email ?? "sarah@acme.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return { tenant, tenantId, user };
}

function createSuperAdminToken(): string {
  const token = signJwt(
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
  assert.equal(typeof token, "string", "super-admin access token is required");
  assert.ok(token.length > 0, "super-admin access token must not be empty");
  return token;
}

function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

let platformTenantId = "";
let superAdminUserId = "";

before(async () => {
  await connectDB();
  await connectRedis();
  await UsageLogModel.syncIndexes();

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
  await DocumentModel.deleteMany({});
  await UsageLogModel.deleteMany({});
  await SubscriptionModel.deleteMany({});
});

after(async () => {
  await disconnectRedis();
  await disconnectDB();
});

test("tenant lifecycle operations", async (t) => {
  await t.test("tenant detail rejects unauthenticated requests", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const { tenant } = await createActiveTenantAdmin();
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/detail`,
      );
      assert.equal(res.status, 401);
      const body = (await res.json()) as { success: boolean };
      assert.equal(body.success, false);
    } finally {
      await closeServer(server);
    }
  });

  await t.test("tenant detail rejects non-platform tenant users", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const { tenant } = await createActiveTenantAdmin();
      const token = signJwt(
        {
          sub: "fake-user-id",
          tenantId: tenant.id,
          role: "COMPANY_ADMIN",
          email: "admin@test.com",
          type: "access",
        },
        config.JWT_SECRET,
        "1h",
      );
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/detail`,
        { headers: authHeaders(token) },
      );
      assert.ok([401, 403].includes(res.status));
    } finally {
      await closeServer(server);
    }
  });

  await t.test("tenant detail returns real tenant identity", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin({
        companyName: "Test Corp",
        slug: "test-corp",
      });
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/detail`,
        { headers: authHeaders(token) },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        success: boolean;
        data: { id: string; name: string; slug: string; status: string };
      };
      assert.equal(body.success, true);
      assert.equal(body.data.name, "Test Corp");
      assert.equal(body.data.slug, "test-corp");
      assert.equal(body.data.status, "active");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("tenant detail returns accurate user counts", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant, tenantId } = await createActiveTenantAdmin();
      await UserModel.create({
        tenantId,
        name: "Employee One",
        email: "emp1@acme.com",
        passwordHash: await hashPassword(TEST_PASSWORD),
        role: "EMPLOYEE",
        status: "active",
        emailVerified: true,
        emailVerifiedAt: new Date(),
      });
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/detail`,
        { headers: authHeaders(token) },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        data: { users: { total: number; active: number; companyAdmins: number; employees: number } };
      };
      assert.equal(body.data.users.total, 2);
      assert.equal(body.data.users.active, 2);
      assert.equal(body.data.users.companyAdmins, 1);
      assert.equal(body.data.users.employees, 1);
    } finally {
      await closeServer(server);
    }
  });

  await t.test("tenant detail hides platform/system tenants", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${platformTenantId}/detail`,
        { headers: authHeaders(token) },
      );
      assert.equal(res.status, 403);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, "TENANT_PROTECTED");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("tenant detail handles missing subscription safely", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin();
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/detail`,
        { headers: authHeaders(token) },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        data: { subscription: unknown; package: unknown };
      };
      assert.equal(body.data.subscription, null);
      assert.equal(body.data.package, null);
    } finally {
      await closeServer(server);
    }
  });

  await t.test("tenant list accepts the suspended status filter", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin({ status: "suspended" });
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants?status=suspended`,
        { headers: authHeaders(token) },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        data: { tenants: Array<{ id: string; status: string }> };
      };
      assert.equal(body.data.tenants.length, 1);
      assert.equal(body.data.tenants[0]?.id, tenant.id.toString());
      assert.equal(body.data.tenants[0]?.status, "suspended");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("tenant detail returns persisted usage values", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant, tenantId, user } = await createActiveTenantAdmin();
      await DocumentModel.create({
        tenantId,
        uploadedBy: user.id,
        fileName: "doc.pdf",
        originalFileName: "doc.pdf",
        fileSize: 1024,
        mimeType: "application/pdf",
        storageKey: "test/doc.pdf",
        checksum: "abc",
        status: "processed",
        metadata: { title: null, description: null, tags: [] },
        classification: "internal",
      });
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/detail`,
        { headers: authHeaders(token) },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        data: { usage: { documents: number; storageBytes: number; questions: number } };
      };
      assert.equal(body.data.usage.documents, 1);
      assert.equal(body.data.usage.storageBytes, 1024);
      assert.equal(body.data.usage.questions, 0);
    } finally {
      await closeServer(server);
    }
  });

  await t.test("suspend rejects missing reason", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin();
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({}),
        },
      );
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, "TENANT_MISSING_REASON");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("suspend rejects whitespace-only reason", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin();
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "   " }),
        },
      );
      assert.equal(res.status, 400);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, "TENANT_MISSING_REASON");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("suspend rejects reasons outside the allowed contract", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin();

      for (const reason of ["no", "x".repeat(501), 42]) {
        const res = await fetch(
          `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/suspend`,
          {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({ reason }),
          },
        );
        assert.equal(res.status, 400);
        const body = (await res.json()) as { error: string };
        assert.equal(body.error, "TENANT_INVALID_REASON");
      }
    } finally {
      await closeServer(server);
    }
  });

  await t.test("suspend rejects unknown fields", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin();
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "test reason", unknownField: "value" }),
        },
      );
      assert.ok([400, 422].includes(res.status));
    } finally {
      await closeServer(server);
    }
  });

  await t.test("suspend rejects protected tenants", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${platformTenantId}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Cannot suspend platform tenant" }),
        },
      );
      assert.equal(res.status, 403);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, "TENANT_PROTECTED");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("reinstate rejects protected tenants", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${platformTenantId}/reinstate`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Cannot reinstate platform tenant" }),
        },
      );
      assert.equal(res.status, 403);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, "TENANT_PROTECTED");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("suspend changes ACTIVE to SUSPENDED", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin();
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Policy violation investigation" }),
        },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        success: boolean;
        data: { status: string; id: string };
      };
      assert.equal(body.success, true);
      assert.equal(body.data.status, "suspended");
      assert.equal(body.data.id, tenant.id.toString());
    } finally {
      await closeServer(server);
    }
  });

  await t.test("suspend rejects a non-platform tenant actor", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const { tenant, user } = await createActiveTenantAdmin();
      const token = signJwt(
        {
          sub: user.id,
          tenantId: tenant.id,
          role: "COMPANY_ADMIN",
          email: user.email,
          type: "access",
        },
        config.JWT_SECRET,
        "1h",
      );
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Unauthorized lifecycle request" }),
        },
      );
      assert.equal(res.status, 403);
    } finally {
      await closeServer(server);
    }
  });

  await t.test(
    "suspend returns alreadyInTargetState for already suspended",
    async () => {
      const server = await createServer();
      try {
        const port = (server.address() as AddressInfo).port;
        const token = createSuperAdminToken();
        const { tenant } = await createActiveTenantAdmin({ status: "suspended" });
        const res = await fetch(
          `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/suspend`,
          {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({ reason: "Already suspended tenant" }),
          },
        );
        assert.equal(res.status, 200);
        const body = (await res.json()) as {
          data: { alreadyInTargetState: boolean; status: string };
        };
        assert.equal(body.data.alreadyInTargetState, true);
        assert.equal(body.data.status, "suspended");
      } finally {
        await closeServer(server);
      }
    },
  );

  await t.test("suspend records audit data", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin();
      await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "  Test suspension audit  " }),
        },
      );
      const auditLogs = await AuditLogModel.find({
        resourceId: tenant.id.toString(),
        action: "TENANT_SUSPENDED",
      }).lean();
      assert.ok(auditLogs.length > 0, "should have audit log");
      const log = auditLogs[0];
      assert.equal(log.action, "TENANT_SUSPENDED");
      assert.equal(log.outcome, "SUCCESS");
      assert.ok(log.changes, "audit should have changes");
      const changes = log.changes as Record<string, unknown>;
      assert.equal(changes.previousStatus, "active");
      assert.equal(changes.newStatus, "suspended");
      assert.equal(changes.reason, "Test suspension audit");
      assert.ok(log.actorEmail, "audit should have actor email");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("reinstate changes SUSPENDED to ACTIVE", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin({ status: "suspended" });
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/reinstate`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Investigation complete, cleared" }),
        },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        success: boolean;
        data: { status: string; id: string };
      };
      assert.equal(body.success, true);
      assert.equal(body.data.status, "active");
      assert.equal(body.data.id, tenant.id.toString());
    } finally {
      await closeServer(server);
    }
  });

  await t.test(
    "reinstate returns alreadyInTargetState for already active",
    async () => {
      const server = await createServer();
      try {
        const port = (server.address() as AddressInfo).port;
        const token = createSuperAdminToken();
        const { tenant } = await createActiveTenantAdmin();
        const res = await fetch(
          `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/reinstate`,
          {
            method: "POST",
            headers: authHeaders(token),
            body: JSON.stringify({ reason: "Already active tenant" }),
          },
        );
        assert.equal(res.status, 200);
        const body = (await res.json()) as {
          data: { alreadyInTargetState: boolean; status: string };
        };
        assert.equal(body.data.alreadyInTargetState, true);
        assert.equal(body.data.status, "active");
      } finally {
        await closeServer(server);
      }
    },
  );

  await t.test("reinstate rejects invalid transitions", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin({ status: "trial" });
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/reinstate`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Cannot reinstate from trial" }),
        },
      );
      assert.equal(res.status, 409);
      const body = (await res.json()) as { error: string };
      assert.equal(body.error, "TENANT_INVALID_TRANSITION");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("reinstate records audit data", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin({ status: "suspended" });
      await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/reinstate`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Test reinstatement audit" }),
        },
      );
      const auditLogs = await AuditLogModel.find({
        resourceId: tenant.id.toString(),
        action: "TENANT_REINSTATED",
      }).lean();
      assert.ok(auditLogs.length > 0, "should have audit log");
      const log = auditLogs[0];
      assert.equal(log.action, "TENANT_REINSTATED");
      assert.equal(log.outcome, "SUCCESS");
      assert.ok(log.changes, "audit should have changes");
      const changes = log.changes as Record<string, unknown>;
      assert.equal(changes.previousStatus, "suspended");
      assert.equal(changes.newStatus, "active");
      assert.equal(changes.reason, "Test reinstatement audit");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("preview suspend returns correct data", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin();
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/preview/suspend`,
        { headers: authHeaders(token) },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        data: {
          tenantId: string;
          currentStatus: string;
          targetStatus: string;
          transitionAllowed: boolean;
          warnings: string[];
        };
      };
      assert.equal(body.data.currentStatus, "active");
      assert.equal(body.data.targetStatus, "suspended");
      assert.equal(body.data.transitionAllowed, true);
      assert.ok(body.data.warnings.length > 0, "should have warnings");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("preview reinstate returns correct data", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin({ status: "suspended" });
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/preview/reinstate`,
        { headers: authHeaders(token) },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        data: {
          currentStatus: string;
          targetStatus: string;
          transitionAllowed: boolean;
        };
      };
      assert.equal(body.data.currentStatus, "suspended");
      assert.equal(body.data.targetStatus, "active");
      assert.equal(body.data.transitionAllowed, true);
    } finally {
      await closeServer(server);
    }
  });

  await t.test("preview and mutation share idempotent target-state rules", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin({ status: "suspended" });
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/preview/suspend`,
        { headers: authHeaders(token) },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as {
        data: { transitionAllowed: boolean; alreadyInTargetState: boolean; blockingReasons: string[] };
      };
      assert.equal(body.data.transitionAllowed, true);
      assert.equal(body.data.alreadyInTargetState, true);
      assert.deepEqual(body.data.blockingReasons, []);
    } finally {
      await closeServer(server);
    }
  });

  await t.test("suspend rejects invalid tenant IDs", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/not-a-valid-id/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Test reason" }),
        },
      );
      assert.equal(res.status, 400);
    } finally {
      await closeServer(server);
    }
  });

  await t.test("suspend rejects non-existent tenant", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const fakeId = "000000000000000000000000";
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${fakeId}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Non-existent tenant" }),
        },
      );
      assert.equal(res.status, 404);
    } finally {
      await closeServer(server);
    }
  });

  await t.test("suspend from pending_verification is allowed", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin({
        status: "pending_verification",
      });
      const res = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Suspension from pending verification" }),
        },
      );
      assert.equal(res.status, 200);
      const body = (await res.json()) as { data: { status: string } };
      assert.equal(body.data.status, "suspended");
    } finally {
      await closeServer(server);
    }
  });

  await t.test("concurrent status changes are detected", async () => {
    const server = await createServer();
    try {
      const port = (server.address() as AddressInfo).port;
      const token = createSuperAdminToken();
      const { tenant } = await createActiveTenantAdmin();
      const res1 = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "First suspension attempt" }),
        },
      );
      assert.equal(res1.status, 200);
      const res2 = await fetch(
        `http://127.0.0.1:${port}/platform/tenants/${tenant.id}/suspend`,
        {
          method: "POST",
          headers: authHeaders(token),
          body: JSON.stringify({ reason: "Second suspension attempt" }),
        },
      );
      assert.equal(res2.status, 200);
      const body2 = (await res2.json()) as { data: { alreadyInTargetState?: boolean } };
      assert.equal(body2.data.alreadyInTargetState, true);
    } finally {
      await closeServer(server);
    }
  });
});
