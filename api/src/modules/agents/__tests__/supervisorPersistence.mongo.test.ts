import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
} from "vitest";
import { z } from "zod";
import { AGENT_PROVIDER_ERROR, SUPERVISOR_DECISION_INVALID } from "../../../common/errors/errorCodes.js";
import AgentApprovalModel from "../../../db/models/agentApproval.model.js";
import AgentRunModel from "../../../db/models/agentRun.model.js";
import AgentStepModel from "../../../db/models/agentStep.model.js";
import AgentToolCallModel from "../../../db/models/agentToolCall.model.js";
import {
  completeRun,
  completeStep,
  completeToolCall,
  createRun,
  createStep,
  createToolCall,
  getRun,
  getSteps,
  getToolCalls,
} from "../agents.repository.js";
import type { ModelAdapter } from "../agents.types.js";
import { AgentExecutorRegistry } from "../agentExecutorRegistry.js";
import { createChatWorkflowRegistry } from "../chatWorkflow.js";
import { createFakeTools } from "../fakeTools.js";
import {
  ModelAdapterSupervisorDecisionModel,
  SupervisorRuntime,
  type SupervisorDecisionModel,
  type SupervisorRunInput,
} from "../supervisorRuntime.js";
import { MongoSupervisorPersistence } from "../supervisorPersistence.js";
import { ToolRegistry } from "../toolRegistry.js";

const SUP = "chat-supervisor";

// Deterministic, local-only identities. These are valid 24-hex ObjectIds used
// purely as test tenants/actors; no Tenant or User document is required because
// the agent persistence layer is scoped by the tenantId string alone.
const TENANT_A = "aaaaaaaaaaaaaaaaaaaaaaaa";
const TENANT_B = "bbbbbbbbbbbbbbbbbbbbbbbb";
const ACTOR_A = "cccccccccccccccccccccccc";
const CONVERSATION_ID = "dddddddddddddddddddddddd";
const REQUEST_ID = "req-supervisor-persistence";
const TRACE_ID = "trace-supervisor-persistence";
const QUESTION = "What is our remote work policy?";

let mongoServer: MongoMemoryReplSet | null = null;

beforeAll(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, {
      dbName: "supervisor-persistence-mongo-test",
    });
  } else {
    mongoServer = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [
        {
          launchTimeout: Number(
            process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000,
          ),
        },
      ],
    });
    await mongoose.connect(mongoServer.getUri(), {
      dbName: "supervisor-persistence-mongo-test",
    });
  }
}, 120_000);

afterAll(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
}, 120_000);

