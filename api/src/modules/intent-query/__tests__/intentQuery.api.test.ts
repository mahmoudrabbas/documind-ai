import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import type { Express } from "express";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import { hashPassword } from "../../auth/passwordHashing.js";
import { disconnectRedis } from "../../../db/redis.js";
import { intentQueryService } from "../intentQuery.factory.js";

const app: Express = (await import("../../../app.js")).default;
const TEST_PASSWORD = "StrongPass123!";

let mongoServer: MongoMemoryReplSet | null = null;
let server: Server;
let port: number;
let token: string;
let employeeToken: string;
let tenantId: string;
let actorId: string;

async function createServer() {
  return new Promise<Server>((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
}

function closeServer(srv: Server) {
  return new Promise<void>((resolve, reject) => {
    srv.closeAllConnections?.();
    srv.close((err) => (err ? reject(err) : resolve()));
  });
}

async function login(
  srvPort: number,
  slug = "api-corp",
  email = "admin@api.com"
) {
  const response = await fetch(`http://127.0.0.1:${srvPort}/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ companySlug: slug, email, password: TEST_PASSWORD }),
  });
  assert.equal(response.status, 200);
  const body = (await response.json()) as {
    data: { tokens: { accessToken: string } };
  };
  return body.data.tokens.accessToken;
}

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "intent-query-api" });
  } else {
    mongoServer = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [
        {
          launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000),
        },
      ],
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "intent-query-api" });
  }

  server = await createServer();
  const address = server.address();
  port = typeof address === "string" ? 0 : address?.port ?? 0;
});

after(async () => {
  await closeServer(server);
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});

  const tenant = await TenantModel.create({
    name: "Api Corp",
    slug: "api-corp",
    status: "active",
    plan: "free",
  });
  tenantId = tenant.id;

  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Admin User",
    email: "admin@api.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  actorId = user.id;

  await UserModel.create({
    tenantId: tenant.id,
    name: "Regular Employee",
    email: "employee@api.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "EMPLOYEE",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });

  token = await login(port, "api-corp", "admin@api.com");
  employeeToken = await login(port, "api-corp", "employee@api.com");
});

test("Intent Query HTTP API", async (t) => {
  await t.test("POST /intent-query/analyze - success with valid inputs", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/intent-query/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        question: "What are our office working hours?",
      }),
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.success, true);
    assert.ok(body.data);
    assert.ok((body.data as Record<string, unknown>).queryPlan);
    assert.ok((body.data as Record<string, unknown>).traceId);
  });

  await t.test("POST /intent-query/analyze - reject validation errors", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/intent-query/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${token}`,
      },
      body: JSON.stringify({
        question: "", // invalid: empty question
      }),
    });

    assert.equal(res.status, 400);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.success, false);
    assert.equal(body.error, "INTENT_QUERY_VALIDATION_ERROR");
  });

  await t.test("POST /intent-query/analyze - reject unauthorized role", async () => {
    // Set employee user to disabled so they are rejected
    await UserModel.updateOne({ role: "EMPLOYEE" }, { status: "disabled" });

    const res = await fetch(`http://127.0.0.1:${port}/intent-query/analyze`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "authorization": `Bearer ${employeeToken}`,
      },
      body: JSON.stringify({
        question: "What is the policy?",
      }),
    });

    assert.equal(res.status, 403);
  });

  await t.test("GET /intent-query/debug/:traceId - success for COMPANY_ADMIN", async () => {
    // Run an analysis first to generate a trace
    const context = {
      tenantId: tenantId,
      actorId: actorId,
      actorEmail: "admin@api.com",
      actorRole: "COMPANY_ADMIN" as const,
      traceId: "test-debug-trace-id",
      requestId: "req-1",
    };
    
    await intentQueryService.analyzeQuery(
      { question: "Verify trace logging." },
      context
    );

    const res = await fetch(`http://127.0.0.1:${port}/intent-query/debug/test-debug-trace-id`, {
      method: "GET",
      headers: {
        "authorization": `Bearer ${token}`,
      },
    });

    assert.equal(res.status, 200);
    const body = (await res.json()) as Record<string, unknown>;
    assert.equal(body.success, true);
    assert.equal((body.data as Record<string, unknown>).traceId, "test-debug-trace-id");
    assert.ok((body.data as Record<string, unknown>).queryPlan);
  });

  await t.test("GET /intent-query/debug/:traceId - denied for EMPLOYEE", async () => {
    const res = await fetch(`http://127.0.0.1:${port}/intent-query/debug/test-debug-trace-id`, {
      method: "GET",
      headers: {
        "authorization": `Bearer ${employeeToken}`,
      },
    });

    assert.equal(res.status, 403);
  });
});
