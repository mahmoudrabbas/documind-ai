import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import SubscriptionModel from "../../../db/models/subscription.model.js";
import PackageModel from "../../../db/models/package.model.js";
import DocumentModel from "../../../db/models/document.model.js";
import DocumentAccessPolicyModel from "../../../db/models/documentAccessPolicy.model.js";
import AuditLogModel from "../../../db/models/auditLog.model.js";
import AgentRunModel from "../../../db/models/agentRun.model.js";
import CopilotActionIdempotencyModel from "../idempotency/actionIdempotency.model.js";
import CopilotActionDraftModel from "../draft/actionDraft.model.js";
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
import { runCopilotAction } from "../copilot.service.js";
import { createCopilotRunHooks, missingFieldsFromIssues } from "../copilotComposition.js";
import {
  answerActionDraft,
  cancelActionDraft,
  createActionDraft,
  type ActionDraftDeps,
} from "../draft/actionDraft.service.js";
import type { ActionDraft } from "../action/action.contracts.js";
import { ACTION_ANSWER_INVALID, ACTION_NEEDS_INPUT, ACTION_DRAFT_NOT_FOUND } from "../../../common/errors/errorCodes.js";
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
  "roles:create",
];

const TEST_PASSWORD = "StrongPass123!";

let mongoServer: MongoMemoryReplSet | null = null;

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "copilot-action-draft-test" });
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
      dbName: "copilot-action-draft-test",
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
let actorBId: string;
let conversationId: string;

