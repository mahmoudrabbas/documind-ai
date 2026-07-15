import type { TraceContext } from "../observability/traceContext.js";
export declare function withTraceContext<T>(ctx: TraceContext, fn: () => Promise<T> | T): Promise<T> | T;
export declare function withRequestContext<T>(requestId: string, fn: () => Promise<T> | T): Promise<T> | T;
export declare function getCurrentTraceContext(): TraceContext | undefined;
export declare function getCurrentRequestId(): string | undefined;
export declare function getPropagationHeaders(ctx: TraceContext | undefined): Record<string, string>;
//# sourceMappingURL=requestContext.d.ts.map