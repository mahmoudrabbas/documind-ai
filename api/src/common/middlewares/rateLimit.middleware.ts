import type { RequestHandler } from "express";
import { rateLimit, type Store } from "express-rate-limit";
import RedisStore, { type RedisReply } from "rate-limit-redis";
import { config } from "../../config/index.js";
import { getRedisClient } from "../../db/redis.js";

function createRedisStore(redisClient = getRedisClient()): Store {
  return new RedisStore({
    sendCommand: (...args: string[]): Promise<RedisReply> => {
      const [command, ...rest] = args;
      return redisClient.call(
        command!,
        ...rest,
      ) as unknown as Promise<RedisReply>;
    },
    prefix: "rate-limit:",
    resetExpiryOnChange: true,
  });
}

export function createRateLimiter(
  options: {
    windowMs?: number;
    max?: number;
    message?: string;
    store?: Store;
    redisClient?: ReturnType<typeof getRedisClient>;
  } = {},
): RequestHandler {
  const windowMs = options.windowMs ?? config.RATE_LIMIT_WINDOW_MS;
  const max = options.max ?? config.RATE_LIMIT_MAX_REQUESTS;
  const message = options.message ?? config.RATE_LIMIT_MESSAGE;
  const store =
    options.store ??
    (options.redisClient
      ? createRedisStore(options.redisClient)
      : createRedisStore());

  return rateLimit({
    windowMs,
    max,
    standardHeaders: true,
    legacyHeaders: false,
    skipFailedRequests: true,
    message: { error: message },
    store,
  });
}

export function authRateLimiter() {
  return createRateLimiter();
}
