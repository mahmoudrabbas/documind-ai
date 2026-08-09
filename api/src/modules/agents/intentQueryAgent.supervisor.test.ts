import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import AgentRunModel from "../../db/models/agentRun.model.js";
import AgentStepModel from "../../db/models/agentStep.model.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { disconnectRedis } from "../../db/redis.js";
import type { BaseRole } from "../../common/auth/baseRoles.js";

import { IntentQueryService } from "../intent-query/intentQuery.service.js";
import { FakeConversationContextAdapter } from "../intent-query/adapters/conversationContext.fakeAdapter.js";
import { FakeModelAdapter } from "../../providers/llm/fakeAdapters.js";
import { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import { SupervisorRuntime, type SupervisorDecisionModel, type SupervisorRunInput } from "./supervisorRuntime.js";
import { MongoSupervisorPersistence } from "./supervisorPersistence.js";
import { ToolRegistry } from "./toolRegistry.js";
import { createChatWorkflowRegistry } from "./chatWorkflow.js";
import { registerIntentQueryAgentExecutor } from "./intentQueryAgent.js";
import { createRun } from "./agents.repository.js";

const SUP = "chat-supervisor";
const TEST_PASSWORD = "StrongPass123!";

let mongoServer: MongoMemoryReplSet | null = null;

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "intent-query-agent-supervisor-test" });
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
      dbName: "intent-query-agent-supervisor-test",
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
let actorEmail: string;
let conversationId: string;

async function seedActor(overrides: Partial<{
  status: string;
  role: BaseRole;
}> = {}) {
  const tenant = await TenantModel.create({
    name: "Intent Corp",
    slug: "intent-corp",
    status: "active",
    plan: "free",
  });
  tenantId = tenant.id;

  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Admin User",
    email: "admin@intent.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: overrides.role ?? "COMPANY_ADMIN",
    status: overrides.status ?? "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  actorId = user.id;
  actorEmail = user.email;
}

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await AgentRunModel.deleteMany({});
  await AgentStepModel.deleteMany({});
  await seedActor();
  conversationId = new mongoose.Types.ObjectId().toString();
});

function scriptedModel(decisions: string[]): SupervisorDecisionModel {
  let index = 0;
  return {
    providerKey: "fake",
    modelName: "fake-scripted",
    async decide() {
      if (index >= decisions.length) {
        throw new Error(`Script exhausted at decision ${index}`);
      }
      const content = decisions[index];
      index++;
      return {
        content,
        usage: { promptTokens: 10, completionTokens: 20, totalTokens: 30 },
      };
    },
  };
}

function handoffToIntent(): string {
  return JSON.stringify({
    action: "handoff",
    currentAgent: SUP,
    nextAgent: "intent-query-agent",
    reasonCode: "analyze-intent",
    payload: {
      conversationId,
      question: "What is our remote work policy?",
    },
  });
}

function returnToSupervisor(): string {
  return JSON.stringify({
    action: "handoff",
    currentAgent: "intent-query-agent",
    nextAgent: SUP,
    reasonCode: "return",
    payload: {},
  });
}

function completeDecision(result: Record<string, unknown>): string {
  return JSON.stringify({
    action: "complete",
    currentAgent: SUP,
    result,
    reasonCode: "done",
  });
}

function baseRunInput(overrides: Partial<SupervisorRunInput> = {}): SupervisorRunInput {
  return {
    runId: "placeholder",
    workflowId: "chat-rag-v1",
    context: {
      requestId: "req-supervisor-intent",
      traceId: "trace-supervisor-intent",
      tenantId,
      actorId,
      actorRole: "COMPANY_ADMIN",
      actorEmail,
      conversationId,
      workflowId: "chat-rag-v1",
      permissions: [],
    },
    input: { question: "What is our remote work policy?" },
    ...overrides,
  };
}

async function buildRuntime(model: SupervisorDecisionModel) {
  const registry = new AgentExecutorRegistry();
  const intentService = new IntentQueryService(
    new FakeModelAdapter(),
    new FakeConversationContextAdapter(),
  );
  registerIntentQueryAgentExecutor(registry, intentService);

  const runtime = new SupervisorRuntime({
    model,
    workflowRegistry: createChatWorkflowRegistry(),
    executorRegistry: registry,
    toolRegistry: new ToolRegistry(),
    persistence: new MongoSupervisorPersistence(),
  });
  return runtime;
}

async function createPendingRun(): Promise<string> {
  const run = await createRun({
    tenantId,
    actorId,
    workflowName: "chat-rag-v1",
    agentName: "chat-supervisor",
    input: { question: "What is our remote work policy?" },
    modelProvider: "fake",
    modelName: "fake-supervisor",
    promptVersion: "1.0.0",
    promptVersionId: null,
    toolVersionSnapshot: null,
    traceId: "trace-supervisor-intent",
    requestId: "req-supervisor-intent",
  });
  return run.id;
}

