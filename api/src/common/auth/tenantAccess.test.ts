import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import { readFileSync } from "node:fs";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../../db/connection.js";
import TenantModel from "../../db/models/tenant.model.js";
import { disconnectRedis } from "../../db/redis.js";
import { AppError } from "../errors/AppError.js";
import {
  isAuthenticableTenantStatus,
  requireActiveTenantAccess,
} from "./tenantAccess.js";

before(async () => {
  await connectDB();
});

after(async () => {
  await disconnectRedis();
  await disconnectDB();
});

beforeEach(async () => {
  await TenantModel.deleteMany({});
});

test("tenant lifecycle table: active and trial pass; every other status fails closed", async () => {
  const cases: Array<{ status: string; allowed: boolean }> = [
    { status: "active", allowed: true },
    { status: "trial", allowed: true },
    { status: "pending", allowed: false },
    { status: "pending_verification", allowed: false },
    { status: "suspended", allowed: false },
  ];
  for (const { status, allowed } of cases) {
    const tenant = await TenantModel.create({
      name: `Tenant ${status}`,
      slug: `tenant-${status}-${new mongoose.Types.ObjectId().toString()}`,
      status,
      plan: "free",
    });
    let raised: unknown = null;
    try {
      await requireActiveTenantAccess(tenant.id);
    } catch (error) {
      raised = error;
    }
    if (allowed) {
      assert.equal(raised, null, `${status} must be authenticable`);
    } else {
      assert.ok(raised instanceof AppError, `${status} must raise AppError`);
      assert.equal((raised as AppError).statusCode, 403);
    }
  }
  // Unknown or malformed identifiers never broaden access.
  await assert.rejects(() => requireActiveTenantAccess("not-an-objectid"));
  await assert.rejects(() =>
    requireActiveTenantAccess(new mongoose.Types.ObjectId().toString()),
  );
  assert.equal(isAuthenticableTenantStatus("active"), true);
  assert.equal(isAuthenticableTenantStatus("suspended"), false);
});

test("both chat endpoints use the identical self-resource CHAT_CREATE guard", () => {
  const source = readFileSync(
    new URL("../../modules/chat/chat.routes.ts", import.meta.url),
    "utf8",
  ).replace(/\r\n/g, "\n");
  const sendRoute = source.slice(source.indexOf('"/send"'));
  const streamRoute = source.slice(source.indexOf('"/send/stream"'));
  for (const route of [sendRoute, streamRoute]) {
    assert.match(route, /requireSelfPermission\(Permission\.CHAT_CREATE\)/);
    assert.doesNotMatch(route, /requirePermission\(Permission\.CHAT_CREATE\)/);
  }
});
