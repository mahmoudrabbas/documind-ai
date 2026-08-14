/**
 * T7 — Notification REST API route acceptance (real app, MongoMemoryReplSet).
 *
 * Boots the REAL express app (app.ts) so the `/notifications` mount, auth,
 * tenant-scoping, permission middleware, rate limiter and error handler are all
 * exercised end-to-end. Authentication uses directly-signed JWTs (no login
 * round-trip); the real PermissionEvaluatorImpl resolves permissions from the
 * seeded UserModel/TenantModel rows.
 *
 * The harness runs this file under vitest (it imports from "vitest"); skip
 * gracefully when run without MONGODB_URI. Unique dbName isolates this suite
 * from other test files sharing the MongoMemoryReplSet.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from "vitest";
import mongoose from "mongoose";
import type { Express } from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import NotificationModel from "../../../db/models/notification.model.js";
import { config } from "../../../config/index.js";
import { signJwt } from "../../auth/jwtTokens.js";
import { PLATFORM_TENANT_SLUG } from "../../../common/auth/platformTenant.js";

const hasMongo = Boolean(process.env.MONGODB_URI);

describe.skipIf(!hasMongo)("Notification REST API (T7 routes)", () => {
  let app: Express;
  let server: Server;
  let port: number;
  let connectedByThisFile = false;

  // ── identities (ObjectIds must be valid for the permission evaluator) ──
  let tenantAId = "";
  let tenantBId = "";
  let adminAId = "";
  let employeeAId = "";
  let adminBId = "";
  let superAdminId = "";

  let adminAToken = "";
  let employeeAToken = "";
  let adminBToken = "";
  let superAdminToken = "";

  function tokenFor(userId: string, tenantId: string, role: string): string {
    return signJwt(
      {
        sub: userId,
        tenantId,
        type: "access",
        role,
        email: `${role.toLowerCase()}@example.com`,
      },
      config.JWT_SECRET,
      "15m",
    );
  }

  /** Direct model seed (schema defaults cover the rest) — mirrors service.test.ts. */
  async function seedNotification(
    tenantId: string,
    userId: string,
    overrides: Record<string, unknown> = {},
  ): Promise<string> {
    const doc = await NotificationModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      userId: new mongoose.Types.ObjectId(userId),
      dedupKey: `processing_failed:doc_123:seed-${overrides.dedupEventId ?? "doc_123"}`,
      dedupEventId: "doc_123",
      type: "processing_failed",
      category: "documents",
      priority: "normal",
      title: { en: "Processing failed", ar: "فشل المعالجة" },
      body: { en: "Your document could not be processed.", ar: "تعذرت معالجة مستندك." },
      lifecycleState: "CREATED",
      version: 1,
      deliveryStatus: "pending",
      deliveryAttempts: 0,
      isRead: false,
      isSeen: false,
      isArchived: false,
      collapsedCount: 0,
      ...overrides,
    });
    return doc._id.toString();
  }

  /**
   * Superset of the JSON bodies the notification API returns: success
   * envelopes ({ success, data, meta? }) from notifications.controller.ts and
   * error envelopes ({ success: false, error }) from errorHandler.middleware.ts.
   * Field access mirrors exactly what the assertions below read.
   */
  interface NotificationTestResponseBody {
    success: boolean;
    data: {
      items: Record<string, unknown>[];
      byPriority: { critical: number; high: number; normal: number; low: number };
      total?: number;
      count?: number;
      id?: string;
      type?: string;
      isArchived?: boolean;
      notificationId?: string;
      archived?: boolean;
      deleted?: boolean;
      matchedCount?: number;
    };
    meta?: { page: number; limit: number };
    error: {
      code: string;
      message: string;
      details?: unknown;
      path?: string;
      method?: string;
      requestId?: string;
      timestamp?: string;
      stack?: string;
    };
  }

  async function request(
    path: string,
    init: { method?: string; token?: string; body?: unknown } = {},
  ): Promise<{ status: number; body: NotificationTestResponseBody }> {
    const res = await fetch(`http://127.0.0.1:${port}${path}`, {
      method: init.method ?? "GET",
      headers: {
        "content-type": "application/json",
        ...(init.token ? { authorization: `Bearer ${init.token}` } : {}),
      },
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });
    return {
      status: res.status,
      body: (await res.json()) as NotificationTestResponseBody,
    };
  }

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI as string, {
        dbName: "notifications-routes-test",
      });
      connectedByThisFile = true;
    }
    await Promise.all([
      TenantModel.init(),
      UserModel.init(),
      NotificationModel.init(),
    ]);

    app = (await import("../../../app.js")).default;
    server = await new Promise<Server>((resolve) => {
      const srv = app.listen(0, () => resolve(srv));
    });
    port = (server.address() as AddressInfo).port;
  });

  afterAll(async () => {
    server?.closeAllConnections?.();
    await new Promise<void>((resolve) => server?.close(() => resolve()));
    if (connectedByThisFile) await mongoose.disconnect();
  });

  beforeEach(async () => {
    await Promise.all([
      TenantModel.deleteMany({}),
      UserModel.deleteMany({}),
      NotificationModel.deleteMany({}),
    ]);

    const tenantA = await TenantModel.create({
      name: "Tenant A",
      slug: "tenant-a",
      status: "active",
      plan: "free",
    });
    const tenantB = await TenantModel.create({
      name: "Tenant B",
      slug: "tenant-b",
      status: "active",
      plan: "free",
    });
    const platform = await TenantModel.create({
      name: "DocuMind Platform",
      slug: PLATFORM_TENANT_SLUG,
      status: "active",
      plan: "free",
      isSystemTenant: true,
    });
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;

    const adminA = await UserModel.create({
      tenantId: tenantA.id,
      name: "Admin A",
      email: "admin-a@example.com",
      passwordHash: "not-used",
      role: "COMPANY_ADMIN",
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    const employeeA = await UserModel.create({
      tenantId: tenantA.id,
      name: "Employee A",
      email: "employee-a@example.com",
      passwordHash: "not-used",
      role: "EMPLOYEE",
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    const adminB = await UserModel.create({
      tenantId: tenantB.id,
      name: "Admin B",
      email: "admin-b@example.com",
      passwordHash: "not-used",
      role: "COMPANY_ADMIN",
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    const superAdmin = await UserModel.create({
      tenantId: platform.id,
      name: "Super Admin",
      email: "super-admin@example.com",
      passwordHash: "not-used",
      role: "SUPER_ADMIN",
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    adminAId = adminA.id;
    employeeAId = employeeA.id;
    adminBId = adminB.id;
    superAdminId = superAdmin.id;

    adminAToken = tokenFor(adminAId, tenantAId, "COMPANY_ADMIN");
    employeeAToken = tokenFor(employeeAId, tenantAId, "EMPLOYEE");
    adminBToken = tokenFor(adminBId, tenantBId, "COMPANY_ADMIN");
    superAdminToken = tokenFor(superAdminId, platform.id, "SUPER_ADMIN");
  });

  it("GET /notifications returns the platform envelope with items/total/meta", async () => {
    const first = await seedNotification(tenantAId, adminAId);
    await seedNotification(tenantAId, adminAId, { dedupEventId: "doc_124" });

    const res = await request("/notifications", { token: adminAToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.items).toHaveLength(2);
    expect(res.body.data.total).toBe(2);
    expect(res.body.meta).toEqual({ page: 1, limit: 20 });
    const ids = res.body.data.items.map((n: Record<string, unknown>) => n.id);
    expect(ids).toContain(first);
  });

  it("GET /notifications/unread-count is NOT shadowed by /:id", async () => {
    await seedNotification(tenantAId, adminAId); // unread
    await seedNotification(tenantAId, adminAId, {
      dedupEventId: "doc_125",
      isRead: true,
      readAt: new Date(),
    });

    const res = await request("/notifications/unread-count", {
      token: adminAToken,
    });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.count).toBe(1);
    expect(res.body.data.byPriority.normal).toBe(1);
  });

  it("GET /notifications/:id returns a single notification", async () => {
    const id = await seedNotification(tenantAId, adminAId);

    const res = await request(`/notifications/${id}`, { token: adminAToken });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.id).toBe(id);
    expect(res.body.data.type).toBe("processing_failed");
    expect(res.body.data.isArchived).toBe(false);
  });

  it("rejects unauthenticated requests with 401", async () => {
    const res = await request("/notifications");
    expect(res.status).toBe(401);
    expect(res.body.success).toBe(false);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("tenant B cannot read tenant A notification (404)", async () => {
    const id = await seedNotification(tenantAId, adminAId);

    const res = await request(`/notifications/${id}`, { token: adminBToken });

    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("tenant B cannot list tenant A notifications (404 items)", async () => {
    await seedNotification(tenantAId, adminAId);

    const res = await request("/notifications", { token: adminBToken });

    expect(res.status).toBe(200);
    expect(res.body.data.items).toHaveLength(0);
    expect(res.body.data.total).toBe(0);
  });

  it("EMPLOYEE can mark/delete their own notification; cannot affect another user's (scoped)", async () => {
    const ownId = await seedNotification(tenantAId, employeeAId);
    const otherId = await seedNotification(tenantAId, adminAId, {
      dedupEventId: "other-user",
    });

    const readRes = await request(`/notifications/${ownId}/read`, {
      method: "POST",
      token: employeeAToken,
    });
    expect(readRes.status).toBe(200);
    expect(readRes.body.data.notificationId).toBe(ownId);

    const doc = await NotificationModel.findById(ownId).lean();
    expect(doc?.isRead).toBe(true);
    expect(doc?.lifecycleState).toBe("READ");

    const delRes = await request(`/notifications/${ownId}`, {
      method: "DELETE",
      token: employeeAToken,
    });
    expect(delRes.status).toBe(200);
    expect(delRes.body.data).toEqual({ notificationId: ownId, deleted: true });

    const otherRes = await request(`/notifications/${otherId}/read`, {
      method: "POST",
      token: employeeAToken,
    });
    expect(otherRes.status).toBe(200);
    const otherDoc = await NotificationModel.findById(otherId).lean();
    expect(otherDoc?.isRead).toBe(false);
    expect(otherDoc?.lifecycleState).not.toBe("READ");
  });

  it("POST /notifications/:id/read marks the notification read", async () => {
    const id = await seedNotification(tenantAId, adminAId);

    const res = await request(`/notifications/${id}/read`, {
      method: "POST",
      token: adminAToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.data.notificationId).toBe(id);

    const doc = await NotificationModel.findById(id).lean();
    expect(doc?.isRead).toBe(true);
    expect(doc?.lifecycleState).toBe("READ");
  });

  it("POST /notifications/:id/seen marks the notification seen", async () => {
    const id = await seedNotification(tenantAId, adminAId);

    const res = await request(`/notifications/${id}/seen`, {
      method: "POST",
      token: adminAToken,
    });
    expect(res.status).toBe(200);

    const doc = await NotificationModel.findById(id).lean();
    expect(doc?.isSeen).toBe(true);
    expect(doc?.lifecycleState).toBe("SEEN");
  });

  it("POST /notifications/:id/archive sets isArchived", async () => {
    const id = await seedNotification(tenantAId, adminAId);

    const res = await request(`/notifications/${id}/archive`, {
      method: "POST",
      token: adminAToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ notificationId: id, archived: true });

    const doc = await NotificationModel.findById(id).lean();
    expect(doc?.isArchived).toBe(true);
    expect(doc?.archivedAt).toBeInstanceOf(Date);
  });

  it("DELETE /notifications/:id soft-deletes (deletedAt set, GET 404)", async () => {
    const id = await seedNotification(tenantAId, adminAId);

    const delRes = await request(`/notifications/${id}`, {
      method: "DELETE",
      token: adminAToken,
    });
    expect(delRes.status).toBe(200);
    expect(delRes.body.data).toEqual({ notificationId: id, deleted: true });

    const doc = await NotificationModel.findById(id).lean();
    expect(doc?.deletedAt).toBeInstanceOf(Date);
    expect(doc?.lifecycleState).toBe("DELETED");

    const getRes = await request(`/notifications/${id}`, { token: adminAToken });
    expect(getRes.status).toBe(404);
  });

  it("DELETE /notifications clears all of the user's notifications and resets unread", async () => {
    await seedNotification(tenantAId, adminAId);
    await seedNotification(tenantAId, adminAId, { dedupEventId: "clear-2" });
    // Another user's notification must survive (scoped to the actor).
    const otherId = await seedNotification(tenantAId, employeeAId, { dedupEventId: "clear-3" });

    const res = await request("/notifications", {
      method: "DELETE",
      token: adminAToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.matchedCount).toBe(2);

    const remaining = await NotificationModel.countDocuments({ deletedAt: null });
    expect(remaining).toBe(1);
    expect((await NotificationModel.findById(otherId).lean())?.deletedAt).toBeNull();

    const unread = await request("/notifications/unread-count", {
      token: adminAToken,
    });
    expect(unread.body.data.count).toBe(0);
  });

  it("POST /notifications/bulk-read marks the given ids read", async () => {
    const id1 = await seedNotification(tenantAId, adminAId, {
      dedupEventId: "bulk-1",
    });
    const id2 = await seedNotification(tenantAId, adminAId, {
      dedupEventId: "bulk-2",
    });
    await seedNotification(tenantAId, adminAId, { dedupEventId: "bulk-3" });

    const res = await request("/notifications/bulk-read", {
      method: "POST",
      token: adminAToken,
      body: { ids: [id1, id2] },
    });
    expect(res.status).toBe(200);
    expect(res.body.data.matchedCount).toBe(2);

    expect((await NotificationModel.findById(id1).lean())?.isRead).toBe(true);
    expect((await NotificationModel.findById(id2).lean())?.isRead).toBe(true);
    const id3 = await NotificationModel.findOne({ dedupEventId: "bulk-3" }).lean();
    expect(id3?.isRead).toBe(false);
  });

  it("POST /notifications/bulk-read rejects invalid id payloads (400)", async () => {
    const res = await request("/notifications/bulk-read", {
      method: "POST",
      token: adminAToken,
      body: { ids: ["not-a-24-hex"] },
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
  });

  it("POST /notifications/read-all and /seen-all update all unread/unseen", async () => {
    const id1 = await seedNotification(tenantAId, adminAId, {
      dedupEventId: "ra-1",
    });
    const id2 = await seedNotification(tenantAId, adminAId, {
      dedupEventId: "ra-2",
    });

    const readAll = await request("/notifications/read-all", {
      method: "POST",
      token: adminAToken,
    });
    expect(readAll.status).toBe(200);
    expect(readAll.body.data.matchedCount).toBe(2);
    expect((await NotificationModel.findById(id1).lean())?.isRead).toBe(true);
    expect((await NotificationModel.findById(id2).lean())?.isRead).toBe(true);

    const seenAll = await request("/notifications/seen-all", {
      method: "POST",
      token: adminAToken,
    });
    expect(seenAll.status).toBe(200);
    expect(seenAll.body.data.matchedCount).toBe(2);
  });

  it("POST /notifications/test returns 404 when the env flag is disabled", async () => {
    const res = await request("/notifications/test", {
      method: "POST",
      token: superAdminToken,
    });
    expect(res.status).toBe(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("POST /notifications/test rate-limits the 11th call to 429 (per tenant)", async () => {
    for (let i = 0; i < 10; i++) {
      const res = await request("/notifications/test", {
        method: "POST",
        token: superAdminToken,
      });
      expect(res.status).toBe(404); // env disabled, still consumes the bucket
    }

    const eleventh = await request("/notifications/test", {
      method: "POST",
      token: superAdminToken,
    });
    expect(eleventh.status).toBe(429);
    expect(eleventh.body.success).toBe(false);
  });

  it("POST /notifications/test creates one notification when enabled", async () => {
    process.env.NOTIFICATIONS_TEST_ENABLED = "true";
    try {
      const res = await request("/notifications/test", {
        method: "POST",
        token: superAdminToken,
      });
      expect(res.status).toBe(200);
      expect(typeof res.body.data.notificationId).toBe("string");

      const count = await NotificationModel.countDocuments({
        tenantId: new mongoose.Types.ObjectId(
          (await UserModel.findById(superAdminId).lean())!.tenantId.toString(),
        ),
        userId: new mongoose.Types.ObjectId(superAdminId),
      });
      expect(count).toBe(1);
    } finally {
      delete process.env.NOTIFICATIONS_TEST_ENABLED;
    }
  });

  it("POST /notifications/test requires SUPER_ADMIN (403 for COMPANY_ADMIN)", async () => {
    const res = await request("/notifications/test", {
      method: "POST",
      token: adminAToken,
    });
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe("PERMISSION_REQUIRED");
  });
});
