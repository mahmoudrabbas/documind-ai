import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import DocumentModel from "../../../db/models/document.model.js";
import AuditLogModel from "../../../db/models/auditLog.model.js";
import AgentRunModel from "../../../db/models/agentRun.model.js";
import DocumentAccessPolicyModel from "../../../db/models/documentAccessPolicy.model.js";
import { hashPassword } from "../../auth/passwordHashing.js";
import { disconnectRedis } from "../../../db/redis.js";
import type { BaseRole } from "../../../common/auth/baseRoles.js";

import { FakeModelAdapter } from "../../../providers/llm/fakeAdapters.js";
import { AgentExecutorRegistry } from "../../agents/agentExecutorRegistry.js";
import type { AgentContract } from "../../agents/agentContract.js";
import { SupervisorRuntime, type SupervisorRunInput } from "../../agents/supervisorRuntime.js";
import { InMemorySupervisorPersistence } from "../../agents/supervisorPersistence.js";
import { ToolRegistry } from "../../agents/toolRegistry.js";
import { createDefaultSupervisorGuardrails } from "../../agents/supervisorGuardrails.js";
import { createCopilotWorkflowRegistry } from "../../agents/chatWorkflow.js";
import { CopilotClassifier } from "../agents/copilotSupervisor.js";
import { platformGuideAgent } from "../agents/platformGuideAgent.js";
import { createPlatformActionAgent } from "../agents/platformActionAgent.js";
import { registerActionTools } from "../action/registerActionTools.js";
import { resumeCopilotAction, createActionPlan } from "../copilot.service.js";
import CopilotActionIdempotencyModel from "../idempotency/actionIdempotency.model.js";
import { DOCUMENT_ACCESS_ACTIONS } from "../../document-access/documentAccess.actions.js";
import type { StorageProvider, SecurityScanner, ProcessingDispatcher } from "../../../providers/storage/types.js";
import { Readable } from "node:stream";

const ZERO_USAGE = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

const ACTION_PERMISSIONS = [
  "chat:create",
  "chat:read",
  "documents:read",
  "documents:update",
  "documents:archive",
  "documents:delete",
  "users:read",
  "users:create",
  "users:delete",
  "company-settings:update",
];

const TEST_PASSWORD = "StrongPass123!";

let mongoServer: MongoMemoryReplSet | null = null;

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "copilot-supervisor-test" });
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
      dbName: "copilot-supervisor-test",
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

async function seedActor(role: BaseRole = "COMPANY_ADMIN") {
  const tenant = await TenantModel.create({
    name: "Copilot Corp",
    slug: "copilot-corp",
    status: "active",
    plan: "free",
  });
  tenantId = tenant.id;

  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Copilot User",
    email: "copilot@intent.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role,
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  actorId = user.id;
  actorEmail = user.email;
}

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await DocumentModel.deleteMany({});
  await DocumentAccessPolicyModel.deleteMany({});
  await AuditLogModel.deleteMany({});
  await CopilotActionIdempotencyModel.deleteMany({});
  await seedActor();
  conversationId = new mongoose.Types.ObjectId().toString();
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

function baseRunInput(utterance: string): SupervisorRunInput {
  return {
    runId: new mongoose.Types.ObjectId().toString(),
    workflowId: "guider-v1",
    context: {
      requestId: "req-copilot",
      traceId: "trace-copilot",
      tenantId,
      actorId,
      actorRole: "COMPANY_ADMIN",
      actorEmail,
      conversationId,
      workflowId: "guider-v1",
      permissions: ACTION_PERMISSIONS,
    },
    input: { utterance, locale: "en" },
  };
}

