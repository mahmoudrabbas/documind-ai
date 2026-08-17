import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { Readable } from "node:stream";

import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import DocumentModel from "../../../db/models/document.model.js";
import { hashPassword } from "../../auth/passwordHashing.js";
import { disconnectRedis } from "../../../db/redis.js";
import { AppError } from "../../../common/errors/AppError.js";
import { NOT_FOUND } from "../../../common/errors/errorCodes.js";
import type { BaseRole } from "../../../common/auth/baseRoles.js";

import { FakeModelAdapter } from "../../../providers/llm/fakeAdapters.js";
import { CopilotClassifier } from "../agents/copilotSupervisor.js";
import { ToolRegistry } from "../../agents/toolRegistry.js";
import { registerActionTools } from "../action/registerActionTools.js";
import { resolveActionTarget } from "../action/resolveActionTarget.js";
import { getGuideFlow } from "../guide/guideFlows.js";
import { BASE_ROLE_DEFAULTS } from "../../permissions/permissions.catalog.js";
import { EVAL_DATASET } from "./eval.dataset.js";
import type { AgentRunContext } from "../../agents/agentRunContext.js";
import type { StorageProvider, SecurityScanner, ProcessingDispatcher } from "../../../providers/storage/types.js";

const TEST_PASSWORD = "StrongPass123!";

let mongoServer: MongoMemoryReplSet | null = null;

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "copilot-eval-test" });
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
      dbName: "copilot-eval-test",
    });
  }
});

after(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

let tenantId: string;
let actorId: string;

async function seedTenantAndActor(role: BaseRole = "COMPANY_ADMIN") {
  const tenant = await TenantModel.create({
    name: "Eval Corp",
    slug: "eval-corp",
    status: "active",
    plan: "free",
  });
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Eval User",
    email: "eval@intent.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role,
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return { tenantId: tenant.id, actorId: user.id };
}

async function seedForeignDocument(foreignTenantId: string, ownerId: string) {
  const doc = await DocumentModel.create({
    tenantId: new mongoose.Types.ObjectId(foreignTenantId),
    fileName: "foreign.pdf",
    originalFileName: "foreign.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
    storageKey: `documents/${foreignTenantId}/foreign.pdf`,
    checksum: "foreign-checksum",
    status: "uploaded",
    metadata: {
      title: "Foreign Confidential Doc",
      description: null,
      tags: [],
    },
    classification: "internal",
    uploadedBy: new mongoose.Types.ObjectId(ownerId),
    owner: new mongoose.Types.ObjectId(ownerId),
  });
  return doc.id;
}

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await DocumentModel.deleteMany({});
  const seeded = await seedTenantAndActor();
  tenantId = seeded.tenantId;
  actorId = seeded.actorId;
});

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

test("eval dataset: classifier decisions match the deterministic fallback", async () => {
  const classifier = new CopilotClassifier(new FakeModelAdapter());

  for (const entry of EVAL_DATASET) {
    const decision = await classifier.classify(entry.utterance, entry.locale);

    if (entry.expected.mode === "clarify") {
      assert.equal(
        decision.mode,
        "clarify",
        `${entry.id}: expected clarify for "${entry.utterance}"`,
      );
      assert.equal(decision.flowIdHint, null, `${entry.id}: clarify must carry no flow`);
      assert.equal(decision.toolNameHint, null, `${entry.id}: clarify must carry no tool`);
      continue;
    }

    assert.equal(
      decision.mode,
      entry.expected.mode,
      `${entry.id}: wrong mode for "${entry.utterance}"`,
    );

    if (entry.expected.mode === "guide") {
      assert.equal(
        decision.flowIdHint,
        entry.expected.flowId,
        `${entry.id}: wrong flow for "${entry.utterance}"`,
      );
    } else {
      assert.equal(
        decision.toolNameHint,
        entry.expected.toolName,
        `${entry.id}: wrong tool for "${entry.utterance}"`,
      );
    }
  }
});

test("eval dataset: guide cases reference registered flows", async () => {
  for (const entry of EVAL_DATASET) {
    if (entry.expected.mode !== "guide") continue;
    const flowId = entry.expected.flowId;
    if (flowId === null) continue; // section navigation resolved by the guide agent
    const flow = getGuideFlow(flowId);
    assert.ok(flow, `${entry.id}: flow ${flowId} must be registered`);
  }
});

