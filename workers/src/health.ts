import http from "node:http";
import { logger } from "./logger.js";
import type { WorkerRuntime } from "./runtime.js";

function buildEnvelope(status: string, extra: Record<string, unknown> = {}) {
  return {
    status,
    checkedAt: new Date().toISOString(),
    uptimeMs: Math.round(process.uptime() * 1000),
    ...extra,
  };
}

export async function buildHealthResponse(
  runtime: WorkerRuntime,
  path: string | undefined,
): Promise<{ statusCode: number; body: Record<string, unknown> }> {
  if (path === "/healthz") {
    return {
      statusCode: 200,
      body: buildEnvelope("ok"),
    };
  }

  if (path === "/readyz") {
    try {
      const report = await runtime.readiness();
      return {
        statusCode: report.ready ? 200 : 503,
        body: {
          ...buildEnvelope(report.ready ? "ready" : "not_ready"),
          checks: report.checks,
          details: report.details,
        },
      };
    } catch {
      return {
        statusCode: 503,
        body: {
          status: "not_ready",
          error: "unavailable",
        },
      };
    }
  }

  if (path === "/metrics") {
    try {
      const metrics = await runtime.dispatcher.getMetrics();
      return {
        statusCode: 200,
        body: metrics as unknown as Record<string, unknown>,
      };
    } catch {
      return {
        statusCode: 500,
        body: {
          error: "unavailable",
        },
      };
    }
  }

  return {
    statusCode: 404,
    body: {
      error: "not found",
    },
  };
}

/**
 * Health HTTP server for the worker.
 *
 * - GET /healthz  — liveness: process is up and event loop responsive.
 * - GET /readyz   — readiness: Redis, MongoDB, handler registration, and the
 *                   consumer must all be healthy. Returns 503 otherwise, which
 *                   makes orchestrators keep the worker out of traffic.
 * - GET /metrics  — queue metrics snapshot (Super Admin diagnostic view).
 */
export function startHealthServer(
  runtime: WorkerRuntime,
  port = 3001,
  host = "0.0.0.0",
): http.Server {
  const server = http.createServer(async (req, res) => {
    const response = await buildHealthResponse(runtime, req.url);
    res.writeHead(response.statusCode, { "content-type": "application/json" });
    res.end(JSON.stringify(response.body));
  });

  server.listen(port, host, () => {
    logger.info({ port }, "health server listening");
  });

  return server;
}