async function buildRuntime() {
  const toolRegistry = new ToolRegistry();
  registerActionTools(toolRegistry, {
    storageProvider: fakeStorage,
    securityScanner: fakeScanner,
    processingDispatcher: fakeDispatcher,
  });

  const retainedByRun = new Map<string, Record<string, unknown>>();
  const executorRegistry = new AgentExecutorRegistry();
  executorRegistry.register(platformGuideAgent as unknown as AgentContract);
  executorRegistry.register(
    createPlatformActionAgent(toolRegistry, {
      mode: "action",
      confidence: 1,
      flowIdHint: null,
      toolNameHint: null,
      reasonCode: "initial",
    }) as unknown as AgentContract,
  );

  const classifier = new CopilotClassifier(new FakeModelAdapter());
  const persistence = new InMemorySupervisorPersistence();

  const runtime = new SupervisorRuntime({
    model: {
      providerKey: "fake",
      modelName: "fake-copilot",
      async decide(request) {
        const { currentAgent, input, context } = request;
        const utterance = (input.utterance as string) ?? "";
        const locale = (input.locale as "en" | "ar") ?? "en";

        const runKey = context.conversationId;
        if (currentAgent === "copilot-supervisor") {
          const explicitTool = input.toolName as string | undefined;
          if (explicitTool) {
            return {
              content: JSON.stringify({
                action: "handoff",
                currentAgent: "copilot-supervisor",
                nextAgent: "platform-action-agent",
                reasonCode: "explicit_tool",
                payload: {
                  mode: "action",
                  utterance,
                  locale,
                  toolNameHint: explicitTool,
                  toolInput:
                    input.toolInput && typeof input.toolInput === "object"
                      ? (input.toolInput as Record<string, unknown>)
                      : undefined,
                },
              }),
              usage: ZERO_USAGE,
            };
          }
          const decision = await classifier.classify(utterance, locale);
          if (decision.mode === "guide") {
            const payload: Record<string, unknown> = { utterance, locale };
            if (decision.flowIdHint) payload.flowIdHint = decision.flowIdHint;
            return {
              content: JSON.stringify({
                action: "handoff",
                currentAgent: "copilot-supervisor",
                nextAgent: "platform-guide-agent",
                reasonCode: decision.reasonCode,
                payload,
              }),
              usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
            };
          }
          if (decision.mode === "action") {
            const payload: Record<string, unknown> = { mode: "action", utterance, locale };
            if (decision.toolNameHint) payload.toolNameHint = decision.toolNameHint;
            return {
              content: JSON.stringify({
                action: "handoff",
                currentAgent: "copilot-supervisor",
                nextAgent: "platform-action-agent",
                reasonCode: decision.reasonCode,
                payload,
              }),
              usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
            };
          }
          return {
            content: JSON.stringify({
              action: "complete",
              currentAgent: "copilot-supervisor",
              reasonCode: decision.reasonCode,
              result: { mode: "clarify", reasonCode: decision.reasonCode },
            }),
            usage: { promptTokens: 10, completionTokens: 10, totalTokens: 20 },
          };
        }

        if (currentAgent === "platform-guide-agent") {
          return {
            content: JSON.stringify({
              action: "complete",
              currentAgent: "platform-guide-agent",
              reasonCode: "guide_session_created",
              result: input,
            }),
            usage: ZERO_USAGE,
          };
        }

        if (currentAgent === "platform-action-agent") {
          const plan = input.actionPlan as Record<string, unknown> | undefined;
          const planHasTool =
            plan && typeof plan.toolName === "string" && plan.toolName.length > 0;

          // HEAD's runtime merges the tool output back into the current input
          // but leaves the consumed actionPlan in place, so without this guard
          // the tool_call would be re-issued forever. Match on the plan's own
          // runId so a stale entry from a prior awaiting-approval run in the
          // same conversation is never mistaken for this run's executed plan.
          const recorded = retainedByRun.get(runKey);
          const samePlan =
            planHasTool &&
            recorded &&
            typeof plan.runId === "string" &&
            plan.runId === recorded.runId;
          if (samePlan) {
            retainedByRun.delete(runKey);
            return {
              content: JSON.stringify({
                action: "complete",
                currentAgent: "platform-action-agent",
                reasonCode: "action_plan_created",
                result: input,
              }),
              usage: ZERO_USAGE,
            };
          }

          if (planHasTool) {
            retainedByRun.set(runKey, plan);
            return {
              content: JSON.stringify({
                action: "tool_call",
                currentAgent: "platform-action-agent",
                toolName: plan.toolName,
                toolInput:
                  plan.toolInput && typeof plan.toolInput === "object"
                    ? (plan.toolInput as Record<string, unknown>)
                    : {},
                reasonCode: "action_plan_tool_call",
              }),
              usage: ZERO_USAGE,
            };
          }
          return {
            content: JSON.stringify({
              action: "complete",
              currentAgent: "platform-action-agent",
              reasonCode: "action_plan_created",
              result: input,
            }),
            usage: ZERO_USAGE,
          };
        }

        throw new Error(`Unknown agent: ${currentAgent}`);
      },
    },
    workflowRegistry: createCopilotWorkflowRegistry(),
    executorRegistry,
    toolRegistry,
    persistence,
    guardrails: createDefaultSupervisorGuardrails({
      agentRegistry: executorRegistry.definitionsRegistry(),
      toolRegistry,
    }),
  });

  // HEAD's SupervisorRuntime requires the AgentRun to exist in a pending
  // state before execution; seed it from the run input on every call. The
  // instance's method is replaced so the runtime keeps its class type (the
  // call sites pass it straight into createActionPlan's typed deps).
  const originalExecute = runtime.execute.bind(runtime);
  runtime.execute = async (
    input: SupervisorRunInput,
    hooks?: Parameters<SupervisorRuntime["execute"]>[1],
  ) => {
    persistence.seedPendingRun(input.runId, input.context.tenantId);
    return originalExecute(input, hooks);
  };

  return { runtime, toolRegistry, persistence };
}

