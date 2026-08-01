import { describe, expect, it } from "vitest";
import express, { type RequestHandler } from "express";
import { MemoryStore } from "express-rate-limit";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { InMemoryPermissionEvaluator } from "../../permissions/permissions.evaluator.fake.js";
import {
  PERMISSION_BY_ID,
  PERMISSION_CATALOG,
  Permission,
  validatePermissionCatalog,
} from "../../permissions/permissions.catalog.js";
import {
  InMemoryTokenBucketQuotaStore,
  PRODUCER_BURST,
  PRODUCER_RATE_PER_SEC,
  TEST_LIMIT_PER_MIN,
  ProducerQuotaExceededError,
  createProducerQuotaLimiter,
  createTestNotificationRateLimiter,
} from "../rateLimit.js";

function startServer(app: express.Express): Promise<Server> {
  return new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
}

function stopServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.closeAllConnections?.();
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

/** Express middleware that stamps a tenant onto req.auth from a header. */
function withTenantFromHeader(): RequestHandler {
  return (req, _res, next) => {
    const tenantId =
      (req.headers["x-tenant-id"] as string | undefined) ?? "unknown";
    req.auth = { userId: "test-user", tenantId, role: "SUPER_ADMIN" };
    next();
  };
}

describe("notification permission catalog (T8 4-place sync)", () => {
  it("NOTIFICATIONS_READ exists with exactly [EMPLOYEE, COMPANY_ADMIN]", () => {
    const definition = PERMISSION_BY_ID.get(Permission.NOTIFICATIONS_READ);
    expect(definition?.defaultBaseRoles).toContain("EMPLOYEE");
    expect(definition?.defaultBaseRoles).toContain("COMPANY_ADMIN");
    expect(definition?.defaultBaseRoles?.length).toBe(2);
    expect(definition?.defaultBaseRoles).not.toContain("MEMBER");
    expect(definition?.platformOnly).toBe(false);
  });

  it("NOTIFICATIONS_UPDATE exists with exactly [COMPANY_ADMIN]", () => {
    const definition = PERMISSION_BY_ID.get(Permission.NOTIFICATIONS_UPDATE);
    expect(definition?.defaultBaseRoles).toEqual(["COMPANY_ADMIN"]);
    expect(definition?.platformOnly).toBe(false);
  });

  it("NOTIFICATIONS_TEST is platformOnly and SUPER_ADMIN-only", () => {
    const definition = PERMISSION_BY_ID.get(Permission.NOTIFICATIONS_TEST);
    expect(definition?.defaultBaseRoles).toEqual(["SUPER_ADMIN"]);
    expect(definition?.platformOnly).toBe(true);
    expect(definition?.tenantGrantable).toBe(false);
    expect(definition?.allowedCustomRoleBases).toEqual([]);
  });

  it("catalog validator does NOT throw (Permission const + definitions + group union in sync)", () => {
    expect(() => validatePermissionCatalog(PERMISSION_CATALOG)).not.toThrow();
  });
});

