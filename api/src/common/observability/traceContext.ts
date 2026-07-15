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

export function serializeTraceContext(ctx: TraceContext): Record<string, string> {
  const result: Record<string, string> = {
    "x-trace-id": ctx.traceId,
    "x-request-id": ctx.requestId,
  };
  if (ctx.tenantId) result["x-tenant-id"] = ctx.tenantId;
  if (ctx.actorId) result["x-actor-id"] = ctx.actorId;
  if (ctx.sessionId) result["x-session-id"] = ctx.sessionId;
  if (ctx.jobId) result["x-job-id"] = ctx.jobId;
  if (ctx.agentRunId) result["x-agent-run-id"] = ctx.agentRunId;
  if (ctx.providerEventId) result["x-provider-event-id"] = ctx.providerEventId;
  return result;
}

export function deserializeTraceContext(headers: Record<string, string | string[] | undefined>): TraceContext | undefined {
  const traceId = Array.isArray(headers["x-trace-id"]) ? headers["x-trace-id"][0] : headers["x-trace-id"];
  const requestId = Array.isArray(headers["x-request-id"]) ? headers["x-request-id"][0] : headers["x-request-id"];
  
  if (!traceId || !requestId) {
    return undefined;
  }

  const getStr = (key: string) => {
    const val = headers[key];
    return Array.isArray(val) ? val[0] : val;
  };

  return {
    traceId,
    requestId,
    tenantId: getStr("x-tenant-id"),
    actorId: getStr("x-actor-id"),
    sessionId: getStr("x-session-id"),
    jobId: getStr("x-job-id"),
    agentRunId: getStr("x-agent-run-id"),
    providerEventId: getStr("x-provider-event-id"),
  };
}
