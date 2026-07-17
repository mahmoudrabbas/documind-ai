import { Redis, type RedisOptions } from "ioredis";
import { config } from "../config/index.js";

let client: Redis | null = null;
let isConnected = false;

function isTestEnv(): boolean {
  return process.env.NODE_ENV === "test";
}

function createClient(): Redis {
  const options: RedisOptions = {
    retryStrategy(times: number) {
      const maxAttempts = isTestEnv() ? 1 : 10;

      if (times > maxAttempts) {
        if (!isTestEnv()) {
          console.warn(
            `[redis] Max reconnect attempts (${maxAttempts}) reached. Giving up.`,
          );
        }
        return null;
      }

      const baseDelay = isTestEnv() ? 10 : 500;
      const delay = Math.min(baseDelay * 2 ** (times - 1), 10_000);

      if (!isTestEnv()) {
        console.warn(`[redis] Reconnecting in ${delay}ms (attempt ${times})`);
      }

      return delay;
    },
    maxRetriesPerRequest: null,
    enableOfflineQueue: !isTestEnv(),
    lazyConnect: false,
  };

  const redis = new Redis(config.REDIS_URL, options);

  redis.on("connect", () => {
    if (!isTestEnv()) console.log("[redis] Connecting...");
  });

  redis.on("ready", () => {
    isConnected = true;
    if (!isTestEnv()) console.log("✅ Redis Connected");
  });

  redis.on("error", (err: Error) => {
    isConnected = false;
    if (!isTestEnv()) console.error("❌ Redis Error:", err.message);
  });

  redis.on("close", () => {
    isConnected = false;
    if (!isTestEnv()) console.warn("[redis] Connection closed");
  });

  redis.on("reconnecting", () => {
    if (!isTestEnv()) console.warn("[redis] Reconnecting...");
  });

  return redis;
}

export function getRedisClient(): Redis {
  if (!client) {
    client = createClient();
  }

  return client;
}

export async function connectRedis(): Promise<void> {
  try {
    const redis = getRedisClient();

    const state = redis.status;
    if (state === "ready") {
      isConnected = true;
      return;
    }

    await redis.ping();
    isConnected = true;
  } catch (err) {
    if (!isTestEnv()) {
      console.warn(
        "[redis] Initial connection failed. App will run without Redis.",
        err instanceof Error ? err.message : String(err),
      );
    }
    isConnected = false;
  }
}

export async function disconnectRedis(): Promise<void> {
  if (!client) {
    return;
  }

  try {
    await client.quit();
    if (!isTestEnv()) console.log("[redis] Disconnected gracefully");
  } catch (err) {
    client.disconnect(false);
    if (!isTestEnv()) console.error("[redis] Error during disconnect:", err);
  } finally {
    client = null;
    isConnected = false;
  }
}

export function isRedisConnected(): boolean {
  return isConnected;
}
