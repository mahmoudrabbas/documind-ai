import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";

process.env.NODE_ENV = "test";

import { connectDB, disconnectDB } from "../../db/connection.js";
import { connectRedis, disconnectRedis, getRedisClient } from "../../db/redis.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import AuditLogModel from "../../db/models/auditLog.model.js";
import ConversationModel from "../../db/models/conversation.model.js";
import MessageModel from "../../db/models/message.model.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { ChatService } from "./chat.service.js";
import type { SseSink } from "./chat.types.js";
import type { HybridRetrievalService } from "../retrieval/retrieval.service.js";
import type {
  ModelAdapter,
  ModelCompletionResponse,
  ModelCompletionStreamChunk,
} from "../agents/agents.types.js";

const TEST_PASSWORD = "StrongPass123!";
const NO_AUTHORIZED_EVIDENCE =
  "I don't have sufficient authorized evidence to answer that question.";

interface RecordingCall {
  maxTokens?: number;
  temperature?: number;
  messages: { role: string; content: string }[];
  signal?: AbortSignal;
}

type SseCall =
  | { kind: "start" }
  | { kind: "event"; payload: Record<string, unknown> }
  | { kind: "end" };

function createFakeSink(): {
  sink: SseSink;
  calls: SseCall[];
  events: Array<Record<string, unknown>>;
} {
  const calls: SseCall[] = [];
  const events: Array<Record<string, unknown>> = [];
  const sink: SseSink = {
    start() {
      calls.push({ kind: "start" });
    },
    event(payload) {
      const p = payload as Record<string, unknown>;
      calls.push({ kind: "event", payload: p });
      events.push(p);
    },
    end() {
      calls.push({ kind: "end" });
    },
  };
  return { sink, calls, events };
}

function createRecordingAdapter(): {
  adapter: ModelAdapter;
  calls: RecordingCall[];
} {
  const calls: RecordingCall[] = [];
  const adapter: ModelAdapter = {
    providerKey: "recording",
    async complete(params) {
      calls.push({
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        messages: params.messages,
        signal: params.signal,
      });
      const response: ModelCompletionResponse = {
        id: "recording-1",
        provider: "recording",
        model: "recording-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Mock answer from recorder.",
            },
            finishReason: "stop",
          },
        ],
        usage: { promptTokens: 0, completionTokens: 8, totalTokens: 8 },
        latencyMs: 1,
        estimatedCost: 0,
      };
      return response;
    },
  };
  return { adapter, calls };
}

function createStreamingRecordingAdapter(options: {
  onChunk?: (receivedSignal: AbortSignal | undefined, yieldedChunkCount: number) => void;
} = {}): {
  adapter: ModelAdapter;
  calls: RecordingCall[];
  receivedSignals: Array<AbortSignal | undefined>;
} {
  const calls: RecordingCall[] = [];
  const receivedSignals: Array<AbortSignal | undefined> = [];
  const deltas = ["Hel", "lo ", "world"];
  const adapter: ModelAdapter = {
    providerKey: "recording",
    async complete(params) {
      calls.push({
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        messages: params.messages,
        signal: params.signal,
      });
      const response: ModelCompletionResponse = {
        id: "recording-1",
        provider: "recording",
        model: "recording-model",
        choices: [
          {
            index: 0,
            message: {
              role: "assistant",
              content: "Mock answer from recorder.",
            },
            finishReason: "stop",
          },
        ],
        usage: { promptTokens: 0, completionTokens: 8, totalTokens: 8 },
        latencyMs: 1,
        estimatedCost: 0,
      };
      return response;
    },
    async *completeStream(params) {
      calls.push({
        maxTokens: params.maxTokens,
        temperature: params.temperature,
        messages: params.messages,
        signal: params.signal,
      });
      receivedSignals.push(params.signal);
      for (const [index, delta] of deltas.entries()) {
        yield {
          id: "recording-1",
          provider: "recording",
          model: "recording-model",
          choices: [{ index: 0, delta: { content: delta }, finish_reason: null }],
        } as ModelCompletionStreamChunk;
        if (options.onChunk) {
          options.onChunk(params.signal, index + 1);
        }
        if (params.signal?.aborted) {
          const abortError = new Error("The operation was aborted");
          abortError.name = "AbortError";
          throw abortError;
        }
      }
      yield {
        choices: [{ index: 0, delta: {}, finish_reason: "stop" }],
        usage: { promptTokens: 7, completionTokens: 11, totalTokens: 18 },
      } as ModelCompletionStreamChunk;
    },
  };
  return { adapter, calls, receivedSignals };
}

