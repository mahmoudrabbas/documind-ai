import express, { type RequestHandler } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../common/errors/AppError.js";
import {
  ENTITLEMENT_EXCEEDED,
  LLM_PROVIDER_UNAVAILABLE,
  LLM_RATE_LIMITED,
  LLM_TIMEOUT,
} from "../../../common/errors/errorCodes.js";
import { errorHandlerMiddleware } from "../../../common/middlewares/errorHandler.middleware.js";
import type { ModelAdapter } from "../../agents/agents.types.js";
import type { HybridRetrievalService } from "../../retrieval/retrieval.service.js";
import type { OperationAuthorizationContext } from "../../permissions/permissions.operation.js";
import type { ChatResponse } from "../chat.types.js";

type StreamContext = OperationAuthorizationContext & { onStage?: (stage: string) => void };

const middlewareCalls = vi.hoisted(() => [] as string[]);
const entitlementState = vi.hoisted(() => ({ denied: false }));

vi.mock("../../../common/middlewares/authenticate.middleware.js", () => ({
  authenticate: ((req, _res, next) => {
    middlewareCalls.push("authenticate");
    req.auth = {
      tenantId: "64b000000000000000000001",
      userId: "64b000000000000000000002",
      email: "persisted@example.com",
      role: "EMPLOYEE",
    };
    next();
  }) satisfies RequestHandler,
}));

vi.mock("../../../common/middlewares/tenantScoping.middleware.js", () => ({
  tenantScoping: ((req, _res, next) => {
    middlewareCalls.push("tenantScoping");
    req.tenantId = req.auth?.tenantId;
    next();
  }) satisfies RequestHandler,
}));

vi.mock("../../permissions/permissions.middleware.js", () => ({
  requirePermission: () => ((req, _res, next) => {
    middlewareCalls.push("requirePermission");
    next();
  }) satisfies RequestHandler,
}));

vi.mock("../../entitlement/entitlement.service.js", () => ({
  getEntitlementService: () => ({}),
}));

vi.mock("../../entitlement/middlewares/entitlement.middleware.js", () => ({
  createEntitlementGuard: () => ((req, _res, next) => {
    middlewareCalls.push("queryGuard");
    if (entitlementState.denied) {
      next(new AppError(429, ENTITLEMENT_EXCEEDED, "Query entitlement exceeded"));
      return;
    }
    next();
  }) satisfies RequestHandler,
}));

import { ChatService } from "../chat.service.js";
import { createChatRoutes } from "../chat.routes.js";

interface SseFrame {
  event: string;
  data: Record<string, unknown>;
}

function parseFrames(raw: string): SseFrame[] {
  const frames: SseFrame[] = [];
  for (const block of raw.split("\n\n")) {
    let event = "message";
    let data = "";
    for (const line of block.split("\n")) {
      if (line.startsWith(":")) continue;
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) data += line.slice(5).trim();
    }
    if (!data) continue;
    frames.push({ event, data: JSON.parse(data) as Record<string, unknown> });
  }
  return frames;
}

