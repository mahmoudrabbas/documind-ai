import { InMemoryJobHandlerRegistry } from "../queue/handlerRegistry.js";
import type { JobHandlerRegistry } from "@documind/contracts";
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
