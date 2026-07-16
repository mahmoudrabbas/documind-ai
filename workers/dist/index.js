/**
 * DocuMind AI — Workers entrypoint
 *
 * Boots a resilient queue runtime: validates environment, connects Redis and
 * MongoDB, registers typed job handlers, starts the queue consumer, and
 * serves dependency-aware liveness/readiness probes. Shuts down gracefully on
 * SIGTERM/SIGINT, waiting for in-flight jobs to drain.
 */
import dotenv from "dotenv";
import { config } from "./config/index.js";
import { logger } from "./logger.js";
import { getRedisClient, isRedisConnected, disconnectRedis } from "./db/redis.js";
import { createWorkerRuntime } from "./runtime.js";
import { startHealthServer } from "./health.js";
dotenv.config();
const HEALTH_PORT = Number(process.env.WORKER_HEALTH_PORT ?? 3001);
async function main() {
    logger.info({
        nodeEnv: config.NODE_ENV,
        logLevel: config.LOG_LEVEL,
        mongodbConfigured: Boolean(config.MONGODB_URI),
        redisConfigured: Boolean(config.REDIS_URL),
        concurrency: config.WORKER_CONCURRENCY,
    }, "worker starting");
    // Eagerly create the Redis client so readiness reflects real connectivity.
    getRedisClient();
    let runtime = null;
    let healthServer = null;
    let shuttingDown = false;
    const shutdown = async (signal) => {
        if (shuttingDown)
            return;
        shuttingDown = true;
        logger.info({ signal }, "shutdown signal received; draining in-flight jobs");
        // Stop accepting new jobs and wait for in-flight jobs (BullMQ close()
        // honors its lock duration; in-memory loop stops scheduling new work).
        if (runtime) {
            try {
                await runtime.stop();
            }
            catch (err) {
                logger.error({ err: err.message }, "error during runtime stop");
            }
        }
        if (healthServer) {
            await new Promise((resolve) => healthServer.close(() => resolve()));
        }
        try {
            await disconnectRedis();
        }
        catch (err) {
            logger.error({ err: err.message }, "error disconnecting redis");
        }
        logger.info("worker shut down cleanly");
        process.exit(0);
    };
    process.on("SIGTERM", () => void shutdown("SIGTERM"));
    process.on("SIGINT", () => void shutdown("SIGINT"));
    // If Redis never connects, fail fast so the container is restarted —
    // a worker with no queue backend cannot process work.
    if (!isRedisConnected()) {
        // Give the client a brief moment to establish the connection.
        await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    runtime = await createWorkerRuntime();
    // Start the health server first so /readyz is always served (reporting a
    // degraded 503 when dependencies are unavailable) instead of the process
    // crashing or refusing connections.
    healthServer = startHealthServer(runtime, HEALTH_PORT);
    await runtime.start();
    const report = await runtime.readiness();
    if (!report.ready) {
        logger.error({ checks: report.checks }, "worker started but readiness checks failed");
    }
    else {
        logger.info("worker ready; consuming jobs");
    }
}
main().catch((err) => {
    logger.error({ err: err.message }, "fatal worker startup error");
    process.exit(1);
});
//# sourceMappingURL=index.js.map