describe("POST /chat/send/stream SSE progress", () => {
  const servers: Array<ReturnType<ReturnType<typeof express>["listen"]>> = [];

  afterEach(async () => {
    middlewareCalls.length = 0;
    entitlementState.denied = false;
    await Promise.all(
      servers.splice(0).map(
        (server) => new Promise<void>((resolve) => server.close(() => resolve())),
      ),
    );
  });

  function startApp(workflowExecute: (raw: unknown, context: StreamContext) => Promise<ChatResponse>) {
    const retrieval = { hybridSearch: vi.fn() } as unknown as HybridRetrievalService;
    const model = {
      providerKey: "test-provider",
      complete: vi.fn(),
    } as unknown as ModelAdapter;
    const service = new ChatService(
      retrieval,
      model,
      undefined,
      undefined,
      undefined,
      { execute: workflowExecute },
    );
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.traceId = "trace-stream";
      req.requestId = "request-stream";
      next();
    });
    app.use("/chat", createChatRoutes(service));
    app.use(errorHandlerMiddleware);

    return new Promise<{ port: number }>((resolve, reject) => {
      const server = app.listen(0, "127.0.0.1", () => {
        const address = server.address();
        if (!address || typeof address === "string") {
          reject(new Error("Missing server address"));
          return;
        }
        resolve({ port: address.port });
      });
      server.once("error", reject);
      servers.push(server);
    });
  }

  it("streams SSE stage frames then a done payload matching the JSON contract", async () => {
    const stagesSeen: string[] = [];
    const workflowExecute = vi.fn(
      async (_raw: unknown, context: { onStage?: (stage: string) => void }) => {
        for (const stage of [
          "intent",
          "search",
          "evidence",
          "answer",
          "verify",
          "finalize",
        ]) {
          context.onStage?.(stage);
          stagesSeen.push(stage);
        }
        return {
          messageId: "assistant-message",
          answer: "STREAMED_FINAL",
          sources: [],
          conversationId: "conversation-1",
        };
      },
    );
    const { port } = await startApp(workflowExecute);

    const response = await fetch(`http://127.0.0.1:${port}/chat/send/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "What is the leave policy?" }),
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    expect(response.headers.get("cache-control")).toBe("no-cache, no-transform");

    const frames = parseFrames(await response.text());
    const stageFrames = frames.filter((frame) => frame.event === "stage");
    expect(stageFrames.map((frame) => frame.data.stage)).toEqual([
      "intent",
      "search",
      "evidence",
      "answer",
      "verify",
      "finalize",
    ]);

    const doneFrames = frames.filter((frame) => frame.event === "done");
    expect(doneFrames).toHaveLength(1);
    expect(doneFrames[0]!.data).toEqual({
      success: true,
      data: {
        messageId: "assistant-message",
        answer: "STREAMED_FINAL",
        sources: [],
        conversationId: "conversation-1",
      },
    });
    expect(stagesSeen).toHaveLength(6);
    expect(workflowExecute).toHaveBeenCalledTimes(1);
  });

  it("preserves ENTITLEMENT_EXCEEDED across the SSE error boundary", async () => {
    const workflowExecute = vi.fn(async () => {
      throw new AppError(
        429,
        "ENTITLEMENT_EXCEEDED",
        "Quota exceeded for tokensPerMonth: 53330/2000",
        {
          current: 53_330,
          limit: 2_000,
          dimension: "tokensPerMonth",
          remaining: 0,
          periodReset: "2026-09-01T00:00:00.000Z",
          canUpgrade: true,
        },
      );
    });

    const { port } = await startApp(workflowExecute);

    const response = await fetch(
      `http://127.0.0.1:${port}/chat/send/stream`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          message: "What is the remote work policy?",
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "text/event-stream",
    );

    const frames = parseFrames(await response.text());
    const errorFrames = frames.filter(
      (frame) => frame.event === "error",
    );

    expect(errorFrames).toHaveLength(1);
    expect(errorFrames[0]!.data).toEqual({
      success: false,
      error: "ENTITLEMENT_EXCEEDED",
      message:
        "Quota exceeded for tokensPerMonth: 53330/2000",
      statusCode: 429,
      details: {
        current: 53_330,
        limit: 2_000,
        dimension: "tokensPerMonth",
        remaining: 0,
        periodReset: "2026-09-01T00:00:00.000Z",
        canUpgrade: true,
      },
    });
  });

  it("dedupes the opening intent stage against the workflow's own intent emission", async () => {
    const workflowExecute = vi.fn(
      async (_raw: unknown, context: { onStage?: (stage: string) => void }) => {
        context.onStage?.("intent");
        context.onStage?.("intent");
        return {
          messageId: "m1",
          answer: "A",
          sources: [],
          conversationId: "c1",
        };
      },
    );
    const { port } = await startApp(workflowExecute);

    const response = await fetch(`http://127.0.0.1:${port}/chat/send/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "Hello" }),
    });

    const frames = parseFrames(await response.text());
    const stageFrames = frames.filter((frame) => frame.event === "stage");
    expect(stageFrames).toHaveLength(1);
    expect(stageFrames[0]!.data.stage).toBe("intent");
  });

  it("emits an error frame when the workflow fails after streaming started", async () => {
    const workflowExecute = vi.fn(
      async (_raw: unknown, context: { onStage?: (stage: string) => void }) => {
        context.onStage?.("intent");
        throw new AppError(502, "CHAT_WORKFLOW_FAILED", "internal provider chain org_123");
      },
    );
    const { port } = await startApp(workflowExecute);

    const response = await fetch(`http://127.0.0.1:${port}/chat/send/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "What is the leave policy?" }),
    });

    expect(response.status).toBe(200);
    const frames = parseFrames(await response.text());
    const errorFrames = frames.filter((frame) => frame.event === "error");
    expect(errorFrames).toHaveLength(1);
    expect(errorFrames[0]!.data).toEqual({
      success: false,
      error: "CHAT_STREAM_FAILED",
      message: "Failed to get a response. Please try again.",
      statusCode: 502,
    });
    expect(JSON.stringify(errorFrames[0]!.data)).not.toContain("org_123");
    expect(frames.some((frame) => frame.event === "done")).toBe(false);
  });

  it.each([
    [
      LLM_RATE_LIMITED,
      429,
      "The AI service is temporarily rate-limited. Please try again shortly.",
    ],
    [
      LLM_PROVIDER_UNAVAILABLE,
      503,
      "The AI service is temporarily unavailable. Please try again shortly.",
    ],
    [
      LLM_TIMEOUT,
      503,
      "The AI service took too long to respond. Please try again.",
    ],
  ])("emits safe public SSE error details for %s", async (code, statusCode, message) => {
    const workflowExecute = vi.fn(
      async (_raw: unknown, context: { onStage?: (stage: string) => void }) => {
        context.onStage?.("intent");
        throw new AppError(statusCode, code, "raw provider body org_123 api-key sk-test");
      },
    );
    const { port } = await startApp(workflowExecute);

    const response = await fetch(`http://127.0.0.1:${port}/chat/send/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "What is the leave policy?" }),
    });

    expect(response.status).toBe(200);
    const frames = parseFrames(await response.text());
    const errorFrames = frames.filter((frame) => frame.event === "error");
    expect(errorFrames).toHaveLength(1);
    expect(errorFrames[0]!.data).toEqual({
      success: false,
      error: code,
      message,
      statusCode,
    });
    expect(JSON.stringify(errorFrames[0]!.data)).not.toContain("org_123");
  });

  it("preserves RETRIEVAL_UNAVAILABLE across the SSE error boundary", async () => {
    const workflowExecute = vi.fn(async () => {
      throw new AppError(
        503,
        "RETRIEVAL_UNAVAILABLE",
        "raw embedding provider body org_123",
      );
    });
    const { port } = await startApp(workflowExecute);

    const response = await fetch(`http://127.0.0.1:${port}/chat/send/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "What is the leave policy?" }),
    });

    const frames = parseFrames(await response.text());
    const errorFrame = frames.find((frame) => frame.event === "error");
    expect(errorFrame?.data).toEqual({
      success: false,
      error: "RETRIEVAL_UNAVAILABLE",
      message: "Document search is temporarily unavailable. Please try again shortly.",
      statusCode: 503,
    });
  });

  it("keeps pre-handler entitlement denials as plain JSON responses", async () => {
    entitlementState.denied = true;
    const workflowExecute = vi.fn(async () => ({}) as ChatResponse);
    const { port } = await startApp(workflowExecute);

    const response = await fetch(`http://127.0.0.1:${port}/chat/send/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "What is the leave policy?" }),
    });

    expect(response.status).toBe(429);
    expect(response.headers.get("content-type")).toContain("application/json");
    expect(workflowExecute).not.toHaveBeenCalled();
  });

  it("completes the workflow when the client disconnects mid-stream", async () => {
    let releaseWorkflow: () => void = () => {};
    const workflowGate = new Promise<void>((resolve) => {
      releaseWorkflow = resolve;
    });
    let workflowFinished = false;
    const workflowExecute = vi.fn(
      async (_raw: unknown, context: { onStage?: (stage: string) => void }) => {
        context.onStage?.("intent");
        await workflowGate;
        workflowFinished = true;
        return {
          messageId: "m1",
          answer: "A",
          sources: [],
          conversationId: "c1",
        };
      },
    );
    const { port } = await startApp(workflowExecute);

    const controller = new AbortController();
    const response = await fetch(`http://127.0.0.1:${port}/chat/send/stream`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "What is the leave policy?" }),
      signal: controller.signal,
    });
    expect(response.status).toBe(200);

    const reader = response.body!.getReader();
    const first = await reader.read();
    expect(first.value).toBeDefined();
    controller.abort();
    await reader.read().catch(() => {
      // Aborted reads reject; the point is the server keeps the run alive.
    });

    releaseWorkflow();
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(workflowFinished).toBe(true);
  });
});
