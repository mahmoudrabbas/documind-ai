import { AsyncLocalStorage } from "node:async_hooks";
const asyncLocalStorage = new AsyncLocalStorage();
export function withRequestContext(requestId, fn) {
    return asyncLocalStorage.run(requestId, fn);
}
export function getCurrentRequestId() {
    return asyncLocalStorage.getStore();
}
export function getPropagationHeaders(requestId) {
    return {
        "x-request-id": requestId,
        "x-correlation-id": requestId,
    };
}
//# sourceMappingURL=requestContext.js.map