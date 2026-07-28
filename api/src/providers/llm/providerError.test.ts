import assert from "node:assert/strict";
import test from "node:test";
import { mapLlmProviderError } from "./providerError.js";

test("maps provider 429 and propagates a safe Retry-After value", () => {
  const mapped = mapLlmProviderError({
    status: 429,
    code: "rate_limit_exceeded",
    headers: new Headers({ "retry-after": "37" }),
    error: { message: "quota org_secret api-key-secret", organization: "org_secret" },
  });
  assert.equal(mapped.statusCode, 429);
  assert.equal(mapped.code, "LLM_RATE_LIMITED");
  assert.deepEqual(mapped.details, { retryAfterSeconds: 37 });
  assert.ok(!JSON.stringify(mapped).includes("org_secret"));
  assert.ok(!JSON.stringify(mapped).includes("api-key-secret"));
});

test("maps nested provider rate-limit codes without exposing payloads", () => {
  const mapped = mapLlmProviderError({
    status: 400,
    error: { code: "rate_limit_exceeded", message: "sensitive quota identifier" },
  });
  assert.equal(mapped.statusCode, 429);
  assert.equal(mapped.code, "LLM_RATE_LIMITED");
  assert.equal(mapped.details, null);
  assert.ok(!mapped.message.includes("sensitive"));
});

test("maps provider 5xx and connection failures to unavailable", () => {
  for (const error of [{ status: 500 }, { status: 503 }, { name: "APIConnectionError" }]) {
    const mapped = mapLlmProviderError(error);
    assert.equal(mapped.statusCode, 503);
    assert.equal(mapped.code, "LLM_PROVIDER_UNAVAILABLE");
  }
});

test("maps timeout variants separately", () => {
  for (const error of [{ status: 408 }, { code: "ETIMEDOUT" }, { name: "APIConnectionTimeoutError" }]) {
    const mapped = mapLlmProviderError(error);
    assert.equal(mapped.statusCode, 503);
    assert.equal(mapped.code, "LLM_TIMEOUT");
  }
});
