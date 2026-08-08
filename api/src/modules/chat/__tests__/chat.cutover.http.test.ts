import express, { type RequestHandler } from "express";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AppError } from "../../../common/errors/AppError.js";
import { ENTITLEMENT_EXCEEDED } from "../../../common/errors/errorCodes.js";
import { errorHandlerMiddleware } from "../../../common/middlewares/errorHandler.middleware.js";
import type { ModelAdapter } from "../../agents/agents.types.js";
import type { HybridRetrievalService } from "../../retrieval/retrieval.service.js";

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

describe("POST /chat/send production cutover", () => {
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

  it("runs the real route chain and reaches the controlled workflow delegate", async () => {
    const workflowExecute = vi.fn(async () => ({
      messageId: "assistant-message",
      answer: "CONTROLLED_FINAL",
      sources: [],
      conversationId: "conversation-1",
    }));
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
      req.traceId = "trace-http";
      req.requestId = "request-http";
      next();
    });
    app.use("/chat", createChatRoutes(service));
    app.use(errorHandlerMiddleware);

    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    expect(address && typeof address === "object").toBe(true);
    if (!address || typeof address === "string") throw new Error("Missing server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/chat/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: "How many questions are in Onboarding 2026?",
        tenantId: "spoofed-tenant",
        actorId: "spoofed-actor",
      }),
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        messageId: "assistant-message",
        answer: "CONTROLLED_FINAL",
        sources: [],
        conversationId: "conversation-1",
      },
    });
    expect(middlewareCalls).toEqual([
      "authenticate",
      "tenantScoping",
      "requirePermission",
      "queryGuard",
    ]);
    expect(workflowExecute).toHaveBeenCalledTimes(1);
    expect(workflowExecute).toHaveBeenCalledWith(
      expect.objectContaining({
        message: "How many questions are in Onboarding 2026?",
        tenantId: "spoofed-tenant",
        actorId: "spoofed-actor",
      }),
      {
        tenantId: "64b000000000000000000001",
        actorId: "64b000000000000000000002",
        actorEmail: "persisted@example.com",
        actorRole: "EMPLOYEE",
        traceId: "trace-http",
        requestId: "request-http",
      },
    );
    expect(retrieval.hybridSearch).not.toHaveBeenCalled();
    expect(model.complete).not.toHaveBeenCalled();
  });

  it("fails closed on entitlement denial before workflow execution", async () => {
    entitlementState.denied = true;
    const workflowExecute = vi.fn();
    const retrieval = { hybridSearch: vi.fn() } as unknown as HybridRetrievalService;
    const model = { providerKey: "test-provider", complete: vi.fn() } as unknown as ModelAdapter;
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
      req.traceId = "trace-denied";
      req.requestId = "request-denied";
      next();
    });
    app.use("/chat", createChatRoutes(service));
    app.use(errorHandlerMiddleware);
    const server = app.listen(0, "127.0.0.1");
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("listening", resolve);
      server.once("error", reject);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Missing server address");

    const response = await fetch(`http://127.0.0.1:${address.port}/chat/send`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ message: "What is the leave policy?" }),
    });

    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      success: false,
      error: { code: ENTITLEMENT_EXCEEDED },
    });
    expect(middlewareCalls).toEqual([
      "authenticate",
      "tenantScoping",
      "requirePermission",
      "queryGuard",
    ]);
    expect(workflowExecute).not.toHaveBeenCalled();
    expect(retrieval.hybridSearch).not.toHaveBeenCalled();
    expect(model.complete).not.toHaveBeenCalled();
  });
});
