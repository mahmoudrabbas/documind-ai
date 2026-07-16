import test from "node:test";
import assert from "node:assert";
import { createRateLimiter } from "./rateLimit.middleware.js";
function createInMemoryStore() {
    const values = new Map();
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
            }
            else {
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
    let statusCode;
    let body;
    const listeners = new Map();
    const res = {
        status(code) {
            statusCode = code;
            return res;
        },
        json(payload) {
            body = payload;
            const finishListeners = listeners.get("finish") ?? [];
            finishListeners.forEach((listener) => listener());
            return res;
        },
        setHeader() {
            return res;
        },
        getHeader() {
            return undefined;
        },
        header() {
            return res;
        },
        once(event, callback) {
            const existing = listeners.get(event) ?? [];
            listeners.set(event, [...existing, callback]);
            return res;
        },
        on(event, callback) {
            const existing = listeners.get(event) ?? [];
            listeners.set(event, [...existing, callback]);
            return res;
        },
        emit(event, ...args) {
            const eventListeners = listeners.get(event) ?? [];
            eventListeners.forEach((listener) => listener(...args));
            return true;
        },
        send(payload) {
            body = payload;
            const finishListeners = listeners.get("finish") ?? [];
            finishListeners.forEach((listener) => listener());
            return res;
        },
    };
    return {
        res: res,
        getStatusCode: () => statusCode,
        getBody: () => body,
    };
}
function createMockRequest(ip = "127.0.0.1") {
    return {
        ip,
        headers: {},
        app: { get: () => false, settings: {} },
    };
}
function createMockNext() {
    const nextImpl = function (error) {
        nextImpl.mock.calls.push([error]);
    };
    nextImpl.mock = { calls: [] };
    return nextImpl;
}
test("rate-limiting middleware", async (t) => {
    await t.test("allows requests when under rate limit", async () => {
        const limiter = createRateLimiter({ windowMs: 1000, max: 2, store: createInMemoryStore() });
        const req = createMockRequest();
        const { res, getStatusCode } = createMockResponse();
        const next = createMockNext();
        await new Promise((resolve) => {
            limiter(req, res, (error) => {
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
        await new Promise((resolve) => {
            limiter(req, res, (error) => {
                next(error);
                resolve();
            });
        });
        await new Promise((resolve) => {
            const response = res;
            response.once("finish", resolve);
            limiter(req, res, (error) => {
                next(error);
            });
        });
        assert.strictEqual(next.mock.calls.length, 1);
        assert.strictEqual(getStatusCode(), 429);
        assert.deepStrictEqual(getBody(), {
            success: false,
            error: "RATE_LIMITED",
            message: "Too many requests, please try again later.",
            retryAfterSeconds: 1,
        });
    });
});
//# sourceMappingURL=rateLimit.middleware.test.js.map