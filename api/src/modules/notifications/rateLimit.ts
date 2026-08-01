import type { Request, RequestHandler, Response } from "express";
import { rateLimit, type Store } from "express-rate-limit";
import RedisStore, { type RedisReply } from "rate-limit-redis";
import { RATE_LIMITED } from "../../common/errors/errorCodes.js";
import { getRedisClient } from "../../db/redis.js";

// ---------------------------------------------------------------------------
// Named constants (no magic numbers)
// ---------------------------------------------------------------------------

/** Allowed POST /notifications/test requests per tenant per window. */
export const TEST_LIMIT_PER_MIN = 10;
/** Window for the test-notification limiter, in milliseconds. */
export const TEST_RATE_LIMIT_WINDOW_MS = 60 * 1000;
/** Steady-state producer enqueue rate, in events per second per tenant. */
export const PRODUCER_RATE_PER_SEC = 100;
/** Maximum producer token-bucket capacity (burst), in events per tenant. */
export const PRODUCER_BURST = 500;
/** Redis key prefix for the tenant-keyed test-notification limiter. */
export const TEST_RATE_LIMIT_PREFIX = "rate-limit:notifications:test:";
/** Redis key prefix for per-tenant producer quota buckets. */
export const PRODUCER_QUOTA_PREFIX = "notifications:producer-quota:";

const DEFAULT_TEST_LIMIT_MESSAGE =
  "Too many test notification requests, please wait before trying again.";

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test";
}

// ---------------------------------------------------------------------------
// POST /notifications/test — tenant-keyed rate limiter
// ---------------------------------------------------------------------------

/**
 * Key generator that scopes the test-notification limiter per tenant rather
 * than per IP (the default `createRateLimiter` in rateLimit.middleware.ts is
 * IP-keyed). Unauthenticated requests share a single "unauthenticated" bucket.
 */
export function tenantTestNotificationKey(req: Request): string {
  const tenantId = req.auth?.tenantId;
  return tenantId ? `tenant:${tenantId}` : "unauthenticated";
}

function createRedisStore(
  redisClient = getRedisClient(),
  prefix = TEST_RATE_LIMIT_PREFIX,
): Store {
  return new RedisStore({
    sendCommand: (...args: string[]): Promise<RedisReply> => {
      const [command, ...rest] = args;
      return redisClient.call(
        command!,
        ...rest,
      ) as unknown as Promise<RedisReply>;
    },
    prefix,
    resetExpiryOnChange: true,
  });
}

function getRetryAfterSeconds(req: Request, windowMs: number): number {
  const resetTime = (
    req as Request & { rateLimit?: { resetTime?: Date } }
  ).rateLimit?.resetTime;

  if (!resetTime) {
    return Math.ceil(windowMs / 1000);
  }

  return Math.max(
    1,
    Math.ceil((resetTime.getTime() - Date.now()) / 1000),
  );
}

export interface TestNotificationRateLimiterOptions {
  windowMs?: number;
  max?: number;
  message?: string;
  /** Injectable store (tests use an in-memory store; no live Redis required). */
  store?: Store;
  redisClient?: ReturnType<typeof getRedisClient>;
  storePrefix?: string;
  keyGenerator?: (req: Request) => string;
}

/**
 * Express middleware factory for POST /notifications/test. Ten requests per
 * tenant per minute (10/min), keyed by `req.auth.tenantId`. In non-test
 * environments it builds on a rate-limit-redis sliding-window store; the store
 * is injectable so tests can use an in-memory fake without a live Redis.
 */
export function createTestNotificationRateLimiter(
  options: TestNotificationRateLimiterOptions = {},
): RequestHandler {
  const windowMs = options.windowMs ?? TEST_RATE_LIMIT_WINDOW_MS;
  const max = options.max ?? TEST_LIMIT_PER_MIN;
  const message = options.message ?? DEFAULT_TEST_LIMIT_MESSAGE;
  const keyGenerator = options.keyGenerator ?? tenantTestNotificationKey;
  const store =
    options.store ??
    (isTestEnv()
      ? undefined
      : options.redisClient
        ? createRedisStore(options.redisClient, options.storePrefix)
        : createRedisStore(undefined, options.storePrefix));

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator,
    handler(req: Request, res: Response) {
      const retryAfterSeconds = getRetryAfterSeconds(req, windowMs);
      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        error: RATE_LIMITED,
        message,
        retryAfterSeconds,
      });
    },
    store,
  });
}

// ---------------------------------------------------------------------------
// Per-tenant producer token bucket for notification enqueue
// ---------------------------------------------------------------------------

export type TokenBucketConsumeResult = {
  allowed: boolean;
  retryAfterMs: number;
};

/** Contract for per-tenant token bucket stores (injectable for tests). */
export interface TokenBucketQuotaStore {
  consume(
    tenantId: string,
    tokens?: number,
    nowMs?: number,
  ): Promise<TokenBucketConsumeResult>;
}

/** Thrown by `assertProducerQuota` when a tenant exceeds its enqueue quota. */
export class ProducerQuotaExceededError extends Error {
  readonly code = "PRODUCER_QUOTA_EXCEEDED";
  readonly tenantId: string;
  readonly retryAfterMs: number;

  constructor(tenantId: string, retryAfterMs: number) {
    super(
      `Producer quota exceeded for tenant ${tenantId}; retry in ${Math.ceil(retryAfterMs / 1000)}s`,
    );
    this.name = "ProducerQuotaExceededError";
    this.tenantId = tenantId;
    this.retryAfterMs = retryAfterMs;
  }
}

