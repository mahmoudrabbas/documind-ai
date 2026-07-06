/**
 * DocuMind AI — Workers entrypoint
 *
 * Background workers for document processing, embedding generation, and
 * queue consumption. This package is a workspace member of the docsai
 * monorepo (see root package.json `workspaces`).
 */

import dotenv from "dotenv";
import { config } from "./config/index.js";

dotenv.config();

const WORKER_NAME = "docsai-workers";

function main(): void {
  console.log(`[${WORKER_NAME}] starting...`);
  console.log(`  NODE_ENV:       ${config.NODE_ENV}`);
  console.log(`  LOG_LEVEL:      ${config.LOG_LEVEL}`);
  console.log(`  MONGODB_URI:    ${config.MONGODB_URI}`);
  console.log(`  REDIS_URL:      ${config.REDIS_URL}`);
  console.log(`  Concurrency:    ${config.WORKER_CONCURRENCY}`);
  console.log(`[${WORKER_NAME}] no jobs registered yet — exiting cleanly.`);
}

main();