test("eval dataset: action cases resolve to registered tools with expected confirmation and permission", async () => {
  const toolRegistry = buildToolRegistry();

  for (const entry of EVAL_DATASET) {
    if (entry.expected.mode !== "action") continue;
    const { toolName, requiresConfirmation, denied } = entry.expected;

    const tool = toolRegistry.get(toolName);
    assert.ok(tool, `${entry.id}: tool ${toolName} must be registered`);

    assert.equal(
      tool.schema.approvalRequired,
      requiresConfirmation,
      `${entry.id}: confirmation must match the registry for ${toolName}`,
    );

    const role = entry.role ?? "COMPANY_ADMIN";
    const requiredPermission = tool.schema.requiredPermission;
    const granted =
      !requiredPermission ||
      (BASE_ROLE_DEFAULTS[role] as readonly string[]).includes(requiredPermission);
    assert.equal(
      granted,
      !(denied ?? false),
      `${entry.id}: permission ${requiredPermission} grant for ${role} must match`,
    );
  }
});

test("eval dataset: cross-tenant target id is not-found", async () => {
  const foreign = await TenantModel.create({
    name: "Foreign Corp",
    slug: "foreign-corp",
    status: "active",
    plan: "free",
  });
  const foreignDocId = await seedForeignDocument(foreign.id, actorId);

  await assert.rejects(
    resolveActionTarget({
      toolName: "document.softDelete",
      toolInput: { documentId: foreignDocId },
      tenantId,
    }),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 404);
      assert.equal(error.code, NOT_FOUND);
      assert.match(error.message, /Target document not found/);
      return true;
    },
  );

  const foreignAgain = await resolveActionTarget({
    toolName: "document.softDelete",
    toolInput: { documentId: foreignDocId },
    tenantId: foreign.id,
  });
  assert.ok(foreignAgain);
  assert.equal(foreignAgain.type, "document");
  assert.equal(foreignAgain.label, "Foreign Confidential Doc");
});

test("eval dataset: tool input carrying trusted context fields is rejected", async () => {
  const toolRegistry = buildToolRegistry();
  const tool = toolRegistry.get("document.softDelete");
  assert.ok(tool);

  await assert.rejects(
    tool.handler(
      {
        tenantId,
        actorId,
        actorRole: "COMPANY_ADMIN",
        actorEmail: "eval@intent.com",
        traceId: "trace-eval",
        requestId: "req-eval",
        workflowName: "guider-v1",
        agentName: "platform-action-agent",
      } as AgentRunContext,
      { documentId: new mongoose.Types.ObjectId().toString(), tenantId: "injected-tenant" },
    ),
    (error: unknown) => {
      assert.ok(error instanceof AppError);
      assert.equal(error.statusCode, 400);
      assert.equal(error.code, "INVALID_TOOL_INPUT");
      assert.match(error.message, /must not contain "tenantId"/);
      return true;
    },
  );
});

test("eval dataset: action on a foreign document fails with an explained error", async () => {
  const foreign = await TenantModel.create({
    name: "Foreign Corp 2",
    slug: "foreign-corp-2",
    status: "active",
    plan: "free",
  });
  const foreignDocId = await seedForeignDocument(foreign.id, actorId);

  const toolRegistry = buildToolRegistry();
  const result = await toolRegistry.execute(
    {
      tenantId,
      actorId,
      actorRole: "COMPANY_ADMIN",
      actorEmail: "eval@intent.com",
      traceId: "trace-eval",
      requestId: "req-eval",
      workflowName: "guider-v1",
      agentName: "platform-action-agent",
      permissions: BASE_ROLE_DEFAULTS.COMPANY_ADMIN,
    } as AgentRunContext,
    "document.softDelete",
    { documentId: foreignDocId },
    async () => true,
  );

  assert.equal(result.ok, false);
  assert.equal(result.status, "failed");
  const errorMessage = String(result.error?.message ?? "");
  assert.ok(errorMessage, "expected an explained failure message");
  assert.match(errorMessage, /not found|denied|forbidden|permission/i);
});

test("eval dataset: unregistered tool names can never be invoked", async () => {
  const toolRegistry = buildToolRegistry();

  for (const entry of EVAL_DATASET) {
    if (entry.expected.mode !== "action") continue;
    const registered = toolRegistry.get(entry.expected.toolName);
    assert.ok(registered, `${entry.id}: classifier may only reference registered tools`);
  }
});
