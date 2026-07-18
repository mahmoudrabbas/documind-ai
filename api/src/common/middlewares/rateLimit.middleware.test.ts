import test from "node:test";
import assert from "node:assert";
import type { Request, Response } from "express";
import type { Store } from "express-rate-limit";
import { config } from "../../config/index.js";
import {
  InMemorySlidingWindowLimitStore,
  buildHashedIpRateLimitKey,
  buildResendVerificationRateLimitScope,
  createRateLimiter,
  reserveResendVerificationRateLimit,
} from "./rateLimit.middleware.js";

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
    assert.deepStrictEqual(getBody(), {
      success: false,
      error: "RATE_LIMITED",
      message: "Too many requests, please try again later.",
      retryAfterSeconds: 1,
    });
  });

  await t.test("supports custom key generators and retry-after headers", async () => {
    const limiter = createRateLimiter({
      windowMs: 1000,
      max: 1,
      store: createInMemoryStore(),
      keyGenerator: (req) => String(req.headers["x-scope"] ?? "default"),
    });
    const reqA1 = createMockRequest();
    reqA1.headers["x-scope"] = "scope-a";
    const reqA2 = createMockRequest();
    reqA2.headers["x-scope"] = "scope-a";
    const reqB = createMockRequest();
    reqB.headers["x-scope"] = "scope-b";
    const { res, getStatusCode, getBody } = createMockResponse();
    const next = createMockNext();

    await new Promise<void>((resolve) => {
      limiter(reqA1, res, () => resolve());
    });

    await new Promise<void>((resolve) => {
      limiter(reqB, res, () => resolve());
    });

    await new Promise<void>((resolve) => {
      const response = res as Response & {
        once(event: string, callback: () => void): Response;
      };
      response.once("finish", resolve);
      limiter(reqA2, res, () => {
        next();
      });
    });

    assert.strictEqual(next.mock.calls.length, 0);
    assert.strictEqual(getStatusCode(), 429);
    assert.deepStrictEqual(getBody(), {
      success: false,
      error: "RATE_LIMITED",
      message: "Too many requests, please try again later.",
      retryAfterSeconds: 1,
    });
  });
});

