import { AsyncLocalStorage } from "node:async_hooks";
import { serializeTraceContext } from "../observability/traceContext.js";
const asyncLocalStorage = new AsyncLocalStorage();
export function withTraceContext(ctx, fn) {
    return asyncLocalStorage.run(ctx, fn);
}
// Backward compatible with existing calls
export function withRequestContext(requestId, fn) {
    return withTraceContext({ traceId: requestId, requestId }, fn);
}
export function getCurrentTraceContext() {
    return asyncLocalStorage.getStore();
}
export function getCurrentRequestId() {
    return asyncLocalStorage.getStore()?.requestId;
}
export function getPropagationHeaders(ctx) {
    if (!ctx)
        return {};
    return serializeTraceContext(ctx);
}
//# sourceMappingURL=requestContext.js.map