import { config } from "./config/index.js";
import { logger } from "./logger.js";
import { getRedisClient, isRedisConnected } from "./db/redis.js";
import {
  connectMongo,
  pingMongo,
  isMongoConnected,
  disconnectMongo,
} from "./db/mongo.js";
import {
  BullMQQueue,
  InMemoryQueue,
  type JobDispatcher,
} from "./contracts/index.js";
import type { JobHandlerRegistry, WorkerReadiness } from "./contracts/index.js";
import { buildHandlerRegistry } from "./jobs/index.js";
import { publishQueueMetrics } from "./contracts/metrics.js";

export const QUEUE_NAME = "documind-jobs";

export interface WorkerRuntime {
  dispatcher: JobDispatcher;
  registry: JobHandlerRegistry;
  adapterKind: "bullmq" | "inmemory";
  start(): Promise<void>;
  stop(): Promise<void>;
  readiness(): Promise<WorkerReadiness>;
  /** Resolves when the runtime has fully shut down. */
  shutdownSignal: AbortSignal;
}

/**
 * Builds the worker runtime, selecting the queue adapter based on whether
 * Redis is reachable. When Redis is unavailable the runtime degrades to the
 * in-memory adapter (useful for local dev) but readiness still reports Redis
 * as unavailable so orchestrators can react.
 */
export async function createWorkerRuntime(): Promise<WorkerRuntime> {
  const registry = buildHandlerRegistry();
  const shutdownController = new AbortController();

  let dispatcher: JobDispatcher;
  let adapterKind: "bullmq" | "inmemory";
  let bullmq: BullMQQueue | null = null;
  let inMemory: InMemoryQueue | null = null;

  const redisAvailable = isRedisConnected();
  if (redisAvailable) {
    adapterKind = "bullmq";
    const redis = getRedisClient();
    bullmq = new BullMQQueue({
      queueName: QUEUE_NAME,
      connection: redis,
      concurrency: config.WORKER_CONCURRENCY,
      removeOnComplete: 5000,
      removeOnFail: false, // retain failed jobs as dead letters
    });
    for (const handler of registry.list()) bullmq.registerHandler(handler);
    dispatcher = bullmq;
    logger.info({ queue: QUEUE_NAME }, "using BullMQ queue adapter");
  } else {
    adapterKind = "inmemory";
    inMemory = new InMemoryQueue();
    for (const handler of registry.list()) inMemory.registerHandler(handler);
    dispatcher = inMemory;
    logger.warn(
      "redis unavailable — using in-memory queue adapter (not for production)",
    );
  }

  const start = async (): Promise<void> => {
    try {
      await connectMongo();
    } catch (err) {
      // Stay alive so readiness can report a degraded status (503) instead of
      // the process crashing. The consumer will not run until Mongo is up.
      logger.error(
        { err: (err as Error).message },
        "mongo connection failed during startup",
      );
    }
    if (bullmq) bullmq.start(shutdownController.signal);
    if (inMemory) inMemory.start();
    logger.info({ adapterKind }, "worker runtime started");
  };

  const stop = async (): Promise<void> => {
    shutdownController.abort();
    if (bullmq) await bullmq.close();
    if (inMemory) inMemory.stop();
    await disconnectMongo();
  };

  const readiness = async (): Promise<WorkerReadiness> => {
    const redisOk = isRedisConnected();
    const mongoOk = isMongoConnected() && (await pingMongo());
    const handlersRegistered = registry.list().length > 0;
    const consumerRunning =
      adapterKind === "bullmq"
        ? (bullmq?.isConsumerRunning() ?? false)
        : (inMemory?.isConsumerRunning() ?? false);

    const ready = redisOk && mongoOk && handlersRegistered && consumerRunning;

    // Surface metrics for the Super Admin status adapter.
    try {
      const metrics = await dispatcher.getMetrics();
      publishQueueMetrics(metrics);
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "failed to collect metrics");
    }

    return {
      ready,
      checks: {
        redis: redisOk,
        mongodb: mongoOk,
        handlersRegistered,
        consumerRunning,
      },
      details: {
        adapterKind,
        queue: QUEUE_NAME,
        handlerCount: registry.list().length,
      },
    };
  };

  return {
    dispatcher,
    registry,
    adapterKind,
    start,
    stop,
    readiness,
    shutdownSignal: shutdownController.signal,
  };
}
