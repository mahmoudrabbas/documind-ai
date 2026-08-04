import { describe, it, expect, vi, beforeEach } from "vitest";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import {
  ENTITLEMENT_EXCEEDED,
  VALIDATION_ERROR,
} from "../../common/errors/errorCodes.js";
import type { ChatService } from "./chat.service.js";
import type { SseSink } from "./chat.types.js";
import { createChatController } from "./chat.controller.js";
import { createChatRoutes } from "./chat.routes.js";

// ═══════════════════════════════════════════════════════════════════════════
// Hoisted mocks — chat.routes.ts builds its queryGuard from the
// getEntitlementService() singleton at module load, so the entitlement module
// must be mocked before createChatRoutes is ever imported.
// ═══════════════════════════════════════════════════════════════════════════

const mockConsume = vi.hoisted(() => vi.fn());
const mockGetPeriodReset = vi.hoisted(() => vi.fn());

vi.mock("../entitlement/entitlement.service.js", () => ({
  getEntitlementService: () => ({
    consume: mockConsume,
    getPeriodReset: mockGetPeriodReset,
  }),
}));

// ── Shared fakes (plan streaming-sse.md todo 3, line 127) ───────────────────

type Listener = (...args: unknown[]) => void;

interface FakeRes {
  writeHead: ReturnType<typeof vi.fn>;
  write: ReturnType<typeof vi.fn>;
  end: ReturnType<typeof vi.fn>;
  flushHeaders: ReturnType<typeof vi.fn>;
  writableEnded: boolean;
  listeners: Map<string, Set<Listener>>;
  on(event: string, cb: Listener): FakeRes;
  off(event: string, cb: Listener): FakeRes;
  emit(event: string): void;
}

/**
 * Shared fake Response. REQUIRED because the handler ALWAYS registers
 * `res.on("close", onClose)`, calls `res.off("close", onClose)` in `finally`,
 * and reads `res.writableEnded` — without on/off/writableEnded every test
 * (happy, pre-start, mid-stream) would throw before asserting.
 */
function createFakeRes(): FakeRes {
  return {
    writeHead: vi.fn(),
    write: vi.fn(),
    end: vi.fn(),
    flushHeaders: vi.fn(),
    writableEnded: false,
    listeners: new Map<string, Set<Listener>>(),
    on(event: string, cb: Listener) {
      (this.listeners.get(event) ??
        this.listeners.set(event, new Set()).get(event)!).add(cb);
      return this;
    },
    off(event: string, cb: Listener) {
      this.listeners.get(event)?.delete(cb);
      return this;
    },
    emit(event: string) {
      this.listeners.get(event)?.forEach((cb) => cb());
    },
  };
}

interface FakeAuth {
  userId: string;
  email: string;
  role: "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE";
}

interface FakeReq {
  auth: FakeAuth;
  tenantId: string;
  traceId: string;
  requestId: string;
  body: unknown;
  headers: Record<string, unknown>;
}

function createFakeReq(overrides: Partial<FakeReq> = {}): FakeReq {
  return {
    auth: {
      userId: "64b7f9c2e4b0f6a1d2c3e4f6",
      email: "employee@example.com",
      role: "EMPLOYEE",
    },
    tenantId: "64b7f9c2e4b0f6a1d2c3e4f5",
    traceId: "trace-1",
    requestId: "req-1",
    body: { message: "hi" },
    headers: {},
    ...overrides,
  };
}

/** Successful stub service per the plan (head, token, done, then end). */
function createHappyService(): ChatService {
  return {
    streamMessage: vi.fn(
      async (_body: unknown, _context: unknown, sink: SseSink) => {
        sink.start();
        sink.event({ type: "token", content: "Hi" });
        sink.event({ type: "done", messageId: "m1", conversationId: "c1" });
        sink.end();
      },
    ),
  } as unknown as ChatService;
}

// Express 5 (standalone `router` package) stack/route shapes.
interface RouteShape {
  path: string;
  methods: Record<string, boolean>;
  stack: Array<{ handle: unknown }>;
}

interface RouterLayer {
  route?: RouteShape;
}

