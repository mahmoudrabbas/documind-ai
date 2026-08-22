import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose from "mongoose";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import app from "../../../app.js";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import EmployeeImportBatchModel from "../../../db/models/employeeImportBatch.model.js";
import EmployeeImportRowModel from "../../../db/models/employeeImportRow.model.js";
import PackageModel from "../../../db/models/package.model.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import { config } from "../../../config/index.js";
import { disconnectRedis } from "../../../db/redis.js";
import { signJwt } from "../../auth/jwtTokens.js";

const hasMongo = Boolean(process.env.MONGODB_URI);

describe.skipIf(!hasMongo)("Employee Import tenant isolation", () => {
  let server: Server;
  let port: number;
  let connectedByThisFile = false;

  beforeAll(async () => {
    if (mongoose.connection.readyState === 0) {
      await mongoose.connect(process.env.MONGODB_URI as string);
      connectedByThisFile = true;
    }
    server = await new Promise<Server>((resolve) => {
      const listening = app.listen(0, () => resolve(listening));
    });
    port = (server.address() as AddressInfo).port;
  });

  beforeEach(async () => {
    await Promise.all([
      EmployeeImportRowModel.deleteMany({}),
      EmployeeImportBatchModel.deleteMany({}),
      SubscriptionModel.deleteMany({}),
      PackageModel.deleteMany({}),
      UserModel.deleteMany({}),
      TenantModel.deleteMany({}),
    ]);
  });

  afterAll(async () => {
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    await disconnectRedis();
    if (connectedByThisFile) await mongoose.disconnect();
  });

  it("returns the same non-disclosing 404 for every cross-tenant batch operation", async () => {
    const tenantA = await createAdmin("import-a", "admin-a@imports.test");
    const tenantB = await createAdmin("import-b", "admin-b@imports.test");
    const batch = await seedBatch(tenantA.tenantId, tenantA.userId, "COMPLETED");
    const privateEmail = "private.employee@tenant-a.test";
    await seedRow(batch._id, tenantA.tenantId, privateEmail, "FAILED");

    const attempts: Array<{
      method: string;
      path: string;
      body?: Record<string, unknown>;
    }> = [
      { method: "GET", path: `/imports/${batch.id}?includeRows=true` },
      {
        method: "PUT",
        path: `/imports/${batch.id}/mapping`,
        body: { Email: "email" },
      },
      {
        method: "POST",
        path: `/imports/${batch.id}/confirm`,
        body: { idempotencyKey: "cross-tenant-confirm" },
      },
      { method: "POST", path: `/imports/${batch.id}/cancel` },
      { method: "POST", path: `/imports/${batch.id}/retry`, body: {} },
      { method: "GET", path: `/imports/${batch.id}/export?format=csv` },
    ];

    for (const attempt of attempts) {
      const response = await request(attempt.method, attempt.path, tenantB.token, attempt.body);
      const text = await response.text();
      expect(response.status, `${attempt.method} ${attempt.path}`).toBe(404);
      expect(text).toContain("NOT_FOUND");
      expect(text).not.toContain("tenant-a-private.xlsx");
      expect(text).not.toContain(privateEmail);
      expect(text).not.toContain(tenantA.tenantId);
    }

    const persistedBatch = await EmployeeImportBatchModel.findById(batch._id).lean();
    const persistedRow = await EmployeeImportRowModel.findOne({ batchId: batch._id }).lean();
    expect(persistedBatch?.state).toBe("COMPLETED");
    expect(persistedRow?.state).toBe("FAILED");
    expect(persistedRow?.rawData).toEqual({ Email: privateEmail, Name: "Private Employee" });
  });

  it("preserves same-tenant status, row retrieval, export, and cancellation", async () => {
    const tenantA = await createAdmin("import-same", "admin@same-imports.test");
    const completed = await seedBatch(tenantA.tenantId, tenantA.userId, "COMPLETED");
    const employeeEmail = "employee@same-tenant.test";
    await seedRow(completed._id, tenantA.tenantId, employeeEmail, "CREATED");

    const status = await request(
      "GET",
      `/imports/${completed.id}?includeRows=true`,
      tenantA.token,
    );
    const statusBody = await status.text();
    expect(status.status).toBe(200);
    expect(statusBody).toContain("tenant-a-private.xlsx");
    expect(statusBody).toContain(employeeEmail);

    const exported = await request(
      "GET",
      `/imports/${completed.id}/export?format=csv`,
      tenantA.token,
    );
    expect(exported.status).toBe(200);
    expect(await exported.text()).toContain(employeeEmail);

    const cancellable = await seedBatch(
      tenantA.tenantId,
      tenantA.userId,
      "UPLOADED",
      "cancel",
    );
    const cancelled = await request(
      "POST",
      `/imports/${cancellable.id}/cancel`,
      tenantA.token,
    );
    expect(cancelled.status).toBe(200);
    expect(await EmployeeImportBatchModel.exists({
      _id: cancellable._id,
      tenantId: new mongoose.Types.ObjectId(tenantA.tenantId),
      state: "CANCELLED",
    })).not.toBeNull();
  });

  async function createAdmin(slug: string, email: string) {
    const tenant = await TenantModel.create({
      name: slug,
      slug,
      status: "active",
      plan: "free",
    });
    const user = await UserModel.create({
      tenantId: tenant._id,
      name: `${slug} Admin`,
      email,
      passwordHash: "not-used",
      role: "COMPANY_ADMIN",
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    const entitlements = {
      employees: 100,
      admins: 10,
      documents: 100,
      storageMb: 1_000,
      fileSizeMb: 50,
      queriesPerMonth: 1_000,
      tokensPerMonth: 1_000_000,
      ocrPagesPerMonth: 1_000,
    };
    const pkg = await PackageModel.create({
      name: `${slug} Test Package`,
      code: `${slug}-package`,
      active: true,
      version: 1,
      monthlyPrice: 0,
      entitlements,
      versions: [{
        version: 1,
        name: `${slug} Test Package`,
        code: `${slug}-package`,
        monthlyPrice: 0,
        entitlements,
        createdAt: new Date(),
      }],
    });
    const periodStart = new Date(Date.now() - 24 * 60 * 60 * 1_000);
    const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000);
    await SubscriptionModel.create({
      tenantId: tenant._id,
      packageId: pkg._id,
      packageVersion: 1,
      status: "ACTIVE",
      paymentState: "paid",
      periodStart,
      periodEnd,
      currentPeriodStart: periodStart,
      currentPeriodEnd: periodEnd,
      startedAt: periodStart,
    });
    return {
      tenantId: tenant.id,
      userId: user.id,
      token: signJwt(
        {
          sub: user.id,
          tenantId: tenant.id,
          type: "access",
          role: "COMPANY_ADMIN",
          email,
        },
        config.JWT_SECRET,
        "15m",
      ),
    };
  }

  async function seedBatch(
    tenantId: string,
    createdBy: string,
    state: "UPLOADED" | "COMPLETED",
    suffix = "primary",
  ) {
    return EmployeeImportBatchModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      createdBy: new mongoose.Types.ObjectId(createdBy),
      originalFileName: "tenant-a-private.xlsx",
      fileChecksum: `checksum-${suffix}`,
      totalRows: 1,
      state,
      mapping: {
        columnMapping: { Email: "email", Name: "fullName" },
        unmappedColumns: [],
        confidence: "high",
      },
      summary: {
        valid: 0,
        warning: 0,
        invalid: 0,
        skipped: 0,
        created: state === "COMPLETED" ? 1 : 0,
        failed: 0,
      },
      idempotencyKey: `tenant-import-${tenantId}-${suffix}`,
      ...(state === "COMPLETED" ? { completedAt: new Date() } : {}),
    });
  }

  async function seedRow(
    batchId: mongoose.Types.ObjectId,
    tenantId: string,
    email: string,
    state: "FAILED" | "CREATED",
  ) {
    return EmployeeImportRowModel.create({
      batchId,
      tenantId: new mongoose.Types.ObjectId(tenantId),
      rowNumber: 1,
      rawData: { Email: email, Name: "Private Employee" },
      state,
      checksum: `row-${batchId.toString()}`,
      idempotencyKey: `row-${batchId.toString()}-1`,
      ...(state === "FAILED" ? { errorMessage: "private validation detail" } : {}),
    });
  }

  function request(
    method: string,
    path: string,
    token: string,
    body?: Record<string, unknown>,
  ) {
    return fetch(`http://127.0.0.1:${port}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
  }
});
