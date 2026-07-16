import { Redis, type RedisOptions } from "ioredis";
import { config } from "../config/index.js";
import { logger } from "../logger.js";

let client: Redis | null = null;
let connected = false;

function createRedisClient(): Redis {
  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableOfflineQueue: true,
    lazyConnect: false,
    retryStrategy(times: number) {
      if (times > 10) {
        logger.error("redis max reconnect attempts reached");
        return null;
      }
      return Math.min(500 * 2 ** (times - 1), 10_000);
    },
  };

  const redis = new Redis(config.REDIS_URL, options);
  redis.on("ready", () => {
    connected = true;
    logger.info("redis connected");
  });
  redis.on("error", (err) => {
    connected = false;
    logger.error({ err: err.message }, "redis error");
  });
  redis.on("close", () => {
    connected = false;
  });
  return redis;
}

export function getRedisClient(): Redis {
  if (!client) client = createRedisClient();
  return client;
}

export function isRedisConnected(): boolean {
  return connected;
}

export async function disconnectRedis(): Promise<void> {
  if (!client) return;
  try {
    await client.quit();
  } catch {
    client.disconnect();
  } finally {
    client = null;
    connected = false;
  }
}
