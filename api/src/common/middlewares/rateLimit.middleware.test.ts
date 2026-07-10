import test from "node:test";
import assert from "node:assert";
import type { Request, Response } from "express";
import type { Store } from "express-rate-limit";
import { createRateLimiter } from "./rateLimit.middleware.js";

interface MockNext {
  (error?: unknown): void;
  mock: { calls: unknown[][] };
}

function createInMemoryStore(): Store {
  const values = new Map<string, { totalHits: number; resetTime: Date }>();
  let windowMs = 1000;

  return {
    init(options) {
      windowMs = options.windowMs;
    },
    async get(key) {
      const entry = values.get(key);
      if (!entry) {
        return undefined;
      }
      if (entry.resetTime.getTime() <= Date.now()) {
        values.delete(key);
        return undefined;
      }
      return entry;
    },
    async increment(key) {
      const now = Date.now();
      const existing = values.get(key);
      const resetTime = new Date(now + windowMs);
      const totalHits = existing ? existing.totalHits + 1 : 1;
      values.set(key, { totalHits, resetTime });
      return { totalHits, resetTime };
    },
    async decrement(key) {
      const existing = values.get(key);
      if (!existing) {
        return;
      }
      const totalHits = Math.max(existing.totalHits - 1, 0);
      if (totalHits === 0) {
        values.delete(key);
      } else {
        values.set(key, { ...existing, totalHits });
      }
    },
    resetKey(key) {
      values.delete(key);
    },
    resetAll() {
      values.clear();
    },
  };
}

function createMockResponse() {
  let statusCode: number | undefined;
  let body: unknown;
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const res: Partial<Response> = {
    status(code: number) {
      statusCode = code;
      return res as Response;
    },
    json(payload: unknown) {
      body = payload;
      const finishListeners = listeners.get("finish") ?? [];
      finishListeners.forEach((listener) => listener());
      return res as Response;
    },
    setHeader() {
      return res as Response;
    },
    getHeader() {
      return undefined;
    },
    header() {
      return res as Response;
    },
    once(event: string, callback: (...args: unknown[]) => void) {
      const existing = listeners.get(event) ?? [];
      listeners.set(event, [...existing, callback]);
      return res as Response;
    },
    on(event: string, callback: (...args: unknown[]) => void) {
      const existing = listeners.get(event) ?? [];
      listeners.set(event, [...existing, callback]);
      return res as Response;
    },
    emit(event: string, ...args: unknown[]) {
      const eventListeners = listeners.get(event) ?? [];
      eventListeners.forEach((listener) => listener(...args));
      return true;
    },
    send(payload: unknown) {
      body = payload;
      const finishListeners = listeners.get("finish") ?? [];
      finishListeners.forEach((listener) => listener());
      return res as Response;
    },
  };

  return {
    res: res as Response,
    getStatusCode: () => statusCode,
    getBody: () => body,
  };
}

function createMockRequest(ip = "127.0.0.1") {
  return {
    ip,
    headers: {},
    app: { get: () => false, settings: {} } as unknown,
  } as Partial<Request> as Request;
}

function createMockNext(): MockNext {
  const nextImpl: MockNext = function (error?: unknown) {
    nextImpl.mock.calls.push([error]);
  } as MockNext;
  nextImpl.mock = { calls: [] };
  return nextImpl;
}

test("rate-limiting middleware", async (t) => {
  await t.test("allows requests when under rate limit", async () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 2, store: createInMemoryStore() });
    const req = createMockRequest();
    const { res, getStatusCode } = createMockResponse();
    const next = createMockNext();

    await new Promise<void>((resolve) => {
      limiter(req, res, (error?: unknown) => {
        next(error);
        resolve();
      });
    });

    assert.strictEqual(next.mock.calls.length, 1);
    assert.strictEqual(next.mock.calls[0][0], undefined);
    assert.strictEqual(getStatusCode(), undefined);
  });

  await t.test("blocks requests that exceed the rate limit", async () => {
    const limiter = createRateLimiter({ windowMs: 1000, max: 1, store: createInMemoryStore() });
    const req = createMockRequest();
    const { res, getStatusCode, getBody } = createMockResponse();
    const next = createMockNext();

    await new Promise<void>((resolve) => {
      limiter(req, res, (error?: unknown) => {
        next(error);
        resolve();
      });
    });

    await new Promise<void>((resolve) => {
      const response = res as Response & {
        once(event: string, callback: () => void): Response;
      };
      response.once("finish", resolve);
      limiter(req, res, (error?: unknown) => {
        next(error);
      });
    });

    assert.strictEqual(next.mock.calls.length, 1);
    assert.strictEqual(getStatusCode(), 429);
    assert.deepStrictEqual(getBody(), { error: "Too many requests, please try again later." });
  });
});
