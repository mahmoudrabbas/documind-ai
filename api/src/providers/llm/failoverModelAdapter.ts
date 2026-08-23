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
const DEFAULT_PROBE_TTL_MS = 120_000;
const DEFAULT_PROBE_TIMEOUT_MS = 2_500;

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
 * provider down for the TTL window so subsequent requests skip it too.
 *
 * Before giving up, providers that were skipped only because of a cached verdict
 * are re-probed live and retried: the cache is there to order healthy providers,
 * not to be the reason a request has no provider at all. If every provider still
 * fails, the last (mapped, controlled) error is rethrown.
 */
export class FailoverModelAdapter implements ModelAdapter {
  readonly providerKey: string;
  readonly runtimeIdentity;

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
    this.runtimeIdentity = Object.freeze({
      provider: "failover",
      componentVersion: "failover-model-adapter-v1",
      chain: Object.freeze(adapters.flatMap((adapter) => {
        const identities = adapter.runtimeIdentity?.chain ?? [adapter.runtimeIdentity ?? { provider: adapter.providerKey }];
        return identities.map((identity) => Object.freeze({
          provider: identity.provider ?? adapter.providerKey,
          ...(identity.model ? { model: identity.model } : {}),
          ...(identity.modelRevision !== undefined ? { modelRevision: identity.modelRevision } : {}),
          ...(identity.modelRevisionStatus ? { modelRevisionStatus: identity.modelRevisionStatus } : {}),
          ...(identity.componentVersion ? { componentVersion: identity.componentVersion } : {}),
        }));
      })),
    });
  }

  async complete(params: ModelCompletionParams): Promise<ModelCompletionResponse> {
    let lastError: unknown = new AppError(
      503,
      LLM_PROVIDER_UNAVAILABLE,
      "No LLM provider adapters available",
    );

    // Providers skipped purely on the strength of a cached down verdict, in
    // chain order. They are the last-resort pool below.
    const cacheSkipped: ModelAdapter[] = [];

    for (const adapter of this.adapters) {
      const verdict = await this.downCheck(adapter, params.signal);
      if (verdict.downed) {
        if (verdict.fromCache) {
          cacheSkipped.push(adapter);
        }
        logger.info({
          provider: adapter.providerKey,
          chain: this.providerKey,
          fromCache: verdict.fromCache,
        }, "LLM provider skipped; availability probe reports provider down");
        lastError = new AppError(
          503,
          LLM_PROVIDER_UNAVAILABLE,
          `LLM provider "${adapter.providerKey}" is unavailable`,
        );
        continue;
      }

      const attempt = await this.attemptProvider(adapter, params, false);
      if (attempt.ok) return attempt.response;
      lastError = attempt.error;
    }

    // Every provider is now either skipped or failed, so the caller is about to
    // get a 503. A cached down verdict is an optimisation for choosing between
    // live providers and must never be the sole reason the chain has no answer
    // at all: the verdict can be a full TTL old, and a completion timeout
    // records one for a provider that is merely slow rather than dead. Re-probe
    // the cache-skipped providers for real and attempt any that answer.
    for (const adapter of cacheSkipped) {
      const verdict = await this.downCheck(adapter, params.signal, { ignoreCache: true });
      if (verdict.downed) continue;

      logger.info({
        provider: adapter.providerKey,
        chain: this.providerKey,
      }, "LLM chain exhausted; retrying a cache-skipped provider that now probes healthy");
      const attempt = await this.attemptProvider(adapter, params, true);
      if (attempt.ok) return attempt.response;
      lastError = attempt.error;
    }

    throw lastError;
  }

  /**
   * Runs one completion attempt against one provider, recording availability and
   * classifying the failure. Returns the mapped error for failover-eligible
   * failures; rethrows anything the chain must not fail over (caller
   * cancellation, client 4xx, non-LLM errors).
   */
  private async attemptProvider(
    adapter: ModelAdapter,
    params: ModelCompletionParams,
    lastResort: boolean,
  ): Promise<
    | { ok: true; response: ModelCompletionResponse }
    | { ok: false; error: AppError }
  > {
    try {
      const response = await adapter.complete(params);
      this.recordAvailable(adapter.providerKey);
      logger.info({
        provider: adapter.providerKey,
        chain: this.providerKey,
        ...(lastResort ? { lastResort: true } : {}),
      }, "LLM request succeeded");
      return { ok: true, response };
    } catch (error) {
      // Honor caller cancellation: never fail over after the user aborted.
      if (params.signal?.aborted) {
        throw error;
      }
      const mapped = mapLlmProviderError(error);

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
        ...(lastResort ? { lastResort: true } : {}),
      }, "LLM provider failed; falling back to next provider");
      return { ok: false, error: mapped };
    }
  }

  /**
   * Reports whether the provider is down, and whether that verdict came from the
   * cache or from a probe run just now. Plain ModelAdapters without a probe are
   * never skipped here — they are always attempted.
   *
   * `ignoreCache` forces a live probe, for the last-resort pass that must not
   * let a stale verdict stand between the caller and a working provider.
   */
  private async downCheck(
    adapter: ModelAdapter,
    signal?: AbortSignal,
    options: { ignoreCache?: boolean } = {},
  ): Promise<{ downed: boolean; fromCache: boolean }> {
    if (!this.probeEnabled || !isAvailabilityProbeAdapter(adapter)) {
      return { downed: false, fromCache: false };
    }

    const now = Date.now();
    if (!options.ignoreCache) {
      const cached = this.availabilityCache.get(adapter.providerKey);
      if (cached && now - cached.checkedAt < this.probeTtlMs) {
        return { downed: !cached.available, fromCache: true };
      }
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
    return { downed: !result.available, fromCache: false };
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