test("SupervisorRuntime + intent-query-agent integration", async (t) => {
  await t.test(
    "handoff to the real intent-query agent persists a traced step and run totals",
    async () => {
      const runId = await createPendingRun();
      const model = scriptedModel([
        handoffToIntent(),
        returnToSupervisor(),
        completeDecision({ answer: "done" }),
      ]);
      const runtime = await buildRuntime(model);

      const result = await runtime.execute(baseRunInput({ runId }));

      assert.equal(result.status, "completed");
      assert.equal(result.totalSteps, 4);
      assert.equal(result.handoffsCount, 2);
      assert.equal(typeof result.totalTokensUsed, "number");
      assert.ok((result.totalTokensUsed as number) > 0);
      assert.equal(result.estimatedCost, 0);

      const steps = (
        await AgentStepModel.find({ runId: new mongoose.Types.ObjectId(runId) })
          .sort({ stepIndex: 1 })
          .lean()
      ).map((s) => ({ ...s, _id: String(s._id), runId: String(s.runId) }));

      assert.equal(steps.length, 4);

      const intentHandoffStep = steps.find(
        (s) => s.action === "handoff" && s.handoffToAgent === "intent-query-agent",
      );
      assert.ok(intentHandoffStep, "intent handoff step was persisted");
      assert.equal(intentHandoffStep.agentName, "chat-supervisor");
      assert.equal(intentHandoffStep.status, "completed");
      assert.equal(intentHandoffStep.previousAgent, "chat-supervisor");
      assert.equal(intentHandoffStep.output, null);
      assert.equal(intentHandoffStep.tokensUsed, null);

      const intentExecutionStep = steps.find(
        (s) => s.action === "execute" && s.agentName === "intent-query-agent",
      );
      assert.ok(intentExecutionStep, "intent execution step was persisted");
      assert.equal(intentExecutionStep.status, "completed");
      assert.equal(intentExecutionStep.handoffToAgent, null);
      assert.equal(intentExecutionStep.previousAgent, null);

      assert.equal(intentExecutionStep.modelProvider, "fake");
      assert.equal(intentExecutionStep.modelName, "fake");
      assert.equal(intentExecutionStep.promptVersion, "1.4.0");
      assert.equal(typeof intentExecutionStep.tokensUsed, "number");
      assert.ok((intentExecutionStep.tokensUsed as number) > 0);
      assert.equal(Number(intentExecutionStep.estimatedCost), 0);
      assert.equal(typeof intentExecutionStep.latencyMs, "number");
      assert.ok((intentExecutionStep.latencyMs as number) >= 0);

      assert.ok(
        intentExecutionStep.output && typeof intentExecutionStep.output === "object",
        "intent execution step output is an object",
      );
      const output = intentExecutionStep.output as Record<string, unknown>;
      assert.equal(output.route, "rag");
      assert.equal(output.reasonCode, "RAG_REQUIRED");
      assert.equal(output.intent, "knowledge_question");

      const run = await AgentRunModel.findById(runId).lean();
      assert.ok(run);
      assert.equal(run.status, "completed");
      assert.equal(run.totalSteps, 4);
      assert.equal(
        run.totalTokensUsed,
        (intentExecutionStep.tokensUsed as number) + 90,
      );
      assert.equal(Number(run.estimatedCost), 0);
    },
  );

  await t.test(
    "an unauthorized intent analysis fails closed with the mapped code and traces the step",
    async () => {
      await UserModel.updateOne(
        { _id: actorId },
        { $set: { status: "inactive" } },
      );
      const runId = await createPendingRun();
      const model = scriptedModel([handoffToIntent()]);
      const runtime = await buildRuntime(model);

      const result = await runtime.execute(baseRunInput({ runId }));

      assert.equal(result.status, "failed");
      assert.equal(result.error?.code, "PERMISSION_REQUIRED");

      const steps = await AgentStepModel.find({
        runId: new mongoose.Types.ObjectId(runId),
      }).lean();

      const intentHandoffStep = steps.find(
        (s) => s.action === "handoff" && s.handoffToAgent === "intent-query-agent",
      );
      assert.ok(intentHandoffStep, "intent handoff step was persisted");
      assert.equal(intentHandoffStep.status, "completed");
      assert.equal(intentHandoffStep.agentName, "chat-supervisor");
      assert.equal(intentHandoffStep.error, null);

      const intentExecutionStep = steps.find(
        (s) => s.action === "execute" && s.agentName === "intent-query-agent",
      );
      assert.ok(intentExecutionStep, "failed intent execution step was persisted");
      assert.equal(intentExecutionStep.status, "failed");
      assert.equal(
        (intentExecutionStep.error as Record<string, unknown>).code,
        "PERMISSION_REQUIRED",
      );
    },
  );
});
