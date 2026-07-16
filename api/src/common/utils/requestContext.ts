import { AsyncLocalStorage } from "node:async_hooks";
import type { TraceContext } from "../observability/traceContext.js";
import { serializeTraceContext } from "../observability/traceContext.js";

const asyncLocalStorage = new AsyncLocalStorage<TraceContext>();

export function withTraceContext<T>(
  ctx: TraceContext,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return asyncLocalStorage.run(ctx, fn);
}

// Backward compatible with existing calls
export function withRequestContext<T>(
  requestId: string,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return withTraceContext({ traceId: requestId, requestId }, fn);
}

export function getCurrentTraceContext(): TraceContext | undefined {
  return asyncLocalStorage.getStore();
}

export function getCurrentRequestId(): string | undefined {
  return asyncLocalStorage.getStore()?.requestId;
}

export function getPropagationHeaders(ctx: TraceContext | undefined) {
  if (!ctx) return {};
  return serializeTraceContext(ctx);
}
