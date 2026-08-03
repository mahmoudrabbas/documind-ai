import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { randomUUID } from "node:crypto";
import mongoose from "mongoose";
import { Queue, Worker, QueueEvents, type Job } from "bullmq";

process.env.NODE_ENV = "test";

import app from "../../app.js";
import { connectDB, disconnectDB } from "../../db/connection.js";
import {
  connectRedis,
  disconnectRedis,
  getRedisClient,
} from "../../db/redis.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import RefreshTokenModel from "../../db/models/refreshToken.model.js";
import NotificationDlqModel from "../../db/models/notificationDlq.model.js";
import { PLATFORM_TENANT_SLUG } from "../../common/auth/platformTenant.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { signJwt } from "../auth/jwtTokens.js";
import { config } from "../../config/index.js";
import { JOBS_QUEUE_NAME } from "./jobDispatcher.js";
import { buildDedupKey } from "workers/contracts";

const TEST_PASSWORD = "StrongPass123!";

let platformTenantId = "";
let superAdminUserId = "";
let superAdminToken = "";

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

function authHeaders(token: string) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json",
  };
}

function makeDlqDoc(overrides: Record<string, unknown> = {}) {
  return {
    tenantId: new mongoose.Types.ObjectId(),
    jobId: `notification.dispatch__idem-${randomUUID()}`,
    notificationIds: [new mongoose.Types.ObjectId().toString()],
    notificationCount: 1,
    reason: "permanent transport failure",
    payloadHash: "a".repeat(64),
    failedAt: new Date(),
    replayedAt: null,
    ...overrides,
  };
}

interface DlqListItem {
  id: string;
  tenantId: string;
  jobId: string;
  notificationIds: string[];
  notificationCount: number;
  reason: string | null;
  payloadHash: string | null;
  failedAt: string | null;
  replayedAt: string | null;
  status: "pending" | "replayed";
}

interface DlqListBody {
  success: boolean;
  data: {
    items: DlqListItem[];
    pagination: {
      page: number;
      pageSize: number;
      totalPages: number;
      totalRecords: number;
    };
  };
}

before(async () => {
  await connectDB();
  await connectRedis();

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

  superAdminToken = signJwt(
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
});

beforeEach(async () => {
  await RefreshTokenModel.deleteMany({});
  await NotificationDlqModel.deleteMany({});
  await TenantModel.deleteMany({ slug: { $ne: PLATFORM_TENANT_SLUG } });
  await UserModel.deleteMany({ tenantId: { $ne: platformTenantId } });
});

after(async () => {
  await disconnectRedis();
  await disconnectDB();
});

test("GET /platform/jobs/notification-dlqs returns a paginated DLQ list to Super Admin", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as AddressInfo).port;
    const older = makeDlqDoc({ failedAt: new Date("2026-01-01T00:00:00Z") });
    const newer = makeDlqDoc({ failedAt: new Date("2026-02-01T00:00:00Z") });
    const replayed = makeDlqDoc({
      failedAt: new Date("2026-03-01T00:00:00Z"),
      replayedAt: new Date("2026-03-02T00:00:00Z"),
    });
    await NotificationDlqModel.create([older, newer, replayed]);

    const firstPage = (await fetch(
      `http://127.0.0.1:${port}/platform/jobs/notification-dlqs?page=1&pageSize=2`,
      { headers: authHeaders(superAdminToken) },
    ).then((r) => r.json())) as DlqListBody;
    assert.equal(firstPage.success, true);
    assert.deepEqual(firstPage.data.pagination, {
      page: 1,
      pageSize: 2,
      totalPages: 2,
      totalRecords: 3,
    });
    assert.equal(firstPage.data.items.length, 2);
    // Newest failedAt first.
    assert.equal(firstPage.data.items[0].jobId, replayed.jobId);
    assert.equal(firstPage.data.items[1].jobId, newer.jobId);

    const secondPage = (await fetch(
      `http://127.0.0.1:${port}/platform/jobs/notification-dlqs?page=2&pageSize=2`,
      { headers: authHeaders(superAdminToken) },
    ).then((r) => r.json())) as DlqListBody;
    assert.equal(secondPage.data.items.length, 1);
    assert.equal(secondPage.data.items[0].jobId, older.jobId);

    const item = secondPage.data.items[0];
    assert.equal(typeof item.id, "string");
    assert.equal(typeof item.tenantId, "string");
    assert.equal(item.notificationCount, 1);
    assert.ok(Array.isArray(item.notificationIds));
    assert.equal(item.reason, "permanent transport failure");
    assert.equal(item.payloadHash, "a".repeat(64));
    assert.equal(item.status, "pending");
    assert.match(item.failedAt ?? "", /^2026-01-01/);
    assert.equal(item.replayedAt, null);
  } finally {
    await closeServer(server);
  }
});

