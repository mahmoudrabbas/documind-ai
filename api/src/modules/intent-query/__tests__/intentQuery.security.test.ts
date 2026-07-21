import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import { hashPassword } from "../../auth/passwordHashing.js";
import { disconnectRedis } from "../../../db/redis.js";

import { IntentQueryService } from "../intentQuery.service.js";
import { FakeConversationContextAdapter } from "../adapters/conversationContext.fakeAdapter.js";
import { FakeModelAdapter } from "../../../providers/llm/fakeAdapters.js";
import type { OperationAuthorizationContext } from "../../permissions/permissions.operation.js";

let mongoServer: MongoMemoryReplSet | null = null;
const TEST_PASSWORD = "StrongPass123!";

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "intent-query-security" });
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
    await mongoose.connect(mongoServer.getUri(), { dbName: "intent-query-security" });
  }
});

after(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

let tenantId: string;
let actorId: string;
let companyAdminContext: OperationAuthorizationContext;
let fakeConvoAdapter: FakeConversationContextAdapter;
let service: IntentQueryService;

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});

  const tenant = await TenantModel.create({
    name: "Tenant A",
    slug: "tenant-a",
    status: "active",
    plan: "free",
  });
  tenantId = tenant.id;

  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Admin User",
    email: "admin@tenanta.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  actorId = user.id;

  companyAdminContext = {
    tenantId: tenantId,
    actorId: actorId,
    actorEmail: user.email,
    actorRole: user.role,
    traceId: "security-trace",
    requestId: "security-req",
  };

  fakeConvoAdapter = new FakeConversationContextAdapter();
  service = new IntentQueryService(new FakeModelAdapter(), fakeConvoAdapter);
});

test("IntentQueryService - Security & Isolation Tests", async (t) => {
  await t.test("should block access to conversation context belonging to another tenant", async () => {
    const anotherTenantId = new mongoose.Types.ObjectId().toString();
    const anotherActorId = new mongoose.Types.ObjectId().toString();
    const conversationId = new mongoose.Types.ObjectId().toString();

    // Seed conversation with another tenant's credentials
    fakeConvoAdapter.setConversation(conversationId, anotherTenantId, anotherActorId, [
      { role: "user", content: "Top secret details", timestamp: new Date().toISOString() },
    ]);

    // Request using Tenant A's context
    await assert.rejects(
      service.analyzeQuery(
        {
          question: "What is my vacation policy?",
          conversationId,
        },
        companyAdminContext
      ),
      (err: unknown) => {
        const error = err as Record<string, unknown>;
        assert.equal(error.statusCode, 403);
        assert.equal(error.code, "FORBIDDEN");
        return true;
      }
    );
  });

  await t.test("should block access to conversation context belonging to another user in same tenant", async () => {
    const anotherActorId = new mongoose.Types.ObjectId().toString();
    const conversationId = new mongoose.Types.ObjectId().toString();

    // Seed conversation in same tenant but different user
    fakeConvoAdapter.setConversation(conversationId, tenantId, anotherActorId, [
      { role: "user", content: "Top secret details of User B", timestamp: new Date().toISOString() },
    ]);

    // Request using User A's context
    await assert.rejects(
      service.analyzeQuery(
        {
          question: "What did I ask last time?",
          conversationId,
        },
        companyAdminContext
      ),
      (err: unknown) => {
        const error = err as Record<string, unknown>;
        assert.equal(error.statusCode, 403);
        assert.equal(error.code, "FORBIDDEN");
        return true;
      }
    );
  });

  await t.test("should prevent execution of disabled users", async () => {
    const employeeUser = await UserModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      name: "Employee User",
      email: "employee@tenanta.com",
      passwordHash: await hashPassword(TEST_PASSWORD),
      role: "EMPLOYEE",
      status: "disabled",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });

    const employeeContext = {
      tenantId: tenantId,
      actorId: employeeUser.id,
      actorEmail: employeeUser.email,
      actorRole: employeeUser.role,
      traceId: "employee-trace",
      requestId: "employee-req",
    };

    // Disabled users do not pass resolvePersistedActor.
    // Let's assert it rejects with a 403 Permission Denied.
    await assert.rejects(
      service.analyzeQuery(
        { question: "What is the policy?" },
        employeeContext
      ),
      (err: unknown) => {
        const error = err as Record<string, unknown>;
        assert.equal(error.statusCode, 403);
        assert.equal(error.code, "PERMISSION_REQUIRED");
        return true;
      }
    );
  });
});