async function createUser(tenant: string, email: string, name: string) {
  return UserModel.create({
    tenantId: new mongoose.Types.ObjectId(tenant),
    name,
    email,
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
}

async function seedActors() {
  const tenant = await TenantModel.create({
    name: "Draft Corp",
    slug: "draft-corp",
    status: "active",
    plan: "free",
  });
  tenantId = tenant.id;

  const actor = await createUser(tenant.id, "draft@intent.com", "Draft User");
  actorId = actor.id;
  actorEmail = actor.email;

  const actorB = await createUser(tenant.id, "draft-b@intent.com", "Draft User B");
  actorBId = actorB.id;
}

async function seedSubscription() {
  const pkg = await PackageModel.create({
    name: "Draft Plan",
    code: "draft-plan",
    version: 1,
    monthlyPrice: 0,
    annualPrice: 0,
    currency: "USD",
    trialDays: 0,
    visibility: "public",
    active: true,
    entitlements: {
      employees: 10,
      admins: 2,
      documents: 500,
      storageMb: 1024,
      fileSizeMb: 25,
      queriesPerMonth: 5000,
      tokensPerMonth: 100000,
      ocrPagesPerMonth: 100,
    },
    versions: [
      {
        version: 1,
        name: "Draft Plan",
        code: "draft-plan",
        monthlyPrice: 0,
        annualPrice: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
        entitlements: {
          employees: 1,
          admins: 2,
          documents: 500,
          storageMb: 1024,
          fileSizeMb: 25,
          queriesPerMonth: 5000,
          tokensPerMonth: 100000,
          ocrPagesPerMonth: 100,
        },
      },
    ],
    supportedModels: ["basic"],
    analyticsLevel: "basic",
    retentionDays: 90,
    supportLevel: "community",
  });
  await SubscriptionModel.create({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    packageId: pkg._id,
    packageVersion: 1,
    status: "ACTIVE",
    startedAt: new Date(),
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    paymentState: "paid",
    billingInterval: "monthly",
  });
}

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await SubscriptionModel.deleteMany({});
  await PackageModel.deleteMany({});
  await DocumentModel.deleteMany({});
  await DocumentAccessPolicyModel.deleteMany({});
  await AuditLogModel.deleteMany({});
  await AgentRunModel.deleteMany({});
  await CopilotActionDraftModel.deleteMany({});
  await CopilotActionIdempotencyModel.deleteMany({});
  await seedActors();
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
      requestId: "req-draft",
      traceId: "trace-draft",
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
            return {
              content: JSON.stringify({
                action: "handoff",
                currentAgent: "copilot-supervisor",
                nextAgent: "platform-guide-agent",
                reasonCode: decision.reasonCode,
                payload: { utterance, locale },
              }),
              usage: ZERO_USAGE,
            };
          }
          return {
            content: JSON.stringify({
              action: "complete",
              currentAgent: "copilot-supervisor",
              reasonCode: decision.reasonCode,
              result: { mode: "clarify", reasonCode: decision.reasonCode },
            }),
            usage: ZERO_USAGE,
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

function draftDeps(registry: ToolRegistry): ActionDraftDeps {
  return {
    validate: (toolInput, toolName) => {
      const tool = registry.get(toolName);
      if (!tool) return { ok: false, missing: [] };
      const parsed = tool.schema.inputSchema.safeParse(toolInput);
      if (parsed.success) return { ok: true, missing: [] };
      return { ok: false, missing: missingFieldsFromIssues(parsed.error) };
    },
    schemaFields: {},
  };
}

async function seedDocument(title = "Remote Work Policy", fileName = "policy.pdf") {
  const policyId = new mongoose.Types.ObjectId();
  const now = new Date();
  const doc = await DocumentModel.create({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    fileName,
    originalFileName: fileName,
    fileSize: 1024,
    mimeType: "application/pdf",
    storageKey: `documents/${tenantId}/${fileName}`,
    checksum: "abc123",
    status: "uploaded",
    metadata: {
      title,
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
      reason: "Action draft test fixture",
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

function actionExecutionContext() {
  return {
    tenantId,
    actorId,
    actorEmail,
    actorRole: "COMPANY_ADMIN" as BaseRole,
    traceId: "trace-draft",
    requestId: "req-draft",
    conversationId,
    workflowId: "guider-v1" as const,
    permissions: ACTION_PERMISSIONS,
  };
}

function assertDraftQuestion(
  draft: ActionDraft | null,
  field: string,
): void {
  assert.ok(draft, "expected a draft");
  assert.equal(draft.question?.field, field);
}

test("resolveToolInput hook", async (t) => {
  await t.test(
    "throws ACTION_NEEDS_INPUT with the missing fields when the tool input is incomplete",
    async () => {
      const { runtime, toolRegistry } = await buildRuntime();
      const input = baseRunInput("run it");
      (input.input as Record<string, unknown>).toolName = "document.updateMetadata";
      (input.input as Record<string, unknown>).toolInput = {};
      const result = await runtime.execute(input, {
        ...createCopilotRunHooks(toolRegistry),
      });

      assert.equal(result.status, "failed");
      assert.equal(result.error?.code, ACTION_NEEDS_INPUT);
      const details = JSON.parse(String(result.error?.message)) as {
        toolName: string;
        missing: string[];
      };
      assert.equal(details.toolName, "document.updateMetadata");
      assert.ok(details.missing.includes("documentId"));
      assert.ok(details.missing.includes("changes"));
    },
  );

  await t.test(
    "enriches a complete tool input and lets the run execute",
    async () => {
      const documentId = await seedDocument();
      const { runtime, toolRegistry, persistence } = await buildRuntime();
      const input = baseRunInput("run it");
      (input.input as Record<string, unknown>).toolName = "document.updateMetadata";
      (input.input as Record<string, unknown>).toolInput = {
        documentId,
        title: "Renamed Policy",
      };
      const result = await runtime.execute(input, {
        ...createCopilotRunHooks(toolRegistry),
      });

      assert.equal(result.status, "completed");
      const doc = await DocumentModel.findById(documentId).lean().exec();
      assert.equal(doc?.metadata?.title, "Renamed Policy");
      assert.equal(persistence.runs.get(result.runId)?.status, "completed");
    },
  );
});

test("action draft lifecycle", async (t) => {
  await t.test(
    "walks a user.invite draft through text, email, and enum questions",
    async () => {
      const { toolRegistry } = await buildRuntime();
      const deps = draftDeps(toolRegistry);

      const draft = await createActionDraft({
        toolName: "user.invite",
        toolInput: {},
        utterance: "invite someone",
        locale: "en",
        tenantId,
        actorId,
        missing: ["name", "email", "role"],
        deps,
      });

      assertDraftQuestion(draft, "name");
      assert.equal(draft.questionsRemaining, 3);
      assert.deepEqual(draft.answered, []);
      assert.equal(draft.summary, "invite someone");

      const afterName = await answerActionDraft({
        draftId: draft.draftId,
        answer: "Sara Ali",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterName.completed);
      assertDraftQuestion(afterName.draft, "email");

      const afterEmail = await answerActionDraft({
        draftId: draft.draftId,
        answer: "sara@company.com",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterEmail.completed);
      assertDraftQuestion(afterEmail.draft, "role");

      const finished = await answerActionDraft({
        draftId: draft.draftId,
        answer: "Employee",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(finished.completed);
      if (!finished.completed) return;
      assert.deepEqual(finished.toolInput, {
        name: "Sara Ali",
        email: "sara@company.com",
        role: "EMPLOYEE",
      });

      const persisted = await CopilotActionDraftModel.findById(draft.draftId)
        .lean()
        .exec();
      assert.equal(persisted?.status, "completed");
      assert.equal(persisted?.answered.length, 3);
    },
  );

  await t.test(
    "matches an enum answer by option label or value",
    async () => {
      const { toolRegistry } = await buildRuntime();
      const deps = draftDeps(toolRegistry);
      const draft = await createActionDraft({
        toolName: "user.invite",
        toolInput: { name: "Omar", email: "omar@company.com" },
        utterance: "invite Omar",
        locale: "en",
        tenantId,
        actorId,
        missing: ["role"],
        deps,
      });
      assertDraftQuestion(draft, "role");
      assert.deepEqual(draft.question?.options, [
        { value: "COMPANY_ADMIN", label: "Company Admin" },
        { value: "EMPLOYEE", label: "Employee" },
      ]);

      const finished = await answerActionDraft({
        draftId: draft.draftId,
        answer: "Company Admin",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(finished.completed);
      if (!finished.completed) return;
      assert.equal(finished.toolInput.role, "COMPANY_ADMIN");
    },
  );

  await t.test(
    "rejects an invalid answer and gives up after MAX_QUESTION_RETRIES",
    async () => {
      const { toolRegistry } = await buildRuntime();
      const deps = draftDeps(toolRegistry);
      const draft = await createActionDraft({
        toolName: "user.invite",
        toolInput: { name: "Omar" },
        utterance: "invite Omar",
        locale: "en",
        tenantId,
        actorId,
        missing: ["email", "role"],
        deps,
      });
      assertDraftQuestion(draft, "email");

      for (let attempt = 0; attempt < 3; attempt++) {
        const result = await answerActionDraft({
          draftId: draft.draftId,
          answer: "this is not an email",
          tenantId,
          actorId,
          deps,
        });
        assert.ok(!result.completed, "invalid answers must keep the draft open");
        assertDraftQuestion(result.draft, "email");
      }

      await assert.rejects(
        answerActionDraft({
          draftId: draft.draftId,
          answer: "still not an email",
          tenantId,
          actorId,
          deps,
        }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal((error as { code?: string }).code, ACTION_ANSWER_INVALID);
          return true;
        },
      );

      const persisted = await CopilotActionDraftModel.findById(draft.draftId)
        .lean()
        .exec();
      // The final throw happens before the incremented retry counter is saved,
      // so the persisted counter reflects only the saved invalid attempts.
      assert.equal(persisted?.retries, 3);
    },
  );

  await t.test(
    "collects a settings patch and finalizes the draft",
    async () => {
      const { toolRegistry } = await buildRuntime();
      const deps = draftDeps(toolRegistry);

      const draft = await createActionDraft({
        toolName: "settings.update",
        toolInput: {},
        utterance: "change the company settings",
        locale: "en",
        tenantId,
        actorId,
        missing: ["settings"],
        deps,
      });
      assertDraftQuestion(draft, "settings");

      const finished = await answerActionDraft({
        draftId: draft.draftId,
        answer: "change the company name to Acme",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(finished.completed);
      if (!finished.completed) return;
      assert.deepEqual(finished.toolInput, {
        settings: { profile: { companyName: "acme" } },
      });
    },
  );

  await t.test(
    "walks a roles.create draft through name, baseRole, grants and scope questions",
    async () => {
      const { toolRegistry } = await buildRuntime();
      const deps = draftDeps(toolRegistry);

      const draft = await createActionDraft({
        toolName: "roles.create",
        toolInput: {},
        utterance: "create a role",
        locale: "en",
        tenantId,
        actorId,
        missing: ["name", "baseRole", "grants"],
        deps,
      });
      assertDraftQuestion(draft, "name");

      const afterName = await answerActionDraft({
        draftId: draft.draftId,
        answer: "HR Manager",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterName.completed, "draft must ask for the base role next");
      assertDraftQuestion(afterName.draft, "baseRole");
      assert.deepEqual(afterName.draft.question?.options, [
        { value: "COMPANY_ADMIN", label: "Company Admin" },
        { value: "EMPLOYEE", label: "Employee" },
      ]);

      const afterRole = await answerActionDraft({
        draftId: afterName.draft.draftId,
        answer: "Company Admin",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterRole.completed, "draft must ask for the grants next");
      assertDraftQuestion(afterRole.draft, "grants");

      const afterGrants = await answerActionDraft({
        draftId: afterRole.draft.draftId,
        answer: "view users and edit documents only their own data",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterGrants.completed, "unscoped grants must keep the draft open");
      assertDraftQuestion(afterGrants.draft, "grants");
      const scopeMessage = afterGrants.draft.message ?? "";
      assert.match(scopeMessage, /View Users/);
      assert.match(scopeMessage, /everything/);

      const afterScope = await answerActionDraft({
        draftId: afterGrants.draft.draftId,
        answer: "their own data",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterScope.completed, "scope answer must re-ask for more grants");
      assertDraftQuestion(afterScope.draft, "grants");
      assert.match(afterScope.draft.message ?? "", /anything else/i);

      const finished = await answerActionDraft({
        draftId: afterScope.draft.draftId,
        answer: "that's all",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(finished.completed);
      if (!finished.completed) return;
      assert.deepEqual(finished.toolInput, {
        name: "HR Manager",
        baseRole: "COMPANY_ADMIN",
        grants: [
          {
            permission: "documents:update",
            scopes: {
              selfOnly: true,
              departmentIds: [],
              documentCategories: [],
              documentClassifications: [],
            },
          },
          {
            permission: "users:read",
            scopes: {
              selfOnly: true,
              departmentIds: [],
              documentCategories: [],
              documentClassifications: [],
            },
          },
        ],
      });
    },
  );

  await t.test(
    "resolves a scope answer that echoes a permission keyword without looping",
    async () => {
      const { toolRegistry } = await buildRuntime();
      const deps = draftDeps(toolRegistry);

      const draft = await createActionDraft({
        toolName: "roles.create",
        toolInput: {},
        utterance: "create a role",
        locale: "en",
        tenantId,
        actorId,
        missing: ["name", "baseRole", "grants"],
        deps,
      });

      const afterName = await answerActionDraft({
        draftId: draft.draftId,
        answer: "HR Manager",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterName.completed, "the name answer leaves grants pending");
      const afterRole = await answerActionDraft({
        draftId: afterName.draft.draftId,
        answer: "Employee",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterRole.completed, "the base-role answer leaves grants pending");

      const afterGrants = await answerActionDraft({
        draftId: afterRole.draft.draftId,
        answer: "view users, edit documents, view analytics",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterGrants.completed, "scoped grants keep the draft open");
      // Consolidated prompt lists every pending scoped grant at once.
      const scopeMessage = afterGrants.draft.message ?? "";
      assert.match(scopeMessage, /Edit Documents/);
      assert.match(scopeMessage, /View Analytics/);

      // "all analytics" must resolve analytics without re-asking it forever.
      const afterKeyword = await answerActionDraft({
        draftId: afterGrants.draft.draftId,
        answer: "all analytics",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterKeyword.completed);
      // analytics was resolved: the next prompt must not re-ask View Analytics,
      // it should move on to the remaining scoped grant (Edit Documents).
      assert.doesNotMatch(
        afterKeyword.draft.message ?? "",
        /View Analytics/,
        "analytics must no longer be asked after resolution",
      );
      assert.match(afterKeyword.draft.message ?? "", /Edit Documents/);

      // Finish the remaining grant, then end the list.
      const afterEverything = await answerActionDraft({
        draftId: afterKeyword.draft.draftId,
        answer: "everything",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterEverything.completed, "the list is still open until it is ended");
      assert.match(afterEverything.draft.message ?? "", /anything else/i);

      const finished = await answerActionDraft({
        draftId: afterEverything.draft.draftId,
        answer: "that's all",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(finished.completed);
      if (!finished.completed) return;
      const finishedGrants = (finished.toolInput?.grants ?? []) as {
        permission: string;
      }[];
      assert.ok(
        finishedGrants.some((g) => g.permission === "analytics:read"),
        "analytics:read must be present in the final grants",
      );
      assert.ok(
        finishedGrants.some((g) => g.permission === "documents:update"),
        "documents:update must be present in the final grants",
      );
    },
  );

  await t.test(
    "resolves grants with an explicit everything answer without re-asking",
    async () => {
      const { toolRegistry } = await buildRuntime();
      const deps = draftDeps(toolRegistry);

      const draft = await createActionDraft({
        toolName: "roles.create",
        toolInput: {},
        utterance: "create a role",
        locale: "en",
        tenantId,
        actorId,
        missing: ["name", "baseRole", "grants"],
        deps,
      });
      assertDraftQuestion(draft, "name");

      const afterName = await answerActionDraft({
        draftId: draft.draftId,
        answer: "Auditor",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterName.completed);
      const afterRole = await answerActionDraft({
        draftId: afterName.draft.draftId,
        answer: "Employee",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterRole.completed);
      const afterGrants = await answerActionDraft({
        draftId: afterRole.draft.draftId,
        answer: "view users, everything",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterGrants.completed);
      assertDraftQuestion(afterGrants.draft, "grants");
      assert.match(afterGrants.draft.message ?? "", /anything else/i);

      const finished = await answerActionDraft({
        draftId: afterGrants.draft.draftId,
        answer: "that's all",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(finished.completed);
      if (!finished.completed) return;
      assert.deepEqual(finished.toolInput, {
        name: "Auditor",
        baseRole: "EMPLOYEE",
        grants: [{ permission: "users:read" }],
      });
    },
  );

  await t.test(
    "rejects garbage and non-delegable permissions in the grants answer",
    async () => {
      const { toolRegistry } = await buildRuntime();
      const deps = draftDeps(toolRegistry);

      const draft = await createActionDraft({
        toolName: "roles.create",
        toolInput: {},
        utterance: "create a role",
        locale: "en",
        tenantId,
        actorId,
        missing: ["name", "baseRole", "grants"],
        deps,
      });
      assertDraftQuestion(draft, "name");
      const afterName = await answerActionDraft({
        draftId: draft.draftId,
        answer: "Auditor",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterName.completed);
      const afterRole = await answerActionDraft({
        draftId: afterName.draft.draftId,
        answer: "Employee",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterRole.completed);

      const garbage = await answerActionDraft({
        draftId: afterRole.draft.draftId,
        answer: "hello there",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!garbage.completed, "garbage must keep the draft open");
      assert.match(garbage.draft.message ?? "", /couldn't find any permissions/i);

      const nonDelegable = await answerActionDraft({
        draftId: garbage.draft.draftId,
        answer: "view users and delete users",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!nonDelegable.completed);
      const message = nonDelegable.draft.message ?? "";
      assert.match(message, /can't be delegated/);
      assert.match(message, /Remove Users/);

      const finished = await answerActionDraft({
        draftId: nonDelegable.draft.draftId,
        answer: "that's all",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(finished.completed);
      if (!finished.completed) return;
      assert.deepEqual(finished.toolInput, {
        name: "Auditor",
        baseRole: "EMPLOYEE",
        grants: [{ permission: "users:read" }],
      });
    },
  );

  await t.test(
    "rejects an invalid role name and keeps the draft open",
    async () => {
      const { toolRegistry } = await buildRuntime();
      const deps = draftDeps(toolRegistry);

      const draft = await createActionDraft({
        toolName: "roles.create",
        toolInput: {},
        utterance: "create a role",
        locale: "en",
        tenantId,
        actorId,
        missing: ["name", "baseRole"],
        deps,
      });
      assertDraftQuestion(draft, "name");

      const rejected = await answerActionDraft({
        draftId: draft.draftId,
        answer: "a",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!rejected.completed, "an invalid name must keep the draft open");
      assertDraftQuestion(rejected.draft, "name");
      const rejectedMessage = rejected.draft.message ?? "";
      assert.ok(rejectedMessage.length > 0, "draft must carry a friendly message");
      assert.match(rejectedMessage, /2-50 characters/);

      const reserved = await answerActionDraft({
        draftId: rejected.draft.draftId,
        answer: "Super Admin",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!reserved.completed, "reserved names must keep the draft open");
      assert.match(reserved.draft.message ?? "", /reserved/);
    },
  );

  await t.test(
    "resolves a document target by name and parses a metadata change",
    async () => {
      const documentId = await seedDocument();
      const { toolRegistry } = await buildRuntime();
      const deps = draftDeps(toolRegistry);

      const draft = await createActionDraft({
        toolName: "document.updateMetadata",
        toolInput: {},
        utterance: "update the document",
        locale: "en",
        tenantId,
        actorId,
        missing: ["documentId", "changes"],
        deps,
      });
      assertDraftQuestion(draft, "documentId");

      const afterTarget = await answerActionDraft({
        draftId: draft.draftId,
        answer: "the document named policy.pdf",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterTarget.completed);
      assertDraftQuestion(afterTarget.draft, "changes");
      assert.equal(
        afterTarget.draft.answered.find((entry) => entry.field === "documentId")
          ?.value,
        "policy.pdf",
      );

      const finished = await answerActionDraft({
        draftId: draft.draftId,
        answer: "title: New Title",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(finished.completed);
      if (!finished.completed) return;
      assert.equal(finished.toolInput.documentId, documentId);
      assert.equal(finished.toolInput.title, "New Title");
    },
  );

  await t.test(
    "surfaces a message when the answered document name does not match anything",
    async () => {
      const { toolRegistry } = await buildRuntime();
      const deps = draftDeps(toolRegistry);
      const draft = await createActionDraft({
        toolName: "document.updateMetadata",
        toolInput: {},
        utterance: "update the document",
        locale: "en",
        tenantId,
        actorId,
        missing: ["documentId", "changes"],
        deps,
      });
      assertDraftQuestion(draft, "documentId");

      const result = await answerActionDraft({
        draftId: draft.draftId,
        answer: "rules",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!result.completed, "an unmatched name must keep the draft open");
      assertDraftQuestion(result.draft, "documentId");
      assert.ok(
        result.draft.message,
        "the draft must carry feedback for the failed answer",
      );
      assert.match(result.draft.message!, /couldn't find a matching document/i);
    },
  );

  await t.test(
    "resolves a bare-word document name without quotes or file extension",
    async () => {
      const documentId = await seedDocument();
      const { toolRegistry } = await buildRuntime();
      const deps = draftDeps(toolRegistry);
      const draft = await createActionDraft({
        toolName: "document.updateMetadata",
        toolInput: {},
        utterance: "update the document",
        locale: "en",
        tenantId,
        actorId,
        missing: ["documentId", "changes"],
        deps,
      });
      assertDraftQuestion(draft, "documentId");

      const afterTarget = await answerActionDraft({
        draftId: draft.draftId,
        answer: "policy",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(!afterTarget.completed);
      assertDraftQuestion(afterTarget.draft, "changes");
      assert.equal(
        afterTarget.draft.answered.find((entry) => entry.field === "documentId")
          ?.value,
        "policy",
      );

      const finished = await answerActionDraft({
        draftId: draft.draftId,
        answer: "title: New Title",
        tenantId,
        actorId,
        deps,
      });
      assert.ok(finished.completed);
      if (!finished.completed) return;
      assert.equal(finished.toolInput.documentId, documentId);
    },
  );

  await t.test(
    "a draft is scoped to its tenant+actor and cannot be answered by another user",
    async () => {
      const { toolRegistry } = await buildRuntime();
      const deps = draftDeps(toolRegistry);
      const draft = await createActionDraft({
        toolName: "user.invite",
        toolInput: {},
        utterance: "invite someone",
        locale: "en",
        tenantId,
        actorId,
        missing: ["name", "email", "role"],
        deps,
      });

      await assert.rejects(
        answerActionDraft({
          draftId: draft.draftId,
          answer: "Impostor",
          tenantId,
          actorId: actorBId,
          deps,
        }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(
            (error as { code?: string }).code,
            ACTION_DRAFT_NOT_FOUND,
          );
          return true;
        },
      );

      await cancelActionDraft({ draftId: draft.draftId, tenantId, actorId });
      await assert.rejects(
        answerActionDraft({
          draftId: draft.draftId,
          answer: "Sara",
          tenantId,
          actorId,
          deps,
        }),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(
            (error as { code?: string }).code,
            ACTION_DRAFT_NOT_FOUND,
          );
          return true;
        },
      );
    },
  );
});

test("runCopilotAction with a completed draft", async (t) => {
  await t.test(
    "a low-risk action with complete input executes immediately and returns a result",
    async () => {
      const documentId = await seedDocument();
      const { runtime, persistence, toolRegistry } = await buildRuntime();

      const outcome = await runCopilotAction(
        {
          utterance: "update the document",
          toolName: "document.updateMetadata",
          toolInput: { documentId, title: "After Draft Title" },
          locale: "en",
        },
        actionExecutionContext(),
        { deps: { runtime, persistence, toolRegistry } },
      );

      assert.equal(outcome.approvalId, undefined);
      assert.ok(outcome.result, "low-risk actions must return a result");
      assert.equal(outcome.result!.status, "completed");
      assert.equal(outcome.result!.toolName, "document.updateMetadata");

      const doc = await DocumentModel.findById(documentId).lean().exec();
      assert.equal(doc?.metadata?.title, "After Draft Title");
    },
  );

  await t.test(
    "user.invite result message names the invited person and the seat is consumed",
    async () => {
      await seedSubscription();
      const { runtime, persistence, toolRegistry } = await buildRuntime();

      const outcome = await runCopilotAction(
        {
          utterance: "invite Sara Ali",
          toolName: "user.invite",
          toolInput: {
            name: "Sara Ali",
            email: "sara-named@company.com",
            role: "EMPLOYEE",
          },
          locale: "en",
        },
        actionExecutionContext(),
        { deps: { runtime, persistence, toolRegistry } },
      );

      assert.equal(outcome.approvalId, undefined);
      assert.ok(outcome.result, "user.invite must return a result");
      assert.equal(outcome.result!.status, "completed");
      assert.equal(outcome.result!.toolName, "user.invite");
      assert.match(outcome.result!.message, /Sara Ali/);
      assert.match(outcome.result!.message, /sara-named@company.com/);
      assert.match(outcome.result!.message, /as employee/i);

      const invited = await UserModel.findOne({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        email: "sara-named@company.com",
      })
        .lean()
        .exec();
      assert.ok(invited, "the invite must create the user");

      await assert.rejects(
        runCopilotAction(
          {
            utterance: "invite someone else",
            toolName: "user.invite",
            toolInput: {
              name: "Second User",
              email: "second@company.com",
              role: "EMPLOYEE",
            },
            locale: "en",
          },
          {
            ...actionExecutionContext(),
            requestId: "req-second-invite",
          },
          { deps: { runtime, persistence, toolRegistry } },
        ),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal((error as { code?: string }).code, "ENTITLEMENT_EXCEEDED");
          return true;
        },
      );
    },
  );
});