const REDIS_PRODUCER_TOKEN_BUCKET_SCRIPT = `
local key = KEYS[1]
local ratePerSec = tonumber(ARGV[1])
local burst = tonumber(ARGV[2])
local nowMs = tonumber(ARGV[3])
local requested = tonumber(ARGV[4])

local bucket = redis.call("HMGET", key, "tokens", "last")
local available = tonumber(bucket[1])
local lastMs = tonumber(bucket[2])

if available == nil or lastMs == nil then
  available = burst
  lastMs = nowMs
end

local elapsedSec = math.max(0, (nowMs - lastMs) / 1000)
available = math.min(burst, available + elapsedSec * ratePerSec)

if available >= requested then
  available = available - requested
  redis.call("HSET", key, "tokens", available, "last", nowMs)
  local ttlMs = math.max(60000, math.ceil((burst / ratePerSec) * 1000) + 60000)
  redis.call("PEXPIRE", key, ttlMs)
  return {1, 0}
end

local retryAfterMs = math.max(1, math.ceil(((requested - available) / ratePerSec) * 1000))
return {0, retryAfterMs}
`;

/** Redis-backed token bucket store (atomic Lua). Rate + burst per tenant. */
export class RedisTokenBucketQuotaStore implements TokenBucketQuotaStore {
  private readonly ratePerSec: number;
  private readonly burst: number;
  private readonly redisClient: ReturnType<typeof getRedisClient>;
  private readonly prefix: string;

  constructor(options: {
    ratePerSec: number;
    burst: number;
    redisClient?: ReturnType<typeof getRedisClient>;
    prefix?: string;
  }) {
    this.ratePerSec = options.ratePerSec;
    this.burst = options.burst;
    this.redisClient = options.redisClient ?? getRedisClient();
    this.prefix = options.prefix ?? PRODUCER_QUOTA_PREFIX;
  }

  async consume(
    tenantId: string,
    tokens = 1,
    nowMs = Date.now(),
  ): Promise<TokenBucketConsumeResult> {
    const key = `${this.prefix}${tenantId}`;
    const raw = (await this.redisClient.eval(
      REDIS_PRODUCER_TOKEN_BUCKET_SCRIPT,
      1,
      key,
      String(this.ratePerSec),
      String(this.burst),
      String(nowMs),
      String(tokens),
    )) as number[];

    return {
      allowed: Number(raw[0]) === 1,
      retryAfterMs: Number(raw[1] ?? 0),
    };
  }
}

/** In-memory token bucket store for tests and non-Redis environments. */
export class InMemoryTokenBucketQuotaStore implements TokenBucketQuotaStore {
  private readonly buckets = new Map<
    string,
    { tokens: number; lastRefillMs: number }
  >();
  private readonly ratePerSec: number;
  private readonly burst: number;
  private readonly now: () => number;

  constructor(options: {
    ratePerSec: number;
    burst: number;
    now?: () => number;
  }) {
    this.ratePerSec = options.ratePerSec;
    this.burst = options.burst;
    this.now = options.now ?? Date.now;
  }

  async consume(
    tenantId: string,
    tokens = 1,
    nowMs?: number,
  ): Promise<TokenBucketConsumeResult> {
    const now = nowMs ?? this.now();
    const existing = this.buckets.get(tenantId);
    const bucket = existing ?? { tokens: this.burst, lastRefillMs: now };
    const elapsedSec = Math.max(0, (now - bucket.lastRefillMs) / 1000);
    bucket.tokens = Math.min(
      this.burst,
      bucket.tokens + elapsedSec * this.ratePerSec,
    );
    bucket.lastRefillMs = now;

    if (bucket.tokens >= tokens) {
      bucket.tokens -= tokens;
      this.buckets.set(tenantId, bucket);
      return { allowed: true, retryAfterMs: 0 };
    }

    const retryAfterMs = Math.max(
      1,
      Math.ceil(((tokens - bucket.tokens) / this.ratePerSec) * 1000),
    );
    return { allowed: false, retryAfterMs };
  }
}

export interface ProducerQuotaLimiter {
  assertProducerQuota(tenantId: string, tokens?: number): Promise<void>;
}

/**
 * Factory for a per-tenant producer quota check. The store is injectable so
 * tests can use an in-memory fake without a live Redis. Rate/burst default to
 * the named PRODUCER_RATE_PER_SEC / PRODUCER_BURST constants.
 */
export function createProducerQuotaLimiter(options: {
  store?: TokenBucketQuotaStore;
  ratePerSec?: number;
  burst?: number;
  redisClient?: ReturnType<typeof getRedisClient>;
  prefix?: string;
} = {}): ProducerQuotaLimiter {
  const ratePerSec = options.ratePerSec ?? PRODUCER_RATE_PER_SEC;
  const burst = options.burst ?? PRODUCER_BURST;
  const store =
    options.store ??
    new RedisTokenBucketQuotaStore({
      ratePerSec,
      burst,
      redisClient: options.redisClient,
      prefix: options.prefix,
    });

  return {
    async assertProducerQuota(tenantId: string, tokens = 1): Promise<void> {
      const result = await store.consume(tenantId, tokens);
      if (!result.allowed) {
        throw new ProducerQuotaExceededError(tenantId, result.retryAfterMs);
      }
    },
  };
}

let defaultProducerQuotaLimiter: ProducerQuotaLimiter | null = null;

/**
 * Default Redis-backed producer quota check (lazy init so importing this
 * module never connects to Redis). Throws ProducerQuotaExceededError when a
 * tenant exceeds its 100 events/sec (burst 500) enqueue quota.
 */
export async function assertProducerQuota(
  tenantId: string,
  tokens = 1,
): Promise<void> {
  defaultProducerQuotaLimiter ??= createProducerQuotaLimiter();
  await defaultProducerQuotaLimiter.assertProducerQuota(tenantId, tokens);
}