async function seedDocument() {
  const policyId = new mongoose.Types.ObjectId();
  const now = new Date();
  const doc = await DocumentModel.create({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    fileName: "policy.pdf",
    originalFileName: "policy.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
    storageKey: `documents/${tenantId}/policy.pdf`,
    checksum: "abc123",
    status: "uploaded",
    metadata: {
      title: "Remote Work Policy",
      description: null,
      tags: [],
    },
    classification: "internal",
    uploadedBy: new mongoose.Types.ObjectId(actorId),
    owner: new mongoose.Types.ObjectId(actorId),
    activePolicyId: policyId,
    activePolicyVersion: 1,
    policyChangedAt: now,
  });

  await DocumentAccessPolicyModel.create({
    tenantId: doc.tenantId,
    documentId: doc._id,
    policyId,
    policyVersion: 1,
    contractVersion: 1,
    status: "active",
    effectiveFrom: new Date(now.getTime() - 60_000),
    effectiveUntil: null,
    inherits: null,
    rules: [
      {
        ruleId: "seed-owner-rule",
        effect: "allow",
        subject: { type: "owner" },
        actions: [...DOCUMENT_ACCESS_ACTIONS],
      },
    ],
    provenance: {
      createdBy: new mongoose.Types.ObjectId(actorId),
      createdAt: now,
      reason: "Copilot supervisor test fixture",
    },
    indexMetadata: {
      policyId,
      policyVersion: 1,
      classificationId: null,
      categoryId: null,
      departmentId: null,
    },
    createdAt: now,
  });

  return doc.id;
}

function approverContext() {
  return {
    tenantId,
    actorId,
    actorEmail,
    actorRole: "COMPANY_ADMIN" as BaseRole,
    traceId: "trace-approve",
    requestId: "req-approve",
  };
}

function actionExecutionContext() {
  return {
    tenantId,
    actorId,
    actorEmail,
    actorRole: "COMPANY_ADMIN" as BaseRole,
    traceId: "trace-copilot",
    requestId: "req-copilot",
    conversationId,
    workflowId: "guider-v1" as const,
    permissions: ACTION_PERMISSIONS,
  };
}

