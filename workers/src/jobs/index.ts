import { InMemoryJobHandlerRegistry } from "../contracts/handlerRegistry.js";
import type { JobHandlerRegistry } from "../contracts/jobDispatcher.js";
import { sampleJobHandler } from "./sampleJob.js";

/**
 * Assembles the worker's handler registry.
 *
 * Product issues register their OWN typed jobs here (against the JobDispatcher
 * port) before the real worker consumer merges — satisfying the parallel-safety
 * contract. This module intentionally contains NO product-specific processors.
 */
export function buildHandlerRegistry(): JobHandlerRegistry {
  const registry = new InMemoryJobHandlerRegistry();
  registry.register(sampleJobHandler);
  return registry;
}
