import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../errors/AppError.js";
import { errorHandlerMiddleware } from "./errorHandler.middleware.js";

test("serializes rate-limit retry metadata without provider details or stack", () => {
  let status = 0;
  let payload: unknown;
  const headers = new Map<string, string>();
  const request = {
    requestId: "request-1",
    originalUrl: "/chat/send",
    method: "POST",
    log: { error: () => undefined },
  };
  const response = {
    setHeader: (name: string, value: string) => headers.set(name, value),
    status: (value: number) => {
      status = value;
      return response;
    },
    json: (value: unknown) => {
      payload = value;
      return response;
    },
  };

  errorHandlerMiddleware(
    new AppError(429, "LLM_RATE_LIMITED", "The AI provider is temporarily rate-limited. Please try again shortly.", { retryAfterSeconds: 37 }),
    request as never,
    response as never,
    (() => undefined) as never,
  );

  assert.equal(status, 429);
  assert.equal(headers.get("Retry-After"), "37");
  assert.deepEqual(payload, {
    success: false,
    retryAfterSeconds: 37,
    error: {
      code: "LLM_RATE_LIMITED",
      message: "The AI provider is temporarily rate-limited. Please try again shortly.",
      details: { retryAfterSeconds: 37 },
      path: "/chat/send",
      method: "POST",
      requestId: "request-1",
      timestamp: (payload as { error: { timestamp: string } }).error.timestamp,
    },
  });
  assert.ok(!JSON.stringify(payload).includes("stack"));
});

test("never exposes application stacks in client error responses", () => {
  let payload: unknown;
  const response = {
    setHeader: () => response,
    status: () => response,
    json: (value: unknown) => { payload = value; return response; },
  };
  errorHandlerMiddleware(
    new AppError(409, "BILLING_OPERATION_NOT_ALLOWED", "Refund eligibility requires a valid billing period"),
    { requestId: "request-2", originalUrl: "/billing/refund-eligibility-previews", method: "POST", log: { error: () => undefined } } as never,
    response as never,
    (() => undefined) as never,
  );
  assert.ok(!JSON.stringify(payload).includes("stack"));
  assert.ok(!JSON.stringify(payload).includes("errorHandler.middleware"));
});