describe("createTestNotificationRateLimiter (tenant-keyed)", () => {
  it("allows 10 per tenant, blocks the 11th, and keeps tenants isolated", async () => {
    const app = express();
    const limiter = createTestNotificationRateLimiter({
      store: new MemoryStore(),
    });
    app.post(
      "/notifications/test",
      withTenantFromHeader(),
      limiter,
      (_req, res) => {
        res.status(200).json({ success: true });
      },
    );
    const server = await startServer(app);
    try {
      const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/notifications/test`;
      const call = (tenantId: string) =>
        fetch(base, {
          method: "POST",
          headers: { "x-tenant-id": tenantId },
        });

      for (let i = 0; i < TEST_LIMIT_PER_MIN; i++) {
        const res = await call("tenant-a");
        expect(res.status).toBe(200);
      }

      const eleventh = await call("tenant-a");
      expect(eleventh.status).toBe(429);

      // tenant-b is unaffected: a full window of requests still succeeds
      for (let i = 0; i < TEST_LIMIT_PER_MIN; i++) {
        const res = await call("tenant-b");
        expect(res.status).toBe(200);
      }
    } finally {
      await stopServer(server);
    }
  });
});

describe("producer token bucket quota (assertProducerQuota)", () => {
  it("names the production constants explicitly", () => {
    expect(PRODUCER_RATE_PER_SEC).toBe(100);
    expect(PRODUCER_BURST).toBe(500);
  });

  it("allows 100 events and throws a quota error on the 101st", async () => {
    let nowMs = 1_000;
    const store = new InMemoryTokenBucketQuotaStore({
      ratePerSec: PRODUCER_RATE_PER_SEC,
      burst: PRODUCER_RATE_PER_SEC, // capacity of exactly 100 so the 101st exhausts the bucket
      now: () => nowMs,
    });
    const { assertProducerQuota } = createProducerQuotaLimiter({ store });

    for (let i = 0; i < PRODUCER_RATE_PER_SEC; i++) {
      await expect(assertProducerQuota("tenant-a")).resolves.toBeUndefined();
    }

    nowMs += 1;
    await expect(assertProducerQuota("tenant-a")).rejects.toBeInstanceOf(
      ProducerQuotaExceededError,
    );
  });

  it("isolates quota per tenant", async () => {
    const nowMs = 2_000;
    const store = new InMemoryTokenBucketQuotaStore({
      ratePerSec: PRODUCER_RATE_PER_SEC,
      burst: PRODUCER_RATE_PER_SEC,
      now: () => nowMs,
    });
    const { assertProducerQuota } = createProducerQuotaLimiter({ store });

    for (let i = 0; i < PRODUCER_RATE_PER_SEC; i++) {
      await assertProducerQuota("tenant-a");
    }
    await expect(assertProducerQuota("tenant-a")).rejects.toBeInstanceOf(
      ProducerQuotaExceededError,
    );
    await expect(assertProducerQuota("tenant-b")).resolves.toBeUndefined();
  });
});

describe("notification permission evaluation sanity", () => {
  it("grants NOTIFICATIONS_READ to EMPLOYEE and COMPANY_ADMIN base roles", async () => {
    const evaluator = new InMemoryPermissionEvaluator();
    evaluator.addUser("employee", "tenant-a", "EMPLOYEE");
    evaluator.addUser("admin", "tenant-a", "COMPANY_ADMIN");

    const employee = await evaluator.evaluate({
      actorId: "employee",
      tenantId: "tenant-a",
      baseRole: "EMPLOYEE",
      permission: Permission.NOTIFICATIONS_READ,
    });
    expect(employee.allowed).toBe(true);
    expect(employee.source).toBe("base-role");

    const admin = await evaluator.evaluate({
      actorId: "admin",
      tenantId: "tenant-a",
      baseRole: "COMPANY_ADMIN",
      permission: Permission.NOTIFICATIONS_READ,
    });
    expect(admin.allowed).toBe(true);
  });

  it("denies NOTIFICATIONS_READ to a non-employee actor with no grants", async () => {
    const evaluator = new InMemoryPermissionEvaluator();
    evaluator.addUser("disabled", "tenant-a", "EMPLOYEE", null, "disabled");
    const decision = await evaluator.evaluate({
      actorId: "disabled",
      tenantId: "tenant-a",
      baseRole: "EMPLOYEE",
      permission: Permission.NOTIFICATIONS_READ,
    });
    expect(decision.allowed).toBe(false);
    expect(decision.denialCode).toBe("PERMISSION_REQUIRED");
  });

  it("never grants the platform-only NOTIFICATIONS_TEST or the admin-only NOTIFICATIONS_UPDATE to an EMPLOYEE", async () => {
    const evaluator = new InMemoryPermissionEvaluator();
    evaluator.addUser("employee", "tenant-a", "EMPLOYEE");

    const update = await evaluator.evaluate({
      actorId: "employee",
      tenantId: "tenant-a",
      baseRole: "EMPLOYEE",
      permission: Permission.NOTIFICATIONS_UPDATE,
    });
    expect(update.allowed).toBe(false);
    expect(update.denialCode).toBe("PERMISSION_REQUIRED");

    const test = await evaluator.evaluate({
      actorId: "employee",
      tenantId: "tenant-a",
      baseRole: "EMPLOYEE",
      permission: Permission.NOTIFICATIONS_TEST,
    });
    expect(test.allowed).toBe(false);
    expect(test.denialCode).toBe("PERMISSION_REQUIRED");
  });
});
