export declare function withRequestContext<T>(requestId: string, fn: () => Promise<T> | T): Promise<T> | T;
export declare function getCurrentRequestId(): string | undefined;
export declare function getPropagationHeaders(requestId: string | undefined): {
    "x-request-id": string | undefined;
    "x-correlation-id": string | undefined;
};
//# sourceMappingURL=requestContext.d.ts.map