test("resend verification rolling-window limits", async (t) => {
  const store = new InMemorySlidingWindowLimitStore();
  const originalPolicy = {
    cooldown: config.RESEND_VERIFICATION_COOLDOWN_MAX_REQUESTS,
    accountHourly: config.RESEND_VERIFICATION_PER_ACCOUNT_HOURLY_MAX_REQUESTS,
    accountDaily: config.RESEND_VERIFICATION_PER_ACCOUNT_DAILY_MAX_REQUESTS,
    ipHourly: config.RESEND_VERIFICATION_PER_IP_HOURLY_MAX_REQUESTS,
    ipDaily: config.RESEND_VERIFICATION_PER_IP_DAILY_MAX_REQUESTS,
    tenantDaily: config.RESEND_VERIFICATION_PER_TENANT_DAILY_MAX_REQUESTS,
  };

  const scope = buildResendVerificationRateLimitScope({
    companySlug: "acme-co",
    email: "user@example.com",
    ip: "127.0.0.1",
  });

  await t.test("second immediate request is blocked", async () => {
    const first = await reserveResendVerificationRateLimit(store, scope, 0);
    const second = await reserveResendVerificationRateLimit(store, scope, 1);

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, false);
    assert.equal(second.blockedPolicies[0]?.policy, "tenant-email-60s");
    assert.ok(second.retryAfterSeconds >= 1);
  });

  await t.test("fourth request in one rolling hour is blocked", async () => {
    const hourlyStore = new InMemorySlidingWindowLimitStore();
    const times = [
      0,
      61 * 1000,
      2 * 61 * 1000,
      3 * 61 * 1000,
    ];
    const results = await Promise.all(
      times.map((nowMs) =>
        reserveResendVerificationRateLimit(hourlyStore, scope, nowMs),
      ),
    );

    assert.equal(results[0]?.allowed, true);
    assert.equal(results[1]?.allowed, true);
    assert.equal(results[2]?.allowed, true);
    assert.equal(results[3]?.allowed, false);
    assert.equal(
      results[3]?.blockedPolicies.some(
        (policy) => policy.policy === "tenant-email-1h",
      ),
      true,
    );
  });

  await t.test("sixth request in 24 hours is blocked", async () => {
    const dailyStore = new InMemorySlidingWindowLimitStore();
    const results = [];
    for (let hour = 0; hour < 6; hour += 1) {
      results.push(
        await reserveResendVerificationRateLimit(
          dailyStore,
          scope,
          hour * 61 * 60 * 1000,
        ),
      );
    }

    for (const result of results.slice(0, 5)) {
      assert.equal(result.allowed, true);
    }
    assert.equal(results[5]?.allowed, false);
    assert.equal(
      results[5]?.blockedPolicies.some(
        (policy) => policy.policy === "tenant-email-24h",
      ),
      true,
    );
  });

  await t.test("limits expire correctly", async () => {
    const expiryStore = new InMemorySlidingWindowLimitStore();
    await reserveResendVerificationRateLimit(expiryStore, scope, 0);
    const blocked = await reserveResendVerificationRateLimit(
      expiryStore,
      scope,
      1,
    );
    const allowedAgain = await reserveResendVerificationRateLimit(
      expiryStore,
      scope,
      60 * 1000 + 1,
    );

    assert.equal(blocked.allowed, false);
    assert.equal(allowedAgain.allowed, true);
  });

  await t.test("tenant A and tenant B remain isolated for the same email", async () => {
    const isolatedStore = new InMemorySlidingWindowLimitStore();
    const tenantA = buildResendVerificationRateLimitScope({
      companySlug: "tenant-a",
      email: "shared@example.com",
      ip: "127.0.0.1",
    });
    const tenantB = buildResendVerificationRateLimitScope({
      companySlug: "tenant-b",
      email: "shared@example.com",
      ip: "127.0.0.1",
    });

    const firstA = await reserveResendVerificationRateLimit(
      isolatedStore,
      tenantA,
      0,
    );
    const firstB = await reserveResendVerificationRateLimit(
      isolatedStore,
      tenantB,
      1,
    );
    const secondA = await reserveResendVerificationRateLimit(
      isolatedStore,
      tenantA,
      2,
    );

    assert.equal(firstA.allowed, true);
    assert.equal(firstB.allowed, true);
    assert.equal(secondA.allowed, false);
    assert.equal(
      secondA.blockedPolicies.some(
        (policy) => policy.policy === "tenant-email-60s",
      ),
      true,
    );
  });

  await t.test("IP limits cannot be bypassed by changing email", async () => {
    config.RESEND_VERIFICATION_PER_IP_HOURLY_MAX_REQUESTS = 2;
    const ipStore = new InMemorySlidingWindowLimitStore();
    const first = await reserveResendVerificationRateLimit(
      ipStore,
      buildResendVerificationRateLimitScope({
        companySlug: "acme-co",
        email: "first@example.com",
        ip: "10.0.0.1",
      }),
      0,
    );
    const second = await reserveResendVerificationRateLimit(
      ipStore,
      buildResendVerificationRateLimitScope({
        companySlug: "acme-co",
        email: "second@example.com",
        ip: "10.0.0.1",
      }),
      61 * 1000,
    );
    const third = await reserveResendVerificationRateLimit(
      ipStore,
      buildResendVerificationRateLimitScope({
        companySlug: "acme-co",
        email: "third@example.com",
        ip: "10.0.0.1",
      }),
      2 * 61 * 1000,
    );

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    assert.equal(third.allowed, false);
    assert.equal(
      third.blockedPolicies.some((policy) => policy.policy === "ip-1h"),
      true,
    );
    config.RESEND_VERIFICATION_PER_IP_HOURLY_MAX_REQUESTS =
      originalPolicy.ipHourly;
  });

  await t.test("tenant-wide daily limits work", async () => {
    config.RESEND_VERIFICATION_PER_TENANT_DAILY_MAX_REQUESTS = 2;
    const tenantStore = new InMemorySlidingWindowLimitStore();
    const first = await reserveResendVerificationRateLimit(
      tenantStore,
      buildResendVerificationRateLimitScope({
        companySlug: "tenant-limit",
        email: "one@example.com",
        ip: "192.168.1.1",
      }),
      0,
    );
    const second = await reserveResendVerificationRateLimit(
      tenantStore,
      buildResendVerificationRateLimitScope({
        companySlug: "tenant-limit",
        email: "two@example.com",
        ip: "192.168.1.2",
      }),
      61 * 1000,
    );
    const third = await reserveResendVerificationRateLimit(
      tenantStore,
      buildResendVerificationRateLimitScope({
        companySlug: "tenant-limit",
        email: "three@example.com",
        ip: "192.168.1.3",
      }),
      2 * 61 * 1000,
    );

    assert.equal(first.allowed, true);
    assert.equal(second.allowed, true);
    assert.equal(third.allowed, false);
    assert.equal(
      third.blockedPolicies.some((policy) => policy.policy === "tenant-24h"),
      true,
    );
    config.RESEND_VERIFICATION_PER_TENANT_DAILY_MAX_REQUESTS =
      originalPolicy.tenantDaily;
  });

  await t.test("concurrent requests cannot exceed the configured allowance", async () => {
    const concurrentStore = new InMemorySlidingWindowLimitStore();
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        reserveResendVerificationRateLimit(concurrentStore, scope, 0),
      ),
    );
    const allowedCount = results.filter((result) => result.allowed).length;
    const blockedCount = results.length - allowedCount;

    assert.equal(allowedCount, 1);
    assert.equal(blockedCount, 9);
  });

  config.RESEND_VERIFICATION_COOLDOWN_MAX_REQUESTS = originalPolicy.cooldown;
  config.RESEND_VERIFICATION_PER_ACCOUNT_HOURLY_MAX_REQUESTS =
    originalPolicy.accountHourly;
  config.RESEND_VERIFICATION_PER_ACCOUNT_DAILY_MAX_REQUESTS =
    originalPolicy.accountDaily;
  config.RESEND_VERIFICATION_PER_IP_HOURLY_MAX_REQUESTS =
    originalPolicy.ipHourly;
  config.RESEND_VERIFICATION_PER_IP_DAILY_MAX_REQUESTS =
    originalPolicy.ipDaily;
  config.RESEND_VERIFICATION_PER_TENANT_DAILY_MAX_REQUESTS =
    originalPolicy.tenantDaily;
});

test("hashed IP rate-limit keys use IPv6 subnet grouping", async (t) => {
  await t.test("IPv4 addresses hash consistently", () => {
    const first = buildHashedIpRateLimitKey("127.0.0.1");
    const second = buildHashedIpRateLimitKey("127.0.0.1");
    const third = buildHashedIpRateLimitKey("127.0.0.2");

    assert.equal(first, second);
    assert.notEqual(first, third);
  });

  await t.test("IPv6 addresses within the same /56 share the same key", () => {
    const first = buildHashedIpRateLimitKey("2001:db8:abcd:1200::1");
    const second = buildHashedIpRateLimitKey("2001:db8:abcd:12ff::99");

    assert.equal(first, second);
  });

  await t.test("IPv6 addresses outside the /56 produce different keys", () => {
    const first = buildHashedIpRateLimitKey("2001:db8:abcd:1200::1");
    const second = buildHashedIpRateLimitKey("2001:db8:abce:1200::1");

    assert.notEqual(first, second);
  });
});