test("Copilot supervisor decision routing", async (t) => {
  await t.test(
    "guide utterance hands off to the guide agent and completes with a GuideSession",
    async () => {
      const { runtime } = await buildRuntime();
      const result = await runtime.execute(baseRunInput("how do I upload a document?"));

      assert.equal(result.status, "completed");
      assert.equal(result.handoffsCount, 1);
      assert.ok(result.output);
      assert.equal(result.output!.mode, "guide");
      const session = result.output!.guideSession as {
        flowId: string;
        steps: unknown[];
        dir: string;
      };
      assert.equal(session.flowId, "documents.upload");
      assert.equal(session.dir, "ltr");
      assert.ok(Array.isArray(session.steps));
      assert.ok(session.steps.length > 0);
    },
  );

  await t.test(
    "a destructive action utterance awaits approval with the plan persisted",
    async () => {
      const { runtime, persistence } = await buildRuntime();
      const result = await runtime.execute(baseRunInput("delete this document"));

      assert.equal(result.status, "awaiting_approval");
      assert.equal(result.approvalsCount, 1);
      assert.equal(result.totalToolCalls, 0);

      const approval = [...persistence.approvals.values()][0];
      assert.ok(approval, "expected an approval record");
      assert.equal(approval.status, "pending");
      assert.equal(approval.requestedBy, "platform-action-agent");
      assert.equal(approval.toolCallId, null);
      assert.equal(approval.runId, result.runId);

      const context = approval.context as Record<string, unknown>;
      const plan = (context.input as Record<string, unknown>)
        .actionPlan as Record<string, unknown>;
      assert.equal(plan.toolName, "document.softDelete");
      assert.equal(plan.requiresConfirmation, true);
      assert.equal(plan.risk, "destructive");

      const run = persistence.runs.get(result.runId);
      assert.equal(run?.status, "awaiting_approval");
    },
  );

  await t.test(
    "ambiguous utterance completes in clarify mode without any handoff",
    async () => {
      const { runtime } = await buildRuntime();
      const result = await runtime.execute(baseRunInput("help me with my documents"));

      assert.equal(result.status, "completed");
      assert.equal(result.handoffsCount, 0);
      assert.ok(result.output);
      assert.equal(result.output!.mode, "clarify");
    },
  );

  await t.test(
    "a natural-language action naming an existing document resolves the target id",
    async () => {
      const documentId = await seedDocument();
      const { runtime, persistence } = await buildRuntime();
      const result = await runtime.execute(
        baseRunInput("delete the document named policy.pdf"),
      );

      assert.equal(result.status, "awaiting_approval");
      const approval = [...persistence.approvals.values()][0];
      assert.ok(approval, "expected an approval record");
      const context = approval.context as Record<string, unknown>;
      const plan = (context.input as Record<string, unknown>)
        .actionPlan as Record<string, unknown>;
      assert.equal(plan.toolName, "document.softDelete");
      const toolInput = plan.toolInput as Record<string, unknown>;
      assert.equal(toolInput.documentId, documentId, "documentId must be resolved from the utterance");
      const target = plan.target as { type: string; id: string; label: string } | null;
      assert.ok(target, "expected a resolved action target");
      assert.equal(target.type, "document");
      assert.equal(target.id, documentId);
    },
  );

  await t.test(
    "a natural-language action naming a missing document fails with TARGET_NOT_FOUND",
    async () => {
      const { runtime } = await buildRuntime();
      const result = await runtime.execute(
        baseRunInput("delete the document named missing.pdf"),
      );

      assert.equal(result.status, "failed");
      assert.ok(result.error, "expected a run error");
      assert.equal(result.error.code, "TARGET_NOT_FOUND");
      assert.match(String(result.error.message ?? ""), /missing\.pdf/);
    },
  );

  await t.test(
    "an explicit tool_call executes a low-risk tool and completes with the result",
    async () => {
      const { runtime } = await buildRuntime();
      const input = baseRunInput("run it");
      (input.input as Record<string, unknown>).toolName = "document.search";
      (input.input as Record<string, unknown>).toolInput = { search: "contracts" };
      const result = await runtime.execute(input);

      assert.equal(result.status, "completed");
      assert.ok(result.output);
      const toolResult = result.output!.documents as unknown[] | undefined;
      assert.ok(Array.isArray(toolResult), "expected the raw search result");
    },
  );

  await t.test(
    "an explicit approval-required tool awaits approval and keeps toolInput",
    async () => {
      const documentId = await seedDocument();
      const { runtime, persistence } = await buildRuntime();
      const input = baseRunInput("run it");
      (input.input as Record<string, unknown>).toolName = "document.softDelete";
      (input.input as Record<string, unknown>).toolInput = {
        documentId,
      };
      const result = await runtime.execute(input);

      assert.equal(result.status, "awaiting_approval");
      assert.equal(result.totalToolCalls, 0);

      const approval = [...persistence.approvals.values()][0];
      assert.ok(approval);
      const context = approval.context as Record<string, unknown>;
      const plan = (context.input as Record<string, unknown>)
        .actionPlan as Record<string, unknown>;
      assert.equal(plan.toolName, "document.softDelete");
      const toolInput = plan.toolInput as Record<string, unknown>;
      assert.equal(toolInput.documentId, documentId);
      const target = plan.target as { type: string; id: string; label: string } | null;
      assert.ok(target, "expected a resolved action target");
      assert.equal(target.type, "document");
      assert.equal(target.id, documentId);
      assert.equal(target.label, "Remote Work Policy");
    },
  );

  await t.test(
    "confirm(approve) executes the approved tool and completes the run",
    async () => {
      const documentId = await seedDocument();
      const { runtime, persistence, toolRegistry } = await buildRuntime();

      const input = baseRunInput("run it");
      (input.input as Record<string, unknown>).toolName = "document.softDelete";
      (input.input as Record<string, unknown>).toolInput = { documentId };
      const result = await runtime.execute(input);
      assert.equal(result.status, "awaiting_approval");

      const approval = [...persistence.approvals.values()][0];
      assert.ok(approval);

      const run = await resumeCopilotAction(
        result.runId,
        { decision: "approve", approvalId: approval.id },
        approverContext(),
        { persistence, toolRegistry },
      );

      assert.equal(run.status, "completed");
      assert.equal(run.output?.success, true);

      const resolved = persistence.approvals.get(approval.id);
      assert.equal(resolved?.status, "approved");

      const doc = await DocumentModel.findById(documentId).lean().exec();
      assert.ok(doc?.deletedAt, "document should be soft-deleted after approval");

      const executedAudit = await AuditLogModel.findOne({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        action: "COPILOT_ACTION_EXECUTED",
        resourceId: result.runId,
      })
        .lean()
        .exec();
      assert.ok(executedAudit, "expected a COPILOT_ACTION_EXECUTED audit row");
      assert.equal(executedAudit.metadata?.source, "copilot");
      assert.equal(executedAudit.changes?.toolName, "document.softDelete");
      assert.equal(executedAudit.actorKind, "USER");
    },
  );

  await t.test(
    "confirm(reject) fails the run without executing the tool",
    async () => {
      const documentId = await seedDocument();
      const { runtime, persistence, toolRegistry } = await buildRuntime();

      const input = baseRunInput("run it");
      (input.input as Record<string, unknown>).toolName = "document.softDelete";
      (input.input as Record<string, unknown>).toolInput = { documentId };
      const result = await runtime.execute(input);
      assert.equal(result.status, "awaiting_approval");

      const approval = [...persistence.approvals.values()][0];
      assert.ok(approval);

      const run = await resumeCopilotAction(
        result.runId,
        { decision: "reject", approvalId: approval.id },
        approverContext(),
        { persistence, toolRegistry },
      );

      assert.equal(run.status, "failed");
      assert.equal(run.error?.message, "Approval rejected by user");

      const resolved = persistence.approvals.get(approval.id);
      assert.equal(resolved?.status, "rejected");

      const doc = await DocumentModel.findById(documentId).lean().exec();
      assert.equal(doc?.deletedAt ?? null, null, "document must not be touched");

      const rejectedAudit = await AuditLogModel.findOne({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        action: "COPILOT_ACTION_REJECTED",
        resourceId: result.runId,
      })
        .lean()
        .exec();
      assert.ok(rejectedAudit, "expected a COPILOT_ACTION_REJECTED audit row");
      assert.equal(rejectedAudit.metadata?.source, "copilot");
      assert.equal(rejectedAudit.actorKind, "USER");
    },
  );

  await t.test(
    "confirm on an already-resolved approval is rejected",
    async () => {
      const documentId = await seedDocument();
      const { runtime, persistence, toolRegistry } = await buildRuntime();
      const input = baseRunInput("run it");
      (input.input as Record<string, unknown>).toolName = "document.softDelete";
      (input.input as Record<string, unknown>).toolInput = {
        documentId,
      };
      const result = await runtime.execute(input);
      assert.equal(result.status, "awaiting_approval");

      const approval = [...persistence.approvals.values()][0];
      assert.ok(approval);

      await resumeCopilotAction(
        result.runId,
        { decision: "reject", approvalId: approval.id },
        approverContext(),
        { persistence, toolRegistry },
      );

      await assert.rejects(
        resumeCopilotAction(
          result.runId,
          { decision: "approve", approvalId: approval.id },
          approverContext(),
          { persistence, toolRegistry },
        ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.match(error.message, /Approval is not pending/);
          return true;
        },
      );
    },
  );
});