function createStubRetrieval(candidateCount = 1): HybridRetrievalService {
  const candidates = Array.from({ length: candidateCount }, (_, i) => ({
    chunkId: `chunk-${i + 1}`,
    documentId: new mongoose.Types.ObjectId().toString(),
    documentVersionId: "v1",
    tenantId: "",
    text: `Candidate chunk ${i + 1}.`,
    score: 0.9 - i * 0.1,
    pageNumber: 2,
    sectionTitle: "Onboarding",
    retrievalMethod: "hybrid" as const,
  }));
  return {
    async hybridSearch() {
      return {
        candidates,
        totalCandidates: candidates.length,
        filterSummary: {
          tenantFilter: true,
          roleFilter: "COMPANY_ADMIN",
          permissionScopes: [],
          explicitFilters: [],
          versionFilter: false,
        },
        diagnostics: {
          totalLatencyMs: 5,
          vectorCandidateCount: candidates.length,
          keywordCandidateCount: candidates.length,
          traceId: "chat-stream-test",
        },
      };
    },
    async vectorSearch() {
      throw new Error("not used in stream test");
    },
    async keywordSearch() {
      throw new Error("not used in stream test");
    },
  };
}

async function seedTenantAdmin(maxTokens = 1024) {
  const tenant = await TenantModel.create({
    name: "Acme Consulting",
    slug: "acme-consulting-stream",
    status: "active",
    plan: "free",
    settings: { aiRuntimePreferences: { maxTokens } },
  });
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Sarah Ahmed",
    email: "sarah@acme.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  return { tenant, user };
}

before(async () => {
  await connectDB();
  await connectRedis();
});

after(async () => {
  await disconnectRedis();
  await disconnectDB();
});

beforeEach(async () => {
  await Promise.all([
    TenantModel.deleteMany({}),
    UserModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    MessageModel.deleteMany({}),
    AuditLogModel.deleteMany({}),
    getRedisClient().flushdb().catch(() => {}),
  ]);
});

test("streamMessage streams token deltas, persists the answer with citation sources, and finishes with done", async () => {
  const { tenant, user } = await seedTenantAdmin(1024);
  const { adapter } = createStreamingRecordingAdapter();
  const service = new ChatService(createStubRetrieval(1), adapter);
  const { sink, calls, events } = createFakeSink();

  await service.streamMessage(
    { message: "hi" },
    {
      tenantId: tenant.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: "COMPANY_ADMIN",
      traceId: "trace-stream-1",
      requestId: "req-stream-1",
    },
    sink,
  );

  const tokenEvents = events.filter((e) => e.type === "token");
  assert.equal(tokenEvents.length, 3);
  assert.equal(tokenEvents.map((e) => e.content).join(""), "Hello world");

  // start is emitted exactly once and before the first token
  assert.equal(calls.filter((c) => c.kind === "start").length, 1);
  assert.equal(calls[0].kind, "start");
  assert.equal(calls[1].kind, "event");
  assert.equal((calls[1] as { kind: "event"; payload: { type: string } }).payload.type, "token");

  // end is the final sink call
  assert.equal(calls[calls.length - 1].kind, "end");

  const sourcesEvent = events.find((e) => e.type === "sources") as
    | { type: string; sources: Array<{ chunkId: string }> }
    | undefined;
  assert.ok(sourcesEvent, "sources event emitted");
  assert.equal(sourcesEvent.sources.length, 1);
  assert.equal(sourcesEvent.sources[0].chunkId, "chunk-1");

  const doneEvent = events.find((e) => e.type === "done") as
    | { type: string; messageId: string; conversationId: string }
    | undefined;
  assert.ok(doneEvent, "done event emitted");
  assert.ok(doneEvent.messageId);
  assert.ok(doneEvent.conversationId);

  const assistantMessage = await MessageModel.findOne({ role: "assistant" }).exec();
  assert.ok(assistantMessage, "assistant message persisted");
  assert.equal(assistantMessage.content, "Hello world");
  assert.equal(assistantMessage.sources.length, 1);
  assert.equal(assistantMessage.sources[0].chunkId, "chunk-1");
  assert.equal(doneEvent.conversationId, assistantMessage.conversationId.toString());
});

