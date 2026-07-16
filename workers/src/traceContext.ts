import { AsyncLocalStorage } from "node:async_hooks";

export interface TraceContext {
  traceId: string;
  requestId: string;
  tenantId?: string;
  actorId?: string;
  sessionId?: string;
  jobId?: string;
  agentRunId?: string;
  providerEventId?: string;
}

const asyncLocalStorage = new AsyncLocalStorage<TraceContext>();

export function withWorkerTraceContext<T>(
  ctx: TraceContext,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return asyncLocalStorage.run(ctx, fn);
}

export function getCurrentWorkerTraceContext(): TraceContext | undefined {
  return asyncLocalStorage.getStore();
}

export function deserializeTraceContext(envelope: Record<string, string | undefined>): TraceContext | undefined {
  const traceId = envelope["x-trace-id"];
  const requestId = envelope["x-request-id"];
  
  if (!traceId || !requestId) {
    return undefined;
  }

  return {
    traceId,
    requestId,
    tenantId: envelope["x-tenant-id"],
    actorId: envelope["x-actor-id"],
    sessionId: envelope["x-session-id"],
    jobId: envelope["x-job-id"],
    agentRunId: envelope["x-agent-run-id"],
    providerEventId: envelope["x-provider-event-id"],
  };
}