test("POST /copilot/action idempotency", async (t) => {
  await t.test(
    "a duplicate Idempotency-Key no-ops and replays the original plan/approval",
    async () => {
      const documentId = await seedDocument();
      const { runtime, persistence } = await buildRuntime();
      const context = actionExecutionContext();
      const input = {
        utterance: "delete this document",
        toolName: "document.softDelete",
        toolInput: { documentId },
      };
      const deps = { runtime, persistence };

      const first = await createActionPlan(input, context, {
        idempotencyKey: "req-delete-1",
        deps,
      });
      assert.equal(first.toolName, "document.softDelete");
      assert.ok(first.approvalId, "expected a pending approval id");

      const second = await createActionPlan(input, context, {
        idempotencyKey: "req-delete-1",
        deps,
      });
      assert.equal(second.runId, first.runId);
      assert.equal(second.approvalId, first.approvalId);
      assert.equal(
        persistence.approvals.size,
        1,
        "duplicate request must not create a second approval",
      );

      const mapping = await CopilotActionIdempotencyModel.findOne({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        runId: first.runId,
      })
        .lean()
        .exec();
      assert.ok(mapping, "expected an idempotency mapping row");
      assert.equal(mapping!.runId, first.runId);
    },
  );

  await t.test(
    "requests without an Idempotency-Key always create a fresh run",
    async () => {
      const documentId = await seedDocument();
      const { runtime, persistence } = await buildRuntime();
      const context = actionExecutionContext();
      const input = {
        utterance: "delete this document",
        toolName: "document.softDelete",
        toolInput: { documentId },
      };
      const deps = { runtime, persistence };

      const first = await createActionPlan(input, context, { deps });
      const second = await createActionPlan(input, context, { deps });

      assert.notEqual(first.runId, second.runId);
      assert.notEqual(first.approvalId, second.approvalId);
      assert.equal(persistence.approvals.size, 2);
    },
  );

  await t.test(
    "a duplicate Idempotency-Key after approval still replays the same run",
    async () => {
      const documentId = await seedDocument();
      const { runtime, persistence, toolRegistry } = await buildRuntime();
      const context = actionExecutionContext();
      const input = {
        utterance: "delete this document",
        toolName: "document.softDelete",
        toolInput: { documentId },
      };
      const deps = { runtime, persistence };

      const plan = await createActionPlan(input, context, {
        idempotencyKey: "req-delete-2",
        deps,
      });
      assert.ok(plan.approvalId);

      await resumeCopilotAction(
        plan.runId,
        { decision: "approve", approvalId: plan.approvalId! },
        approverContext(),
        { persistence, toolRegistry },
      );

      const replay = await createActionPlan(input, context, {
        idempotencyKey: "req-delete-2",
        deps,
      });
      assert.equal(replay.runId, plan.runId, "replay must reference the original run");

      const doc = await DocumentModel.findById(documentId).lean().exec();
      assert.ok(doc?.deletedAt, "the tool must have executed exactly once");
    },
  );
});

