import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Readable } from "node:stream";

import TenantModel from "../../../../db/models/tenant.model.js";
import UserModel from "../../../../db/models/user.model.js";
import { hashPassword } from "../../../auth/passwordHashing.js";
import { disconnectRedis } from "../../../../db/redis.js";
import { ToolRegistry } from "../../../agents/toolRegistry.js";
import { registerActionTools } from "../registerActionTools.js";
import { evaluatorReauthorize } from "../reauthorize.js";
import { Permission } from "../../../permissions/permissions.catalog.js";
import type { BaseRole } from "../../../../common/auth/baseRoles.js";
import type { AgentRunContext } from "../../../agents/agentRunContext.js";
import type { StorageProvider, SecurityScanner, ProcessingDispatcher } from "../../../../providers/storage/types.js";

const TEST_PASSWORD = "StrongPass123!";
const USER_TOOLS = ["user.invite", "user.list", "user.delete"] as const;

let mongoServer: MongoMemoryReplSet | null = null;

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "copilot-user-tools-auth-test" });
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
    await mongoose.connect(mongoServer.getUri(), {
      dbName: "copilot-user-tools-auth-test",
    });
  }
});

after(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

let tenantId: string;

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  const tenant = await TenantModel.create({
    name: "User Auth Corp",
    slug: "user-auth-corp",
    status: "active",
    plan: "free",
  });
  tenantId = tenant.id;
});

function runContext(opts: {
  tenantId: string;
  actorId: string;
  actorRole: BaseRole;
}): AgentRunContext {
  return {
    tenantId: opts.tenantId,
    actorId: opts.actorId,
    actorEmail: "actor@corp.test",
    actorRole: opts.actorRole,
    traceId: "trace-auth",
    requestId: "req-auth",
    workflowName: "guider-v1",
    agentName: "platform-action-agent",
  } as AgentRunContext;
}

function gate(actorId: string, actorRole: BaseRole) {
  return (permission?: string) =>
    evaluatorReauthorize(
      {
        tenantId,
        actorId,
        actorRole,
        permissions: [],
        traceId: "trace-auth",
        requestId: "req-auth",
      },
      permission,
    );
}

function validInput(toolName: string): Record<string, unknown> {
  switch (toolName) {
    case "user.invite":
      return { name: "New Person", email: "newperson@corp.test", role: "EMPLOYEE" };
    case "user.list":
      return { page: 1, pageSize: 10 };
    case "user.delete":
      return { targetUserId: new mongoose.Types.ObjectId().toString() };
    default:
      throw new Error(`unexpected tool ${toolName}`);
  }
}

async function seedUser(role: BaseRole, email: string) {
  return UserModel.create({
    tenantId,
    name: `${role} User`,
    email,
    passwordHash: await hashPassword(TEST_PASSWORD),
    role,
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
}

const fakeStorage: StorageProvider = {
  async saveFile() { throw new Error("not used"); },
  async saveFileFromStream() { throw new Error("not used"); },
  async deleteFile() { throw new Error("not used"); },
  async getFileStream() { return Readable.from([]); },
  async getFileBuffer() { return Buffer.alloc(0); },
  getContentType() { return "application/octet-stream"; },
};

const fakeScanner: SecurityScanner = {
  async scan() { return { scanner: "fake", result: "clean" }; },
};

const fakeDispatcher: ProcessingDispatcher = {
  async dispatchDocumentUploaded() { return; },
};

function buildToolRegistry() {
  const toolRegistry = new ToolRegistry();
  registerActionTools(toolRegistry, {
    storageProvider: fakeStorage,
    securityScanner: fakeScanner,
    processingDispatcher: fakeDispatcher,
  });
  return toolRegistry;
}

test("user tools: EMPLOYEE actor is denied at the tool gate for invite/list/delete", async () => {
  const employee = await seedUser("EMPLOYEE", "employee@corp.test");
  const context = runContext({ tenantId, actorId: employee.id, actorRole: "EMPLOYEE" });
  const registry = buildToolRegistry();
  const reauth = gate(employee.id, "EMPLOYEE");

  for (const toolName of USER_TOOLS) {
    const result = await registry.execute(context, toolName, validInput(toolName), reauth);
    assert.equal(result.ok, false, `${toolName} must be denied for EMPLOYEE`);
    assert.equal(result.status, "unauthorized", `${toolName} gate must not run the handler`);
    assert.equal(result.error?.code, "TOOL_UNAUTHORIZED");
  }
});

test("user tools: COMPANY_ADMIN is granted users:create/read/delete at the gate", async () => {
  const admin = await seedUser("COMPANY_ADMIN", "admin@corp.test");
  const reauth = gate(admin.id, "COMPANY_ADMIN");

  for (const [toolName, permission] of [
    ["user.invite", Permission.USERS_CREATE],
    ["user.list", Permission.USERS_READ],
    ["user.delete", Permission.USERS_DELETE],
  ] as const) {
    assert.equal(
      await reauth(permission),
      true,
      `${toolName} (${permission}) must be granted for COMPANY_ADMIN`,
    );
  }
});

test("user tools: authorized COMPANY_ADMIN can list, invite, and delete users", async () => {
  const admin = await seedUser("COMPANY_ADMIN", "admin@corp.test");
  const target = await seedUser("EMPLOYEE", "target@corp.test");
  const context = runContext({ tenantId, actorId: admin.id, actorRole: "COMPANY_ADMIN" });
  const registry = buildToolRegistry();
  const reauth = gate(admin.id, "COMPANY_ADMIN");

  const list = await registry.execute(context, "user.list", { page: 1, pageSize: 10 }, reauth);
  assert.equal(list.ok, true, `user.list failed: ${list.error?.message}`);
  assert.equal(list.status, "completed");
  const listOutput = list.output as { users: unknown[]; pagination: { totalRecords: number } };
  assert.ok(Array.isArray(listOutput.users));
  assert.ok(listOutput.pagination.totalRecords >= 2, "admin and target users must be listed");

  const invite = await registry.execute(
    context,
    "user.invite",
    { name: "New Person", email: "newperson@corp.test", role: "EMPLOYEE" },
    reauth,
  );
  assert.equal(invite.ok, true, `user.invite failed: ${invite.error?.message}`);
  assert.equal(invite.status, "completed");
  const inviteOutput = invite.output as { user: { email: string; status: string } };
  assert.equal(inviteOutput.user.email, "newperson@corp.test");
  assert.equal(inviteOutput.user.status, "pending_email_verification");

  const del = await registry.execute(context, "user.delete", { targetUserId: target.id }, reauth);
  assert.equal(del.ok, true, `user.delete failed: ${del.error?.message}`);
  assert.equal(del.status, "completed");
  assert.equal((del.output as { success: boolean }).success, true);
  const deleted = await UserModel.findById(target.id).lean().exec();
  assert.equal(deleted, null, "deleted target user must no longer exist");
});

test("user tools: service layer still denies unauthorized actors when the gate is bypassed", async () => {
  const employee = await seedUser("EMPLOYEE", "employee@corp.test");
  const context = runContext({ tenantId, actorId: employee.id, actorRole: "EMPLOYEE" });
  const registry = buildToolRegistry();
  const permissiveGate = async () => true;

  for (const toolName of USER_TOOLS) {
    const result = await registry.execute(context, toolName, validInput(toolName), permissiveGate);
    assert.equal(result.ok, false, `${toolName} must be denied by the service layer`);
    assert.equal(result.status, "failed", `${toolName} must fail, not silently proceed`);
    assert.match(String(result.error?.message ?? ""), /permission|denied|forbidden/i);
  }
});
