import { AppError } from "../../common/errors/AppError.js";
import {
  LLM_PROVIDER_UNAVAILABLE,
  LLM_RATE_LIMITED,
  LLM_TIMEOUT,
} from "../../common/errors/errorCodes.js";

const MAX_RETRY_AFTER_SECONDS = 86_400;

type ProviderErrorShape = {
  status?: unknown;
  statusCode?: unknown;
  code?: unknown;
  name?: unknown;
  headers?: unknown;
  error?: unknown;
};

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null
    ? value as Record<string, unknown>
    : null;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

function numericStatus(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) ? value : null;
}

function headerValue(headers: unknown, name: string): string | null {
  if (headers instanceof Headers) return headers.get(name);
  const values = record(headers);
  if (!values) return null;
  const value = values[name] ?? values[name.toLowerCase()] ?? values[name.toUpperCase()];
  return typeof value === "string" ? value : null;
}

function parseRetryAfterSeconds(value: string | null): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds > 0) {
    return Math.min(MAX_RETRY_AFTER_SECONDS, Math.ceil(seconds));
  }
  const retryAt = Date.parse(value);
  if (!Number.isFinite(retryAt)) return undefined;
  const remaining = Math.ceil((retryAt - Date.now()) / 1000);
  return remaining > 0 ? Math.min(MAX_RETRY_AFTER_SECONDS, remaining) : undefined;
}

export function mapLlmProviderError(error: unknown): AppError {
  // AppErrors are already the controlled, sanitized error type. Pass every
  // AppError through unchanged so the provider boundary preserves precise
  // codes/status codes (e.g. validation 4xx) instead of collapsing them.
  if (error instanceof AppError) {
    return error;
  }

  const outer = (record(error) ?? {}) as ProviderErrorShape;
  const nested = record(outer.error);
  // Providers disagree on the field name: the OpenAI SDK uses `status`, the
  // SBG gateway errors use `statusCode`. Accept either.
  const status = numericStatus(outer.status) ?? numericStatus(outer.statusCode);
  const code = stringField(outer.code) ?? stringField(nested?.code);
  const name = stringField(outer.name);

  if (
    status === 429 ||
    code === "rate_limit_exceeded" ||
    code === "too_many_requests" ||
    code === "RATE_LIMIT_ERROR" ||
    code === "QUOTA_EXCEEDED"
  ) {
    const retryAfterSeconds = parseRetryAfterSeconds(headerValue(outer.headers, "retry-after"));
    return new AppError(
      429,
      LLM_RATE_LIMITED,
      "The AI provider is temporarily rate-limited. Please try again shortly.",
      retryAfterSeconds === undefined ? null : { retryAfterSeconds },
    );
  }

  if (
    status === 408 ||
    code === "ETIMEDOUT" ||
    code === "UND_ERR_CONNECT_TIMEOUT" ||
    code === "TIMEOUT_ERROR" ||
    name === "AbortError" ||
    name === "APIConnectionTimeoutError"
  ) {
    return new AppError(503, LLM_TIMEOUT, "The AI provider timed out. Please try again.");
  }

  // Client-side request errors (4xx, excluding the timeout 408 and the
  // rate-limit 429 handled above) mean the request itself was rejected — bad
  // request, invalid/missing credentials, unsupported route. That is NOT a
  // provider outage: preserve the real status so failover layers do not burn
  // the fallback provider on a rejected request, and so callers see the real
  // status instead of a misleading 503.
  if (status !== null && status >= 400 && status < 500) {
    return new AppError(
      status,
      LLM_PROVIDER_UNAVAILABLE,
      "The AI provider rejected the request. Please check the request and try again.",
    );
  }

  return new AppError(
    503,
    LLM_PROVIDER_UNAVAILABLE,
    "The AI provider is temporarily unavailable. Please try again shortly.",
  );
}