test("createActionPlan AgentRun lifecycle", async (t) => {
  await t.test(
    "the Mongo-persisted AgentRun _id is the runId handed to runtime.execute",
    async () => {
      const documentId = await seedDocument();
      const { runtime, persistence } = await buildRuntime();
      const context = actionExecutionContext();
      const input = {
        utterance: "delete this document",
        toolName: "document.softDelete",
        toolInput: { documentId },
      };
      const deps = { runtime, persistence };

      // Capture the runId the runtime actually received. Before the P0 fix,
      // createActionPlan minted its own ObjectId, so the id executed here did
      // not match the Mongo-persisted AgentRun `_id` and the lookup below
      // returned null (the production 409).
      let executedRunId: string | null = null;
      const originalExecute = runtime.execute.bind(runtime);
      runtime.execute = async (
        runInput: SupervisorRunInput,
        hooks?: Parameters<SupervisorRuntime["execute"]>[1],
      ) => {
        executedRunId = runInput.runId;
        return originalExecute(runInput, hooks);
      };

      const plan = await createActionPlan(input, context, { deps });

      assert.ok(executedRunId, "runtime.execute must have been called");
      assert.equal(
        plan.runId,
        executedRunId,
        "plan must reference the executed run id",
      );

      const persisted = await AgentRunModel.findById(executedRunId)
        .lean()
        .exec();
      assert.ok(
        persisted,
        "executed runId must be a Mongo-persisted AgentRun _id",
      );
      // The run was persisted as pending by createRun under the executed id,
      // which is exactly the precondition SupervisorRuntime.startRun requires.
      assert.equal(persisted.status, "pending");
    },
  );
});