test("terminal no-evidence streams the refusal, persists it, and writes a RETRIEVAL_DENIAL audit row", async () => {
  const { tenant, user } = await seedTenantAdmin(1024);
  const { adapter } = createStreamingRecordingAdapter();
  const service = new ChatService(createStubRetrieval(0), adapter);
  const { sink, calls, events } = createFakeSink();

  await service.streamMessage(
    { message: "hi" },
    {
      tenantId: tenant.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: "COMPANY_ADMIN",
      traceId: "trace-stream-1",
      requestId: "req-stream-1",
    },
    sink,
  );

  const tokenEvents = events.filter((e) => e.type === "token");
  assert.equal(tokenEvents.length, 1);
  assert.equal(tokenEvents[0].content, NO_AUTHORIZED_EVIDENCE);

  const sourcesEvent = events.find((e) => e.type === "sources") as
    | { type: string; sources: unknown[] }
    | undefined;
  assert.ok(sourcesEvent, "sources event emitted");
  assert.deepEqual(sourcesEvent.sources, []);

  const doneEvent = events.find((e) => e.type === "done") as
    | { type: string; messageId: string; conversationId: string }
    | undefined;
  assert.ok(doneEvent, "done event emitted");
  assert.ok(doneEvent.messageId);
  assert.ok(doneEvent.conversationId);

  assert.equal(calls.filter((c) => c.kind === "start").length, 1);
  assert.equal(calls[calls.length - 1].kind, "end");

  const assistantMessage = await MessageModel.findOne({ role: "assistant" }).exec();
  assert.ok(assistantMessage, "assistant refusal persisted");
  assert.equal(assistantMessage.content, NO_AUTHORIZED_EVIDENCE);

  const denialAudit = await AuditLogModel.findOne({ action: "RETRIEVAL_DENIAL" }).exec();
  assert.ok(denialAudit, "RETRIEVAL_DENIAL audit row written");
});

test("fallback adapter without completeStream streams the complete() answer as a single token", async () => {
  const { tenant, user } = await seedTenantAdmin(1024);
  const { adapter, calls } = createRecordingAdapter();
  const service = new ChatService(createStubRetrieval(1), adapter);
  const { sink, calls: sinkCalls, events } = createFakeSink();

  await service.streamMessage(
    { message: "hi" },
    {
      tenantId: tenant.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: "COMPANY_ADMIN",
      traceId: "trace-stream-1",
      requestId: "req-stream-1",
    },
    sink,
  );

  const tokenEvents = events.filter((e) => e.type === "token");
  assert.equal(tokenEvents.length, 1);
  assert.equal(tokenEvents[0].content, "Mock answer from recorder.");

  const assistantMessage = await MessageModel.findOne({ role: "assistant" }).exec();
  assert.ok(assistantMessage, "assistant message persisted");
  assert.equal(assistantMessage.content, "Mock answer from recorder.");

  assert.equal(calls.length, 1);
  assert.equal(sinkCalls.filter((c) => c.kind === "start").length, 1);
  assert.equal(sinkCalls[sinkCalls.length - 1].kind, "end");
});

test("client-disconnect abort cancels the provider stream without persisting or emitting done", async () => {
  const { tenant, user } = await seedTenantAdmin(1024);
  const controller = new AbortController();
  const { adapter, receivedSignals } = createStreamingRecordingAdapter({
    onChunk: (_receivedSignal, count) => {
      if (count === 1) {
        controller.abort();
      }
    },
  });
  const service = new ChatService(createStubRetrieval(1), adapter);
  const { sink, calls, events } = createFakeSink();

  await service.streamMessage(
    { message: "hi" },
    {
      tenantId: tenant.id,
      actorId: user.id,
      actorEmail: user.email,
      actorRole: "COMPANY_ADMIN",
      traceId: "trace-stream-1",
      requestId: "req-stream-1",
    },
    sink,
    controller.signal,
  );

  // the SAME AbortSignal object was threaded into the provider call
  assert.equal(receivedSignals.length, 1);
  assert.equal(receivedSignals[0], controller.signal);

  // no done, no persistence — the aborted stream exits the generator loop
  assert.equal(events.filter((e) => e.type === "done").length, 0);
  assert.ok(events.some((e) => e.type === "error"), "error event emitted");
  assert.equal(await MessageModel.countDocuments({ role: "assistant" }).exec(), 0);
  assert.equal(calls[calls.length - 1].kind, "end");
});
