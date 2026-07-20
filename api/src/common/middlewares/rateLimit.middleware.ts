import crypto from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import { ipKeyGenerator, rateLimit, type Store } from "express-rate-limit";
import RedisStore, { type RedisReply } from "rate-limit-redis";
import { RATE_LIMITED } from "../errors/errorCodes.js";
import { config } from "../../config/index.js";
import { getRedisClient } from "../../db/redis.js";
import { createAuditLog } from "../../modules/audit/audit.repository.js";

function isTestEnv() {
  return process.env.NODE_ENV === "test";
}

function createRedisStore(
  redisClient = getRedisClient(),
  prefix = "rate-limit:",
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

function getRetryAfterSeconds(req: Request, windowMs: number) {
  const resetTime = (
    req as Request & {
      rateLimit?: {
        resetTime?: Date;
      };
    }
  ).rateLimit?.resetTime;

  if (!resetTime) {
    return Math.ceil(windowMs / 1000);
  }

  return Math.max(
    1,
    Math.ceil((resetTime.getTime() - Date.now()) / 1000),
  );
}

function normalizeBodyField(value: unknown) {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

function hashRateLimitScope(value: string) {
  return crypto.createHash("sha256").update(value).digest("hex");
}

type SlidingWindowReservationInput = {
  key: string;
  limit: number;
  windowMs: number;
};

type SlidingWindowReservationResult = {
  allowed: boolean;
  retryAfterMs: number;
  blockedIndexes: number[];
};

interface SlidingWindowLimitStore {
  reserve(
    windows: SlidingWindowReservationInput[],
    nowMs: number,
  ): Promise<SlidingWindowReservationResult>;
  rememberDistinctMember(
    key: string,
    member: string,
    ttlMs: number,
  ): Promise<number>;
}

type ResendVerificationRateLimitScope = {
  normalizedTenantSlug: string;
  normalizedEmail: string;
  normalizedIp: string;
  tenantSlugHash: string;
  tenantEmailHash: string;
  emailHash: string;
  ipHash: string;
};

type ResendVerificationLimitDescriptor = SlidingWindowReservationInput & {
  scope: "tenant-email" | "ip" | "tenant";
  policy:
    | "tenant-email-60s"
    | "tenant-email-1h"
    | "tenant-email-24h"
    | "ip-1h"
    | "ip-24h"
    | "tenant-24h";
};

const REDIS_RESERVE_SLIDING_WINDOWS_SCRIPT = `
local keyCount = tonumber(ARGV[1])
local nowMs = tonumber(ARGV[2])
local requestId = ARGV[3]
local blocked = {}
local maxRetryMs = 0

for i = 1, keyCount do
  local argOffset = 3 + ((i - 1) * 2)
  local windowMs = tonumber(ARGV[argOffset + 1])
  local limit = tonumber(ARGV[argOffset + 2])
  local key = KEYS[i]
  redis.call("ZREMRANGEBYSCORE", key, "-inf", nowMs - windowMs)
  local count = redis.call("ZCARD", key)

  if count >= limit then
    local oldest = redis.call("ZRANGE", key, 0, 0, "WITHSCORES")
    local retryMs = 1000
    if oldest[2] ~= nil then
      retryMs = windowMs - (nowMs - tonumber(oldest[2]))
    end
    if retryMs < 1000 then
      retryMs = 1000
    end
    if retryMs > maxRetryMs then
      maxRetryMs = retryMs
    end
    table.insert(blocked, i)
  end
end

if #blocked > 0 then
  local response = {0, maxRetryMs}
  for i = 1, #blocked do
    table.insert(response, blocked[i])
  end
  return response
end

for i = 1, keyCount do
  local argOffset = 3 + ((i - 1) * 2)
  local windowMs = tonumber(ARGV[argOffset + 1])
  local key = KEYS[i]
  local member = requestId .. ":" .. i
  redis.call("ZADD", key, nowMs, member)
  redis.call("PEXPIRE", key, windowMs)
end

return {1, 0}
`;

const REDIS_REMEMBER_DISTINCT_MEMBER_SCRIPT = `
redis.call("SADD", KEYS[1], ARGV[1])
redis.call("PEXPIRE", KEYS[1], tonumber(ARGV[2]))
return redis.call("SCARD", KEYS[1])
`;

class RedisSlidingWindowLimitStore implements SlidingWindowLimitStore {
  async reserve(
    windows: SlidingWindowReservationInput[],
    nowMs: number,
  ): Promise<SlidingWindowReservationResult> {
    const redis = getRedisClient();
    const keys = windows.map((window) => window.key);
    const args = [
      String(windows.length),
      String(nowMs),
      crypto.randomUUID(),
      ...windows.flatMap((window) => [
        String(window.windowMs),
        String(window.limit),
      ]),
    ];
    const raw = (await redis.eval(
      REDIS_RESERVE_SLIDING_WINDOWS_SCRIPT,
      keys.length,
      ...keys,
      ...args,
    )) as number[];

    return {
      allowed: Number(raw[0]) === 1,
      retryAfterMs: Number(raw[1] ?? 0),
      blockedIndexes: raw.slice(2).map((value) => Number(value) - 1),
    };
  }

  async rememberDistinctMember(
    key: string,
    member: string,
    ttlMs: number,
  ): Promise<number> {
    const redis = getRedisClient();
    const result = await redis.eval(
      REDIS_REMEMBER_DISTINCT_MEMBER_SCRIPT,
      1,
      key,
      member,
      String(ttlMs),
    );
    return Number(result);
  }
}

export class InMemorySlidingWindowLimitStore implements SlidingWindowLimitStore {
  private readonly windows = new Map<string, number[]>();
  private readonly distinctMembers = new Map<
    string,
    Map<string, number>
  >();

  async reserve(
    windows: SlidingWindowReservationInput[],
    nowMs: number,
  ): Promise<SlidingWindowReservationResult> {
    const blockedIndexes: number[] = [];
    let retryAfterMs = 0;

    for (const [index, window] of windows.entries()) {
      const values = this.windows.get(window.key) ?? [];
      const fresh = values.filter((value) => value > nowMs - window.windowMs);
      this.windows.set(window.key, fresh);
      if (fresh.length >= window.limit) {
        const oldest = fresh[0] ?? nowMs;
        const retry = Math.max(1000, window.windowMs - (nowMs - oldest));
        blockedIndexes.push(index);
        retryAfterMs = Math.max(retryAfterMs, retry);
      }
    }

    if (blockedIndexes.length > 0) {
      return {
        allowed: false,
        retryAfterMs,
        blockedIndexes,
      };
    }

    for (const window of windows) {
      const values = this.windows.get(window.key) ?? [];
      values.push(nowMs);
      this.windows.set(window.key, values);
    }

    return {
      allowed: true,
      retryAfterMs: 0,
      blockedIndexes: [],
    };
  }

  async rememberDistinctMember(
    key: string,
    member: string,
    ttlMs: number,
  ): Promise<number> {
    const expiresAt = Date.now() + ttlMs;
    const bucket = this.distinctMembers.get(key) ?? new Map<string, number>();
    for (const [existingMember, existingExpiresAt] of bucket.entries()) {
      if (existingExpiresAt <= Date.now()) {
        bucket.delete(existingMember);
      }
    }
    bucket.set(member, expiresAt);
    this.distinctMembers.set(key, bucket);
    return bucket.size;
  }
}

function createSlidingWindowLimitStore(): SlidingWindowLimitStore {
  if (isTestEnv()) {
    return new InMemorySlidingWindowLimitStore();
  }
  return new RedisSlidingWindowLimitStore();
}

function normalizeRateLimitIp(value: string | undefined) {
  return value?.trim() || "unknown";
}

export function buildHashedIpRateLimitKey(
  ip: string | undefined,
  ipv6Subnet = 56,
) {
  return hashRateLimitScope(ipKeyGenerator(normalizeRateLimitIp(ip), ipv6Subnet));
}

export function buildResendVerificationRateLimitScope(
  input: {
    companySlug?: unknown;
    email?: unknown;
    ip?: string;
  },
): ResendVerificationRateLimitScope {
  const normalizedTenantSlug = normalizeBodyField(input.companySlug);
  const normalizedEmail = normalizeBodyField(input.email);
  const normalizedIp = normalizeRateLimitIp(input.ip);

  return {
    normalizedTenantSlug,
    normalizedEmail,
    normalizedIp,
    tenantSlugHash: hashRateLimitScope(normalizedTenantSlug || "unknown-tenant"),
    tenantEmailHash: hashRateLimitScope(
      `${normalizedTenantSlug || "unknown-tenant"}:${normalizedEmail || "unknown-email"}`,
    ),
    emailHash: hashRateLimitScope(normalizedEmail || "unknown-email"),
    ipHash: buildHashedIpRateLimitKey(normalizedIp),
  };
}

function buildResendVerificationLimitDescriptors(
  scope: ResendVerificationRateLimitScope,
): ResendVerificationLimitDescriptor[] {
  return [
    {
      key: `rate-limit:auth-resend-verification:tenant-email:60s:${scope.tenantEmailHash}`,
      limit: config.RESEND_VERIFICATION_COOLDOWN_MAX_REQUESTS,
      windowMs: config.RESEND_VERIFICATION_COOLDOWN_MS,
      scope: "tenant-email",
      policy: "tenant-email-60s",
    },
    {
      key: `rate-limit:auth-resend-verification:tenant-email:1h:${scope.tenantEmailHash}`,
      limit: config.RESEND_VERIFICATION_PER_ACCOUNT_HOURLY_MAX_REQUESTS,
      windowMs: 60 * 60 * 1000,
      scope: "tenant-email",
      policy: "tenant-email-1h",
    },
    {
      key: `rate-limit:auth-resend-verification:tenant-email:24h:${scope.tenantEmailHash}`,
      limit: config.RESEND_VERIFICATION_PER_ACCOUNT_DAILY_MAX_REQUESTS,
      windowMs: 24 * 60 * 60 * 1000,
      scope: "tenant-email",
      policy: "tenant-email-24h",
    },
    {
      key: `rate-limit:auth-resend-verification:ip:1h:${scope.ipHash}`,
      limit: config.RESEND_VERIFICATION_PER_IP_HOURLY_MAX_REQUESTS,
      windowMs: 60 * 60 * 1000,
      scope: "ip",
      policy: "ip-1h",
    },
    {
      key: `rate-limit:auth-resend-verification:ip:24h:${scope.ipHash}`,
      limit: config.RESEND_VERIFICATION_PER_IP_DAILY_MAX_REQUESTS,
      windowMs: 24 * 60 * 60 * 1000,
      scope: "ip",
      policy: "ip-24h",
    },
    {
      key: `rate-limit:auth-resend-verification:tenant:24h:${scope.tenantSlugHash}`,
      limit: config.RESEND_VERIFICATION_PER_TENANT_DAILY_MAX_REQUESTS,
      windowMs: 24 * 60 * 60 * 1000,
      scope: "tenant",
      policy: "tenant-24h",
    },
  ];
}

async function emitResendVerificationSecurityEvent(input: {
  action:
    | "AUTH_RESEND_VERIFICATION_RATE_LIMITED"
    | "AUTH_RESEND_VERIFICATION_TENANT_CEILING_REACHED"
    | "AUTH_RESEND_VERIFICATION_UNUSUAL_IP_EMAIL_SPREAD";
  resourceId: string;
  changes: Record<string, unknown>;
}) {
  try {
    await createAuditLog({
      tenantId: "system",
      userId: "system",
      resourceType: "AuthSecurity",
      resourceId: input.resourceId,
      action: input.action,
      actorId: "system",
      actorEmail: "system@documind.ai",
      actorRole: null,
      actorKind: "SYSTEM",
      changes: input.changes,
      metadata: {
        source: "resend-verification-rate-limit",
      },
    });
  } catch (error) {
    console.warn("[resend-verification-rate-limit-monitoring-failed]", error);
  }
}

async function monitorResendVerificationEmailSpread(
  store: SlidingWindowLimitStore,
  scope: ResendVerificationRateLimitScope,
) {
  const distinctCount = await store.rememberDistinctMember(
    `monitor:auth-resend-verification:ip-email-spread:${scope.ipHash}`,
    scope.emailHash,
    24 * 60 * 60 * 1000,
  );

  if (
    distinctCount >=
    config.RESEND_VERIFICATION_IP_DISTINCT_EMAILS_24H_MONITOR_THRESHOLD
  ) {
    await emitResendVerificationSecurityEvent({
      action: "AUTH_RESEND_VERIFICATION_UNUSUAL_IP_EMAIL_SPREAD",
      resourceId: scope.ipHash,
      changes: {
        ipHash: scope.ipHash,
        distinctEmailHashes24h: distinctCount,
      },
    });
  }
}

export async function reserveResendVerificationRateLimit(
  store: SlidingWindowLimitStore,
  scope: ResendVerificationRateLimitScope,
  nowMs = Date.now(),
) {
  const descriptors = buildResendVerificationLimitDescriptors(scope);
  const reservation = await store.reserve(descriptors, nowMs);
  const blockedPolicies = reservation.blockedIndexes
    .map((index) => descriptors[index])
    .filter((descriptor): descriptor is ResendVerificationLimitDescriptor =>
      Boolean(descriptor),
    );

  return {
    allowed: reservation.allowed,
    retryAfterSeconds: Math.max(
      1,
      Math.ceil(reservation.retryAfterMs / 1000),
    ),
    blockedPolicies,
  };
}

export function createRateLimiter(
  options: {
    windowMs?: number;
    max?: number;
    message?: string;
    store?: Store;
    redisClient?: ReturnType<typeof getRedisClient>;
    storePrefix?: string;
    keyGenerator?: (req: Request) => string;
    skipFailedRequests?: boolean;
  } = {},
): RequestHandler {
  const windowMs = options.windowMs ?? config.RATE_LIMIT_WINDOW_MS;
  const max = options.max ?? config.RATE_LIMIT_MAX_REQUESTS;
  const message = options.message ?? config.RATE_LIMIT_MESSAGE;
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
    skipFailedRequests: options.skipFailedRequests ?? false,
    keyGenerator: options.keyGenerator,
    handler(req, res) {
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

export function authRateLimiter() {
  return createRateLimiter();
}

export function resendVerificationEmailRateLimiter() {
  const store = createSlidingWindowLimitStore();

  return async (
    req: Request,
    res: Response,
    next: NextFunction,
  ): Promise<void> => {
    try {
      const scope = buildResendVerificationRateLimitScope({
        companySlug: req.body?.companySlug,
        email: req.body?.email,
        ip: req.ip,
      });
      const result = await reserveResendVerificationRateLimit(store, scope);

      await monitorResendVerificationEmailSpread(store, scope);

      if (result.allowed) {
        next();
        return;
      }

      const retryAfterSeconds = result.retryAfterSeconds;
      const blockedPolicyIds = result.blockedPolicies.map(
        (policy) => policy.policy,
      );

      if (result.blockedPolicies.some((policy) => policy.scope === "ip")) {
        await emitResendVerificationSecurityEvent({
          action: "AUTH_RESEND_VERIFICATION_RATE_LIMITED",
          resourceId: scope.ipHash,
          changes: {
            scope: "ip",
            ipHash: scope.ipHash,
            tenantSlugHash: scope.tenantSlugHash,
            tenantEmailHash: scope.tenantEmailHash,
            blockedPolicies: blockedPolicyIds,
            retryAfterSeconds,
          },
        });
      }

      if (
        result.blockedPolicies.some((policy) => policy.policy === "tenant-24h")
      ) {
        await emitResendVerificationSecurityEvent({
          action: "AUTH_RESEND_VERIFICATION_TENANT_CEILING_REACHED",
          resourceId: scope.tenantSlugHash,
          changes: {
            tenantSlugHash: scope.tenantSlugHash,
            blockedPolicies: blockedPolicyIds,
            retryAfterSeconds,
          },
        });
      }

      res.setHeader("Retry-After", String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        error: RATE_LIMITED,
        message:
          "Too many verification resend attempts, please wait before trying again.",
        retryAfterSeconds,
      });
    } catch (error) {
      next(error);
    }
  };
}