beforeEach(async () => {
  await AgentApprovalModel.deleteMany({});
  await AgentToolCallModel.deleteMany({});
  await AgentStepModel.deleteMany({});
  await AgentRunModel.deleteMany({});
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

function toolCallDecision(
  toolName: string,
  toolInput: Record<string, unknown>,
): string {
  return JSON.stringify({
    action: "tool_call",
    currentAgent: SUP,
    toolName,
    toolInput,
    reasonCode: "use-tool",
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

function baseRunInput(
  runId: string,
  overrides: Partial<SupervisorRunInput> = {},
): SupervisorRunInput {
  return {
    runId,
    workflowId: "chat-rag-v1",
    context: {
      requestId: REQUEST_ID,
      traceId: TRACE_ID,
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      actorRole: "COMPANY_ADMIN",
      actorEmail: "persistence@example.test",
      conversationId: CONVERSATION_ID,
      workflowId: "chat-rag-v1",
      permissions: ["agents:tools:echo:use"],
    },
    input: { question: QUESTION },
    ...overrides,
  };
}

function buildRuntime(
  model: SupervisorDecisionModel,
  toolRegistry?: ToolRegistry,
): SupervisorRuntime {
  const registry = new AgentExecutorRegistry();
  const registryWithFakes = new ToolRegistry();
  if (!toolRegistry) {
    for (const tool of createFakeTools()) {
      registryWithFakes.register(tool);
    }
  }
  return new SupervisorRuntime({
    model,
    workflowRegistry: createChatWorkflowRegistry(),
    executorRegistry: registry,
    toolRegistry: toolRegistry ?? registryWithFakes,
    persistence: new MongoSupervisorPersistence(),
  });
}

async function createPendingRun(): Promise<string> {
  const run = await createRun({
    tenantId: TENANT_A,
    actorId: ACTOR_A,
    workflowName: "chat-rag-v1",
    agentName: "chat-supervisor",
    input: { question: QUESTION },
    modelProvider: "fake",
    modelName: "fake-supervisor",
    promptVersion: "1.0.0",
    promptVersionId: null,
    toolVersionSnapshot: null,
    traceId: TRACE_ID,
    requestId: REQUEST_ID,
  });
  return run.id;
}

describe("MongoSupervisorPersistence backed SupervisorRuntime", () => {
  it(
    "persists one run with ordered steps and tool calls for a successful execution",
    async () => {
      const runId = await createPendingRun();
      const model = scriptedModel([
        toolCallDecision("echo", { text: "hello" }),
        completeDecision({ answer: "hello" }),
      ]);
      const runtime = buildRuntime(model);

      const result = await runtime.execute(baseRunInput(runId));

      expect(result.status).toBe("completed");
      expect(result.totalSteps).toBe(2);
      expect(result.totalToolCalls).toBe(1);

      // Exactly one AgentRun was persisted.
      expect(await AgentRunModel.countDocuments({})).toBe(1);
      const run = await AgentRunModel.findById(runId).lean();
      expect(run).toBeTruthy();
      expect(run?.status).toBe("completed");
      expect(run?.error).toBeNull();
      expect(run?.totalSteps).toBe(2);
      expect(run?.totalToolCalls).toBe(1);
      expect(run?.traceId).toBe(TRACE_ID);
      expect(run?.requestId).toBe(REQUEST_ID);

      // Ordered AgentStep records.
      const steps = await AgentStepModel.find({
        runId: new mongoose.Types.ObjectId(runId),
      })
        .sort({ stepIndex: 1 })
        .lean();
      expect(steps).toHaveLength(2);
      expect(steps.map((step) => step.stepIndex)).toEqual([0, 1]);
      expect(steps[0]?.action).toBe("tool_call");
      expect(steps[0]?.status).toBe("completed");
      expect(steps[0]?.toolCallsCount).toBe(1);
      expect(steps[1]?.action).toBe("completed");
      expect(steps[1]?.status).toBe("completed");
      expect(steps[1]?.toolCallsCount).toBe(0);

      // AgentToolCall record persisted for the executed tool.
      const toolCalls = await AgentToolCallModel.find({
        runId: new mongoose.Types.ObjectId(runId),
      }).lean();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]?.toolName).toBe("echo");
      expect(toolCalls[0]?.status).toBe("completed");

      // Correlation integrity across every persisted record.
      for (const step of steps) {
        expect(String(step.runId)).toBe(runId);
        expect(String(step.tenantId)).toBe(TENANT_A);
        expect(step.traceId).toBe(TRACE_ID);
        expect(step.requestId).toBe(REQUEST_ID);
      }
      for (const toolCall of toolCalls) {
        expect(String(toolCall.runId)).toBe(runId);
        expect(String(toolCall.stepId)).toBe(String(steps[0]?._id));
        expect(String(toolCall.tenantId)).toBe(TENANT_A);
        expect(toolCall.traceId).toBe(TRACE_ID);
        expect(toolCall.requestId).toBe(REQUEST_ID);
      }
    },
    30_000,
  );

  it(
    "marks a run failed when a tool fails, persisting the failed step and tool call",
    async () => {
      const toolRegistry = new ToolRegistry();
      toolRegistry.register({
        schema: {
          name: "explode",
          version: "1.0.0",
          description: "Fails during execution.",
          inputSchema: z.object({ trigger: z.string().optional() }),
          outputSchema: z.object({ ok: z.literal(true) }),
          approvalRequired: false,
          timeoutMs: 1_000,
          maxRetries: 0,
        },
        handler: async () => {
          throw new Error("Simulated tool runtime failure");
        },
      });

      const runId = await createPendingRun();
      const model = scriptedModel([
        toolCallDecision("explode", { trigger: "boom" }),
      ]);
      const runtime = buildRuntime(model, toolRegistry);

      const result = await runtime.execute(baseRunInput(runId));

      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe(AGENT_PROVIDER_ERROR);
      expect(result.totalSteps).toBe(1);
      expect(result.totalToolCalls).toBe(1);

      const run = await AgentRunModel.findById(runId).lean();
      expect(run).toBeTruthy();
      expect(run?.status).toBe("failed");
      expect(run?.totalSteps).toBe(1);
      expect(run?.totalToolCalls).toBe(1);
      expect((run?.error as Record<string, unknown> | null)?.code).toBe(
        AGENT_PROVIDER_ERROR,
      );

      const steps = await AgentStepModel.find({
        runId: new mongoose.Types.ObjectId(runId),
      }).lean();
      expect(steps).toHaveLength(1);
      expect(steps[0]?.action).toBe("tool_call");
      expect(steps[0]?.status).toBe("failed");
      expect(steps[0]?.toolCallsCount).toBe(1);
      expect(
        (steps[0]?.error as Record<string, unknown> | null)?.message,
      ).toBe("Simulated tool runtime failure");

      const toolCalls = await AgentToolCallModel.find({
        runId: new mongoose.Types.ObjectId(runId),
      }).lean();
      expect(toolCalls).toHaveLength(1);
      expect(toolCalls[0]?.status).toBe("failed");
      expect(
        (toolCalls[0]?.error as Record<string, unknown> | null)?.message,
      ).toBe("Simulated tool runtime failure");
    },
    30_000,
  );

  it(
    "marks a run failed on a malformed decision without persisting raw provider output",
    async () => {
      const runId = await createPendingRun();
      const model = scriptedModel([
        "The user is asking about remote work. I think the answer is ...",
      ]);
      const runtime = buildRuntime(model);

      const result = await runtime.execute(baseRunInput(runId));

      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe(SUPERVISOR_DECISION_INVALID);
      expect(result.totalSteps).toBe(1);
      expect(result.totalToolCalls).toBe(0);

      const run = await AgentRunModel.findById(runId).lean();
      expect(run).toBeTruthy();
      expect(run?.status).toBe("failed");

      const steps = await AgentStepModel.find({
        runId: new mongoose.Types.ObjectId(runId),
      }).lean();
      expect(steps).toHaveLength(1);
      expect(steps[0]?.action).toBe("guardrail");
      expect(steps[0]?.status).toBe("failed");
      expect(
        (steps[0]?.error as Record<string, unknown> | null)?.code,
      ).toBe(SUPERVISOR_DECISION_INVALID);

      expect(
        await AgentToolCallModel.countDocuments({
          runId: new mongoose.Types.ObjectId(runId),
        }),
      ).toBe(0);
    },
    30_000,
  );

  it("prevents cross-tenant reads and mutations", async () => {
    const run = await createRun({
      tenantId: TENANT_A,
      actorId: ACTOR_A,
      workflowName: "chat-rag-v1",
      agentName: "chat-supervisor",
      input: {},
      modelProvider: "fake",
      modelName: "fake-default",
      promptVersion: null,
      promptVersionId: null,
      toolVersionSnapshot: null,
      traceId: TRACE_ID,
      requestId: REQUEST_ID,
    });
    const step = await createStep({
      runId: run.id,
      tenantId: TENANT_A,
      stepIndex: 0,
      agentName: "chat-supervisor",
      action: "tool_call",
      input: { text: "hello" },
      traceId: TRACE_ID,
      requestId: REQUEST_ID,
    });
    const toolCall = await createToolCall({
      runId: run.id,
      stepId: step.id,
      tenantId: TENANT_A,
      toolName: "echo",
      toolVersion: "1.0.0",
      input: { text: "hello" },
      traceId: TRACE_ID,
      requestId: REQUEST_ID,
    });

    // Cross-tenant reads see nothing.
    expect(await getRun(TENANT_B, run.id)).toBeNull();
    const otherSteps = await getSteps(TENANT_B, run.id, {
      page: 1,
      pageSize: 50,
    });
    expect(otherSteps.totalRecords).toBe(0);
    expect(otherSteps.steps).toHaveLength(0);
    const otherToolCalls = await getToolCalls(TENANT_B, run.id, {
      page: 1,
      pageSize: 50,
    });
    expect(otherToolCalls.totalRecords).toBe(0);

    // Cross-tenant mutations are no-ops.
    expect(await completeRun(TENANT_B, run.id, { status: "completed" })).toBeNull();
    expect(await completeStep(TENANT_B, step.id, { status: "failed" })).toBeNull();
    expect(
      await completeToolCall(TENANT_B, toolCall.id, { status: "failed" }),
    ).toBeNull();

    // The owning tenant's records are untouched.
    expect((await getRun(TENANT_A, run.id))?.status).toBe("pending");
    const ownSteps = await getSteps(TENANT_A, run.id, {
      page: 1,
      pageSize: 50,
    });
    expect(ownSteps.steps[0]?.status).toBe("running");
    const ownToolCalls = await getToolCalls(TENANT_A, run.id, {
      page: 1,
      pageSize: 50,
    });
    expect(ownToolCalls.toolCalls[0]?.status).toBe("running");
  }, 30_000);

  it(
    "does not persist raw retrieval text, prompts, reasoning, or secrets",
    async () => {
      const sentinels = {
        rawChunk: "UNIQUE-RAW-CHUNK-TEXT-9f2b7c",
        documentBody: "UNIQUE-DOCUMENT-BODY-TEXT-1a4e8d",
        systemPrompt: "UNIQUE-SYSTEM-PROMPT-5c8f2a",
        chainOfThought: "UNIQUE-CHAIN-OF-THOUGHT-3d6a9b",
        credentials: "UNIQUE-CREDENTIALS-username:password",
        apiKey: "UNIQUE-API-KEY-7e1c4d",
        secret: "UNIQUE-TOP-SECRET-2b5f9e",
      };

      const toolRegistry = new ToolRegistry();
      toolRegistry.register({
        schema: {
          name: "leaky_retrieval",
          version: "1.0.0",
          description:
            "Returns retrieval evidence but must never leak raw content.",
          inputSchema: z.object({ query: z.string() }),
          outputSchema: z.object({
            summary: z.string(),
            sources: z.array(z.string()),
          }),
          approvalRequired: false,
          timeoutMs: 1_000,
          maxRetries: 0,
        },
        handler: async () => ({
          summary: "Remote work is allowed on Fridays.",
          sources: ["policy-doc.pdf#12"],
          rawChunkText: sentinels.rawChunk,
          documentBodyText: sentinels.documentBody,
          systemPrompt: sentinels.systemPrompt,
          chainOfThought: sentinels.chainOfThought,
          credentials: sentinels.credentials,
          apiKey: sentinels.apiKey,
          secret: sentinels.secret,
        }),
      });

      const runId = await createPendingRun();
      const model = scriptedModel([
        toolCallDecision("leaky_retrieval", { query: "remote work policy" }),
        completeDecision({ answer: "done" }),
      ]);
      const runtime = buildRuntime(model, toolRegistry);

      const result = await runtime.execute(baseRunInput(runId));
      expect(result.status).toBe("completed");

      const run = await AgentRunModel.findById(runId).lean();
      const steps = await AgentStepModel.find({
        runId: new mongoose.Types.ObjectId(runId),
      }).lean();
      const toolCalls = await AgentToolCallModel.find({
        runId: new mongoose.Types.ObjectId(runId),
      }).lean();
      const serialized = JSON.stringify({ run, steps, toolCalls });

      for (const sentinel of Object.values(sentinels)) {
        expect(serialized.includes(sentinel), `leaked ${sentinel}`).toBe(false);
      }

      // The schema-validated tool output is all that was persisted.
      expect(toolCalls[0]?.output).toEqual({
        summary: "Remote work is allowed on Fridays.",
        sources: ["policy-doc.pdf#12"],
      });
    },
    30_000,
  );

  it(
    "does not persist the supervisor prompt or model chain-of-thought",
    async () => {
      const sentinels = {
        chainOfThought: "UNIQUE-CHAIN-OF-THOUGHT-3d6a9b",
        systemPrompt: "UNIQUE-SYSTEM-PROMPT-5c8f2a",
      };

      let capturedSystemPrompt = "";
      const adapter: ModelAdapter = {
        providerKey: "fake",
        async complete(params) {
          capturedSystemPrompt =
            params.messages.find((message) => message.role === "system")
              ?.content ?? "";
          return {
            id: "fake-redaction-1",
            provider: "fake",
            model: "fake",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: `${sentinels.chainOfThought}\n${sentinels.systemPrompt}`,
                },
                finishReason: "stop",
              },
            ],
            usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
            latencyMs: 1,
            estimatedCost: 0,
          };
        },
      };
      const model = new ModelAdapterSupervisorDecisionModel(adapter);
      const runId = await createPendingRun();
      const runtime = buildRuntime(model);

      const result = await runtime.execute(baseRunInput(runId));

      // Chain-of-thought prose is not a valid decision; the run fails closed.
      expect(result.status).toBe("failed");
      expect(result.error?.code).toBe(SUPERVISOR_DECISION_INVALID);

      const run = await AgentRunModel.findById(runId).lean();
      const steps = await AgentStepModel.find({
        runId: new mongoose.Types.ObjectId(runId),
      }).lean();
      const toolCalls = await AgentToolCallModel.find({
        runId: new mongoose.Types.ObjectId(runId),
      }).lean();
      const serialized = JSON.stringify({ run, steps, toolCalls });

      expect(capturedSystemPrompt.length).toBeGreaterThan(0);
      expect(serialized.includes(sentinels.chainOfThought)).toBe(false);
      expect(serialized.includes(sentinels.systemPrompt)).toBe(false);
      expect(serialized.includes(capturedSystemPrompt)).toBe(false);
    },
    30_000,
  );
});
