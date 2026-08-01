import { Counter, Histogram } from "prom-client";
import { getMetricRegistry } from "../../../common/observability/prometheusRegistry.js";

const registry = getMetricRegistry();

export const copilotPlansGenerated = new Counter({
  name: "copilot_plans_generated_total",
  help: "Total number of copilot plans generated",
  labelNames: ["mode", "status"] as const,
  registers: [registry],
});

export const copilotExecutionsTotal = new Counter({
  name: "copilot_executions_total",
  help: "Total number of copilot tool executions",
  labelNames: ["tool", "status"] as const,
  registers: [registry],
});

export const copilotExecutionErrorsTotal = new Counter({
  name: "copilot_execution_errors_total",
  help: "Total number of copilot execution errors",
  labelNames: ["tool", "reason"] as const,
  registers: [registry],
});

export const copilotExecutionDuration = new Histogram({
  name: "copilot_execution_duration_seconds",
  help: "Duration of copilot tool executions in seconds",
  labelNames: ["tool"] as const,
  buckets: [0.1, 0.5, 1, 2, 5, 10, 30],
  registers: [registry],
});

export const copilotConfirmationsRequested = new Counter({
  name: "copilot_confirmations_requested_total",
  help: "Total number of copilot confirmations requested",
  labelNames: ["level", "outcome"] as const,
  registers: [registry],
});
