import { logger } from "../../common/logger/logger.js";
import { AppError } from "../../common/errors/AppError.js";
import {
  LLM_PROVIDER_UNAVAILABLE,
  LLM_TIMEOUT,
  LLM_RATE_LIMITED,
} from "../../common/errors/errorCodes.js";
import { mapLlmProviderError } from "./providerError.js";
import type {
  ModelAdapter,
  ModelCompletionMessage,
  ModelCompletionResponse,
} from "../../modules/agents/agents.types.js";

export interface AvailabilityProbeResult {
  available: boolean;
  reason?: string;
}

/**
 * A ModelAdapter that exposes a lightweight liveness probe. Providers
 * implementing this interface opt in to proactive failover: the
 * FailoverModelAdapter probes availability before attempting a completion and
 * SKIPS providers that report themselves down.
 */
export interface AvailabilityProbeModelAdapter extends ModelAdapter {
  checkAvailability(signal?: AbortSignal): Promise<AvailabilityProbeResult>;
}

export interface FailoverAdapterConfig {
  probeEnabled?: boolean;
  probeTtlMs?: number;
  probeTimeoutMs?: number;
}

export interface ModelCompletionParams {
  messages: ModelCompletionMessage[];
  tools?: Record<string, unknown>[];
  toolChoice?: string | Record<string, unknown>;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  signal?: AbortSignal;
  structuredOutput?: { type: "json_object" };
}

const DEFAULT_PROBE_ENABLED = true;
const DEFAULT_PROBE_TTL_MS = 30_000;
const DEFAULT_PROBE_TIMEOUT_MS = 5_000;

// Completion errors that mean the provider itself is unhealthy (down/timeout).
// Rate limits are NOT down: the provider is alive, just asking the caller to
// wait, so it must not be marked unavailable and skipped for the TTL window.
const DOWNED_CODES = new Set([LLM_PROVIDER_UNAVAILABLE, LLM_TIMEOUT]);

// Codes that may trigger a failover attempt. Everything else (unexpected
// non-LLM AppErrors, client 4xx) is a request-level problem, not a provider
// outage, and must be rethrown without burning the fallback provider.
const FAILOVER_CODES = new Set([
  LLM_PROVIDER_UNAVAILABLE,
  LLM_TIMEOUT,
  LLM_RATE_LIMITED,
]);

/**
 * True for client-side request errors (HTTP 4xx, excluding the timeout 408 and
 * the rate-limit 429). A rejected request is not a provider outage: failing
 * over would only mask the misconfiguration that produced the 4xx.
 */
function isClientRequestError(error: AppError): boolean {
  return (
    error.statusCode >= 400 &&
    error.statusCode < 500 &&
    error.statusCode !== 408 &&
    error.statusCode !== 429
  );
}

export function isAvailabilityProbeAdapter(
  adapter: ModelAdapter,
): adapter is AvailabilityProbeModelAdapter {
  return (
    typeof (adapter as AvailabilityProbeModelAdapter).checkAvailability ===
    "function"
  );
}

interface CachedAvailability {
  available: boolean;
  reason?: string;
  checkedAt: number;
}

/**
 * Provider-agnostic failover wrapper. Providers are tried in priority order
 * (primary → fallback). Providers that implement AvailabilityProbeModelAdapter
 * are actively probed before each attempt (cached for a TTL window): a downed
 * provider is SKIPPED entirely — no request is even attempted against it —
 * and the next provider in the chain is used instead.
 *
 * A completion failure classified as provider-unavailable or timeout marks the
 * provider down for the TTL window so subsequent requests skip it too. If every
 * provider fails, the last (mapped, controlled) error is rethrown.
 */
export class FailoverModelAdapter implements ModelAdapter {
  readonly providerKey: string;

  private readonly adapters: ModelAdapter[];
  private readonly probeEnabled: boolean;
  private readonly probeTtlMs: number;
  private readonly probeTimeoutMs: number;
  private readonly availabilityCache = new Map<string, CachedAvailability>();