function findRoute(
  router: ReturnType<typeof createChatRoutes>,
  path: string,
): RouteShape {
  const stack = (router as unknown as { stack: RouterLayer[] }).stack;
  const layer = stack.find((candidate) => candidate.route?.path === path);
  expect(layer).toBeDefined();
  return layer!.route!;
}

/**
 * Invoke a single middleware/handler from a route's stack with the shared
 * fakes and return the AppError forwarded via next().
 */
async function invokeHandler(handle: unknown): Promise<AppError> {
  const req = createFakeReq() as unknown as Request;
  const res = createFakeRes() as unknown as Response;
  const next = vi.fn();
  await (
    handle as (req: Request, res: Response, next: NextFunction) => Promise<void>
  )(req, res, next);
  expect(next).toHaveBeenCalledTimes(1);
  // A guard runs before the controller — no SSE frames may be written.
  expect(res.writeHead).not.toHaveBeenCalled();
  expect(res.write).not.toHaveBeenCalled();
  expect(res.end).not.toHaveBeenCalled();
  return next.mock.calls[0][0] as AppError;
}

beforeEach(() => {
  mockConsume.mockReset();
  mockGetPeriodReset.mockReset();
});

// ── 1. Happy path ────────────────────────────────────────────────────────────

describe("POST /chat/stream controller", () => {
  it("writes the SSE head and the exact data frames once for a successful stream", async () => {
    const controller = createChatController(createHappyService());
    const res = createFakeRes();
    const req = createFakeReq();
    const next = vi.fn();

    await controller.streamMessage(
      req as unknown as Request,
      res as unknown as Response,
      next as unknown as NextFunction,
    );

    expect(res.writeHead).toHaveBeenCalledTimes(1);
    expect(res.writeHead).toHaveBeenCalledWith(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    expect(res.flushHeaders).toHaveBeenCalledTimes(1);
    expect(res.write).toHaveBeenCalledTimes(2);
    expect(res.write).toHaveBeenNthCalledWith(
      1,
      'data: {"type":"token","content":"Hi"}\n\n',
    );
    expect(res.write).toHaveBeenNthCalledWith(
      2,
      'data: {"type":"done","messageId":"m1","conversationId":"c1"}\n\n',
    );
    expect(res.end).toHaveBeenCalledTimes(1);
  });

  // ── 2. Pre-start error stays JSON ─────────────────────────────────────────

  it("forwards a pre-start error via next without writing any SSE frames", async () => {
    const service = {
      streamMessage: vi.fn(async () => {
        throw new AppError(400, VALIDATION_ERROR, "bad");
      }),
    } as unknown as ChatService;
    const controller = createChatController(service);
    const res = createFakeRes();
    const req = createFakeReq();
    const next = vi.fn();

    await controller.streamMessage(
      req as unknown as Request,
      res as unknown as Response,
      next as unknown as NextFunction,
    );

    expect(next).toHaveBeenCalledTimes(1);
    const error = next.mock.calls[0][0];
    expect(error).toBeInstanceOf(AppError);
    expect(error.statusCode).toBe(400);
    expect(error.code).toBe(VALIDATION_ERROR);
    expect(error.message).toBe("bad");
    expect(res.writeHead).not.toHaveBeenCalled();
    expect(res.write).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();
  });

  // ── 3. Mid-stream error writes the error event then ends ──────────────────

  it("writes a final {type:error} event and ends the stream on a mid-stream failure", async () => {
    const service = {
      streamMessage: vi.fn(
        async (_body: unknown, _context: unknown, sink: SseSink) => {
          sink.start();
          throw new Error("boom");
        },
      ),
    } as unknown as ChatService;
    const controller = createChatController(service);
    const res = createFakeRes();
    const req = createFakeReq();
    const next = vi.fn();

    await controller.streamMessage(
      req as unknown as Request,
      res as unknown as Response,
      next as unknown as NextFunction,
    );

    expect(res.write).toHaveBeenCalledTimes(1);
    expect(res.write).toHaveBeenCalledWith(
      'data: {"type":"error","message":"boom"}\n\n',
    );
    expect(res.end).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  // ── 4. Route registration ─────────────────────────────────────────────────

  it("registers POST /stream with the exact /send middleware chain and keeps /send", () => {
    const router = createChatRoutes(createHappyService());

    const streamRoute = findRoute(router, "/stream");
    expect(streamRoute.methods.post).toBe(true);
    // 4 middlewares (authenticate, tenantScoping, requirePermission, queryGuard) + handler
    expect(streamRoute.stack.length).toBe(5);

    const sendRoute = findRoute(router, "/send");
    expect(sendRoute.methods.post).toBe(true);
    expect(sendRoute.stack.length).toBe(5);
  });

  // ── 5. Quota parity with /send ────────────────────────────────────────────

  it("rejects /chat/stream with the identical 429 ENTITLEMENT_EXCEEDED AppError as /send when quota is exhausted", async () => {
    mockConsume.mockResolvedValue({
      committed: false,
      current: 10,
      limit: 5,
      remaining: 0,
    });
    mockGetPeriodReset.mockResolvedValue("2026-09-01T00:00:00.000Z");

    const router = createChatRoutes(createHappyService());
    const streamRoute = findRoute(router, "/stream");
    const sendRoute = findRoute(router, "/send");

    // Both routes mount the SAME module-level queryGuard instance (layer 4).
    expect(streamRoute.stack[3].handle).toBe(sendRoute.stack[3].handle);

    const sendError = await invokeHandler(sendRoute.stack[3].handle);
    const streamError = await invokeHandler(streamRoute.stack[3].handle);

    expect(sendError).toBeInstanceOf(AppError);
    expect(streamError).toBeInstanceOf(AppError);
    expect(streamError.statusCode).toBe(429);
    expect(streamError.code).toBe(ENTITLEMENT_EXCEEDED);
    expect(streamError.statusCode).toBe(sendError.statusCode);
    expect(streamError.code).toBe(sendError.code);
    expect(streamError.message).toBe(sendError.message);
    expect(streamError.details).toEqual(sendError.details);
  });

  // ── 6. Client-disconnect abort ────────────────────────────────────────────

  it("aborts the provider signal on client disconnect, respects !res.writableEnded, and removes the close listener", async () => {
    let capturedSignal: AbortSignal | undefined;
    let resolveDeferred!: () => void;
    const deferred = new Promise<void>((resolve) => {
      resolveDeferred = resolve;
    });
    let abortEvents = 0;

    const holdingService = {
      streamMessage: vi.fn(
        async (
          _body: unknown,
          _context: unknown,
          sink: SseSink,
          signal?: AbortSignal,
        ) => {
          capturedSignal = signal;
          signal?.addEventListener("abort", () => {
            abortEvents += 1;
          });
          sink.start();
          // Hold the handler open so the finally has NOT removed the listener yet.
          await deferred;
        },
      ),
    } as unknown as ChatService;

    const controller = createChatController(holdingService);
    const res = createFakeRes();
    const req = createFakeReq();
    const next = vi.fn();

    const pending = controller.streamMessage(
      req as unknown as Request,
      res as unknown as Response,
      next as unknown as NextFunction,
    );
    // Let the service body run synchronously to capture the signal.
    await Promise.resolve();

    expect(capturedSignal).toBeDefined();
    expect(capturedSignal!.aborted).toBe(false);
    expect(res.listeners.get("close")?.size).toBe(1);

    // Client disconnect while the stream is in flight (writableEnded false).
    res.emit("close");
    expect(capturedSignal!.aborted).toBe(true);
    expect(abortEvents).toBe(1); // onClose ran exactly once

    // The !res.writableEnded guard: a close after the response completed must
    // not abort again — the handler is still open, listener still registered.
    res.writableEnded = true;
    res.emit("close");
    expect(abortEvents).toBe(1);
    expect(res.listeners.get("close")?.size).toBe(1);

    // Let the service finish; the finally removes the close listener.
    resolveDeferred();
    await pending;
    expect(res.listeners.get("close")?.size).toBe(0);

    // The controller's signal was threaded as the 4th argument.
    expect(holdingService.streamMessage).toHaveBeenCalledWith(
      req.body,
      expect.anything(),
      expect.anything(),
      capturedSignal,
    );
    expect(next).not.toHaveBeenCalled();
  });
});