test("GET /platform/jobs/notification-dlqs supports the status filter", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as AddressInfo).port;
    await NotificationDlqModel.create([
      makeDlqDoc({ failedAt: new Date("2026-01-01T00:00:00Z") }),
      makeDlqDoc({ failedAt: new Date("2026-01-02T00:00:00Z") }),
      makeDlqDoc({
        failedAt: new Date("2026-01-03T00:00:00Z"),
        replayedAt: new Date("2026-01-04T00:00:00Z"),
      }),
    ]);

    const pending = (await fetch(
      `http://127.0.0.1:${port}/platform/jobs/notification-dlqs?status=pending`,
      { headers: authHeaders(superAdminToken) },
    ).then((r) => r.json())) as DlqListBody;
    assert.equal(pending.data.pagination.totalRecords, 2);
    assert.ok(
      pending.data.items.every((item) => item.status === "pending"),
    );

    const replayed = (await fetch(
      `http://127.0.0.1:${port}/platform/jobs/notification-dlqs?status=replayed`,
      { headers: authHeaders(superAdminToken) },
    ).then((r) => r.json())) as DlqListBody;
    assert.equal(replayed.data.pagination.totalRecords, 1);
    assert.ok(
      replayed.data.items.every((item) => item.status === "replayed"),
    );
  } finally {
    await closeServer(server);
  }
});

test("GET /platform/jobs/notification-dlqs rejects non-Super Admin and unauthenticated callers", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as AddressInfo).port;
    const tenant = await TenantModel.create({
      name: "Acme Consulting",
      slug: "acme-consulting",
      status: "active",
      plan: "free",
    });
    const companyAdmin = await UserModel.create({
      tenantId: tenant._id,
      name: "Sarah Ahmed",
      email: "sarah@acme.com",
      passwordHash: await hashPassword(TEST_PASSWORD),
      role: "COMPANY_ADMIN",
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    const companyAdminToken = signJwt(
      {
        sub: companyAdmin._id.toString(),
        tenantId: tenant._id.toString(),
        role: "COMPANY_ADMIN",
        email: "sarah@acme.com",
        type: "access",
      },
      config.JWT_SECRET,
      "1h",
    );

    const unauthenticated = await fetch(
      `http://127.0.0.1:${port}/platform/jobs/notification-dlqs`,
    );
    assert.equal(unauthenticated.status, 401);

    const denied = await fetch(
      `http://127.0.0.1:${port}/platform/jobs/notification-dlqs`,
      { headers: authHeaders(companyAdminToken) },
    );
    assert.equal(denied.status, 403);
    const deniedBody = (await denied.json()) as { success: boolean };
    assert.equal(deniedBody.success, false);
  } finally {
    await closeServer(server);
  }
});

test("GET /platform/jobs/notification-dlqs rejects invalid pagination and status params with 400", async () => {
  const server = await createServer();
  try {
    const port = (server.address() as AddressInfo).port;
    for (const query of [
      "page=0&pageSize=10",
      "page=1&pageSize=-1",
      "page=1&pageSize=0",
      "page=abc&pageSize=10",
      "page=1&pageSize=999",
      "page=1&pageSize=10&status=unknown",
    ]) {
      const response = await fetch(
        `http://127.0.0.1:${port}/platform/jobs/notification-dlqs?${query}`,
        { headers: authHeaders(superAdminToken) },
      );
      assert.equal(response.status, 400, `expected 400 for ?${query}`);
      const body = (await response.json()) as { success: boolean };
      assert.equal(body.success, false);
    }
  } finally {
    await closeServer(server);
  }
});

test("a DLQ'd job is replayed via the existing POST /platform/jobs/:jobId/replay route", async () => {
  const server = await createServer();
  const queue = new Queue(JOBS_QUEUE_NAME, {
    connection: getRedisClient() as never,
  });
  const queueEvents = new QueueEvents(JOBS_QUEUE_NAME, {
    connection: getRedisClient() as never,
  });
  const worker = new Worker(
    JOBS_QUEUE_NAME,
    async () => {
      throw new Error("permanent transport failure");
    },
    { connection: getRedisClient() as never },
  );
  let jobId = "";
  try {
    const idempotencyKey = `replay-verify-${randomUUID()}`;
    jobId = buildDedupKey("notification.dispatch", idempotencyKey);

    await queue.add(
      "notification.dispatch",
      {
        jobType: "notification.dispatch",
        schemaVersion: "1.0.0",
        tenantId: new mongoose.Types.ObjectId().toString(),
        idempotencyKey,
        payload: {
          notificationIds: [idempotencyKey],
          tenantId: platformTenantId,
        },
        createdAt: new Date().toISOString(),
      },
      { jobId, attempts: 1 },
    );
    const job = (await queue.getJob(jobId)) as Job;
    await assert.rejects(
      job.waitUntilFinished(queueEvents, 5000),
      /permanent transport failure/,
    );
    assert.equal(await job.getState(), "failed");
  } finally {
    // Stop the failing worker BEFORE replaying, so the replayed job is not
    // immediately re-processed and re-failed by this test's worker.
    await worker.close();
  }

  try {
    const port = (server.address() as AddressInfo).port;
    await NotificationDlqModel.create(
      makeDlqDoc({ jobId, reason: "permanent transport failure" }),
    );

    const response = await fetch(
      `http://127.0.0.1:${port}/platform/jobs/${jobId}/replay`,
      {
        method: "POST",
        headers: authHeaders(superAdminToken),
      },
    );
    assert.equal(response.status, 202);
    const body = (await response.json()) as {
      success: boolean;
      data: { replayed: string };
    };
    assert.equal(body.success, true);
    assert.equal(body.data.replayed, jobId);

    const replayedJob = (await queue.getJob(jobId)) as Job;
    assert.notEqual(await replayedJob.getState(), "failed");
  } finally {
    await queueEvents.close();
    await queue.close();
    await closeServer(server);
  }
});