  constructor(adapters: ModelAdapter[], config: FailoverAdapterConfig = {}) {
    if (adapters.length === 0) {
      throw new Error("FailoverModelAdapter requires at least one ModelAdapter");
    }
    this.adapters = adapters;
    this.probeEnabled = config.probeEnabled ?? DEFAULT_PROBE_ENABLED;
    this.probeTtlMs = config.probeTtlMs ?? DEFAULT_PROBE_TTL_MS;
    this.probeTimeoutMs = config.probeTimeoutMs ?? DEFAULT_PROBE_TIMEOUT_MS;
    this.providerKey = `failover(${adapters.map((adapter) => adapter.providerKey).join(",")})`;
  }

  async complete(params: ModelCompletionParams): Promise<ModelCompletionResponse> {
    let lastError: unknown = new AppError(
      503,
      LLM_PROVIDER_UNAVAILABLE,
      "No LLM provider adapters available",
    );

    for (const adapter of this.adapters) {
      if (await this.isDowned(adapter, params.signal)) {
        logger.info({
          provider: adapter.providerKey,
          chain: this.providerKey,
        }, "LLM provider skipped; availability probe reports provider down");
        lastError = new AppError(
          503,
          LLM_PROVIDER_UNAVAILABLE,
          `LLM provider "${adapter.providerKey}" is unavailable`,
        );
        continue;
      }

      try {
        const response = await adapter.complete(params);
        this.recordAvailable(adapter.providerKey);
        logger.info({
          provider: adapter.providerKey,
          chain: this.providerKey,
        }, "LLM request succeeded");
        return response;
      } catch (error) {
        // Honor caller cancellation: never fail over after the user aborted.
        if (params.signal?.aborted) {
          throw error;
        }
        const mapped = mapLlmProviderError(error);
        lastError = mapped;

        // Client-side request errors (4xx) and unexpected non-LLM errors are
        // NOT provider outages: a rejected request or a contract-level failure
        // must fail closed on this provider rather than burn the fallback.
        if (!FAILOVER_CODES.has(mapped.code) || isClientRequestError(mapped)) {
          logger.warn({
            failedProvider: adapter.providerKey,
            chain: this.providerKey,
            errorCode: mapped.code,
            statusCode: mapped.statusCode,
            failedOver: false,
          }, "LLM provider request error; not failing over");
          throw mapped;
        }

        const marksDown = DOWNED_CODES.has(mapped.code);
        if (marksDown) {
          this.availabilityCache.set(adapter.providerKey, {
            available: false,
            reason: mapped.message,
            checkedAt: Date.now(),
          });
        }
        logger.warn({
          failedProvider: adapter.providerKey,
          chain: this.providerKey,
          errorCode: mapped.code,
          statusCode: mapped.statusCode,
          markedDown: marksDown,
          failedOver: true,
        }, "LLM provider failed; falling back to next provider");
      }
    }

    throw lastError;
  }

  /**
   * Returns true when the provider is known to be down (fresh cache entry) or
   * a live probe reports it unavailable. Plain ModelAdapters without a probe
   * are never skipped here — they are always attempted.
   */
  private async isDowned(
    adapter: ModelAdapter,
    signal?: AbortSignal,
  ): Promise<boolean> {
    if (!this.probeEnabled || !isAvailabilityProbeAdapter(adapter)) {
      return false;
    }

    const cached = this.availabilityCache.get(adapter.providerKey);
    const now = Date.now();
    if (cached && now - cached.checkedAt < this.probeTtlMs) {
      return !cached.available;
    }

    let result: AvailabilityProbeResult;
    try {
      result = await adapter.checkAvailability(this.buildProbeSignal(signal));
    } catch (error) {
      // The probe itself failed (network error, timeout): treat the provider as
      // unavailable and fail safe — a completion would hit the same problem.
      result = {
        available: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }

    this.availabilityCache.set(adapter.providerKey, {
      available: result.available,
      reason: result.reason,
      checkedAt: now,
    });
    return !result.available;
  }

  private buildProbeSignal(signal?: AbortSignal): AbortSignal {
    const timeoutSignal = AbortSignal.timeout(this.probeTimeoutMs);
    return signal ? AbortSignal.any([timeoutSignal, signal]) : timeoutSignal;
  }

  private recordAvailable(providerKey: string): void {
    this.availabilityCache.set(providerKey, {
      available: true,
      checkedAt: Date.now(),
    });
  }
}
