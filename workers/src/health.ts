import http from "node:http";
import { logger } from "./logger.js";
import type { WorkerRuntime } from "./runtime.js";

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
): http.Server {
  const server = http.createServer(async (req, res) => {
    if (req.url === "/healthz") {
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({ status: "ok" }));
      return;
    }

    if (req.url === "/readyz") {
      try {
        const report = await runtime.readiness();
        res.writeHead(report.ready ? 200 : 503, {
          "content-type": "application/json",
        });
        res.end(
          JSON.stringify({
            status: report.ready ? "ready" : "not_ready",
            checks: report.checks,
            details: report.details,
          }),
        );
      } catch (err) {
        res.writeHead(503, { "content-type": "application/json" });
        res.end(
          JSON.stringify({
            status: "not_ready",
            error: (err as Error).message,
          }),
        );
      }
      return;
    }

    if (req.url === "/metrics") {
      try {
        const metrics = await runtime.dispatcher.getMetrics();
        res.writeHead(200, { "content-type": "application/json" });
        res.end(JSON.stringify(metrics));
      } catch (err) {
        res.writeHead(500, { "content-type": "application/json" });
        res.end(JSON.stringify({ error: (err as Error).message }));
      }
      return;
    }

    res.writeHead(404, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "not found" }));
  });

  server.listen(port, "0.0.0.0", () => {
    logger.info({ port }, "health server listening");
  });

  return server;
}
