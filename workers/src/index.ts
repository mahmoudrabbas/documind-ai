/**
 * DocuMind AI — Workers entrypoint
 *
 * Background workers for document processing, embedding generation, and
 * queue consumption. This package is a workspace member of the docsai
 * monorepo (see root package.json `workspaces`).
 */

import dotenv from "dotenv";
import { config } from "./config/index.js";
import { logger } from "./logger.js";

dotenv.config();

const WORKER_NAME = "docsai-workers";

function main(): void {
  logger.info(
    {
      nodeEnv: config.NODE_ENV,
      logLevel: config.LOG_LEVEL,
      mongodbUri: config.MONGODB_URI,
      redisUrl: config.REDIS_URL,
      concurrency: config.WORKER_CONCURRENCY,
    },
    "worker starting",
  );
  logger.info("worker has no jobs registered yet; exiting cleanly");
}

main();
