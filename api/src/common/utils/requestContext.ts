import { AsyncLocalStorage } from "node:async_hooks";

const asyncLocalStorage = new AsyncLocalStorage<string>();

export function withRequestContext<T>(
  requestId: string,
  fn: () => Promise<T> | T,
): Promise<T> | T {
  return asyncLocalStorage.run(requestId, fn);
}

export function getCurrentRequestId(): string | undefined {
  return asyncLocalStorage.getStore();
}

export function getPropagationHeaders(requestId: string | undefined) {
  return {
    "x-request-id": requestId,
    "x-correlation-id": requestId,
  };
}
