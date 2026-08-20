import { getDb, isMongoConnected } from "../../db/connection.js";
import { getRedisClient, isRedisConnected } from "../../db/redis.js";
import { config } from "../../config/index.js";

export type PlatformServiceStatus = "healthy" | "degraded" | "unavailable" | "down";

export interface PlatformServiceHealth {
  name: string;
  status: PlatformServiceStatus;
  checkedAt: string;
  latencyMs: number | null;
  details: Record<string, unknown>;
}

export interface PlatformHealthSummary {
  status: PlatformServiceStatus;
  checkedAt: string;
  summary: string;
  services: {
    api: PlatformServiceHealth;
    mongodb: PlatformServiceHealth;
    redis: PlatformServiceHealth;
    workers: PlatformServiceHealth;
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function buildServiceHealth(
  name: string,
  status: PlatformServiceStatus,
  latencyMs: number | null,
  details: Record<string, unknown> = {},
): PlatformServiceHealth {
  return {
    name,
    status,
    checkedAt: nowIso(),
    latencyMs,
    details,
  };
}

async function probeMongo(): Promise<PlatformServiceHealth> {
  const startedAt = Date.now();
  try {
    if (!isMongoConnected()) {
      return buildServiceHealth("MongoDB", "unavailable", null, {
        connected: false,
      });
    }
    const db = getDb();
    if (!db) {
      return buildServiceHealth("MongoDB", "unavailable", null, {
        connected: false,
      });
    }
    await db.admin().command({ ping: 1 });
    return buildServiceHealth("MongoDB", "healthy", Date.now() - startedAt, {
      connected: true,
    });
  } catch (error) {
    return buildServiceHealth("MongoDB", "unavailable", Date.now() - startedAt, {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function probeRedis(): Promise<PlatformServiceHealth> {
  const startedAt = Date.now();
  try {
    const redis = getRedisClient();
    const response = await redis.ping();
    return buildServiceHealth("Redis", response === "PONG" ? "healthy" : "degraded", Date.now() - startedAt, {
      connected: isRedisConnected(),
      response,
    });
  } catch (error) {
    return buildServiceHealth("Redis", "unavailable", Date.now() - startedAt, {
      connected: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function probeWorkers(): Promise<PlatformServiceHealth> {
  const startedAt = Date.now();
  const workerUrl = config.WORKER_HEALTH_URL;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 2500);
  try {
    const response = await fetch(workerUrl, { signal: controller.signal });
    const payload = (await response.json().catch(() => null)) as
      | { status?: string; checkedAt?: string; uptimeMs?: number; checks?: Record<string, unknown>; details?: Record<string, unknown> }
      | null;
    const healthy = response.ok && payload?.status === "ready";
    const status = healthy ? "healthy" : "unavailable";
    return buildServiceHealth(
      "Background workers",
      status,
      Date.now() - startedAt,
      {
        reachable: true,
        workerStatus: payload?.status ?? (response.ok ? "ready" : "not_ready"),
        checks: payload?.checks ?? {},
        details: payload?.details ?? {},
        checkedAt: payload?.checkedAt ?? nowIso(),
        uptimeMs: payload?.uptimeMs ?? null,
        reason:
          healthy
            ? undefined
            : payload?.status === "not_ready"
              ? "not_ready"
              : "unreachable",
      },
    );
  } catch (error) {
    return buildServiceHealth("Background workers", "unavailable", Date.now() - startedAt, {
      reachable: false,
      reason: normalizeWorkerProbeFailure(error),
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function probeApi(): Promise<PlatformServiceHealth> {
  return buildServiceHealth("API", "healthy", null, {
    uptimeMs: Math.round(process.uptime() * 1000),
    connected: true,
  });
}

function summarize(services: PlatformHealthSummary["services"]): PlatformHealthSummary["status"] {
  const values = Object.values(services).map((service) => service.status);
  if (values.some((status) => status === "unavailable")) return "down";
  if (values.some((status) => status === "degraded")) return "degraded";
  return "healthy";
}

function normalizeWorkerProbeFailure(error: unknown): "timeout" | "unreachable" {
  if (
    error instanceof DOMException &&
    error.name === "AbortError"
  ) {
    return "timeout";
  }
  if (error instanceof Error && error.name === "AbortError") {
    return "timeout";
  }
  return "unreachable";
}

export async function buildPlatformHealthSummary(): Promise<PlatformHealthSummary> {
  const [api, mongodb, redis, workers] = await Promise.all([
    probeApi(),
    probeMongo(),
    probeRedis(),
    probeWorkers(),
  ]);
  const services = { api, mongodb, redis, workers };
  const status = summarize(services);
  const healthyCount = Object.values(services).filter((service) => service.status === "healthy").length;
  const total = Object.keys(services).length;
  const summary =
    status === "healthy"
      ? "All critical services operational"
      : status === "degraded"
        ? `${healthyCount} of ${total} critical services operational`
        : "Critical platform services unavailable";

  return {
    status,
    checkedAt: nowIso(),
    summary,
    services,
  };
}
