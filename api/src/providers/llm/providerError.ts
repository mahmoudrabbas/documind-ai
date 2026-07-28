import { AppError } from "../../common/errors/AppError.js";
import {
  LLM_PROVIDER_UNAVAILABLE,
  LLM_RATE_LIMITED,
  LLM_TIMEOUT,
} from "../../common/errors/errorCodes.js";

const MAX_RETRY_AFTER_SECONDS = 86_400;

type ProviderErrorShape = {
  status?: unknown;
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
  if (error instanceof AppError && [LLM_RATE_LIMITED, LLM_PROVIDER_UNAVAILABLE, LLM_TIMEOUT].includes(error.code)) {
    return error;
  }

  const outer = (record(error) ?? {}) as ProviderErrorShape;
  const nested = record(outer.error);
  const status = numericStatus(outer.status);
  const code = stringField(outer.code) ?? stringField(nested?.code);
  const name = stringField(outer.name);

  if (status === 429 || code === "rate_limit_exceeded" || code === "too_many_requests") {
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
    name === "AbortError" ||
    name === "APIConnectionTimeoutError"
  ) {
    return new AppError(503, LLM_TIMEOUT, "The AI provider timed out. Please try again.");
  }

  return new AppError(
    503,
    LLM_PROVIDER_UNAVAILABLE,
    "The AI provider is temporarily unavailable. Please try again shortly.",
  );
}
