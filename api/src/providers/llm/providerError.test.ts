import assert from "node:assert/strict";
import test from "node:test";
import { mapLlmProviderError } from "./providerError.js";
import { AppError } from "../../common/errors/AppError.js";

test("passes every AppError through unchanged", () => {
  const original = new AppError(
    400,
    "SOME_OTHER_CODE",
    "A precise non-LLM error that must not be collapsed.",
    { context: "preserved" },
  );
  const mapped = mapLlmProviderError(original);
  assert.equal(mapped, original);
  assert.equal(mapped.statusCode, 400);
  assert.equal(mapped.code, "SOME_OTHER_CODE");
  assert.deepEqual(mapped.details, { context: "preserved" });
});

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

test("maps SBG gateway rate-limit and quota errors to the controlled 429", () => {
  for (const code of ["RATE_LIMIT_ERROR", "QUOTA_EXCEEDED"]) {
    const mapped = mapLlmProviderError({ statusCode: 429, code });
    assert.equal(mapped.statusCode, 429, code);
    assert.equal(mapped.code, "LLM_RATE_LIMITED", code);
  }
});

test("reads the statusCode field (SBG errors) in addition to status", () => {
  const mapped = mapLlmProviderError({ statusCode: 503 });
  assert.equal(mapped.statusCode, 503);
  assert.equal(mapped.code, "LLM_PROVIDER_UNAVAILABLE");
});

test("maps SBG timeout code to the controlled timeout", () => {
  const mapped = mapLlmProviderError({ code: "TIMEOUT_ERROR" });
  assert.equal(mapped.statusCode, 503);
  assert.equal(mapped.code, "LLM_TIMEOUT");
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
