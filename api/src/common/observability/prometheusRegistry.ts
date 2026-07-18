import { Registry } from "prom-client";

/**
 * Singleton Prometheus registry shared across the API process.
 * Metrics are registered here and exposed via the /metrics endpoint.
 */
let registry: Registry | null = null;

export function getMetricRegistry(): Registry {
  if (!registry) {
    registry = new Registry();
  }
  return registry;
}

/**
 * Resets all registered metrics. Intended for test teardown only.
 */
export function resetMetricRegistry(): void {
  if (registry) {
    registry.clear();
  }
  registry = null;
}
