import { logger } from "../../common/logger/logger.js";
import type {
  ModelAdapter,
  ModelCompletionMessage,
  ModelCompletionResponse,
} from "../../modules/agents/agents.types.js";

type CircuitState = "closed" | "open" | "half-open";

interface CircuitBreakerState {
  consecutiveFailures: number;
  state: CircuitState;
  openedAt: number | null;
}

export interface FallbackAdapterConfig {
  maxRetries?: number;
  retryDelayMs?: number;
  backoffFactor?: number;
  circuitBreakerThreshold?: number;
  circuitBreakerResetMs?: number;
}

export interface ModelCompletionParams {
  messages: ModelCompletionMessage[];
  tools?: Record<string, unknown>[];
  toolChoice?: string | Record<string, unknown>;
  temperature?: number;
  topP?: number;
  maxTokens?: number;
  signal?: AbortSignal;
}

const DEFAULT_MAX_RETRIES = 2;
const DEFAULT_RETRY_DELAY_MS = 500;
const DEFAULT_BACKOFF_FACTOR = 2;
const DEFAULT_CIRCUIT_BREAKER_THRESHOLD = 5;
const DEFAULT_CIRCUIT_BREAKER_RESET_MS = 60_000;

/**
 * Wraps an ordered chain of ModelAdapter instances with per-provider retries,
 * exponential backoff, and a circuit breaker.
 *
 * The chain is tried in priority order: adapter[0] is retried up to
 * maxRetries times, then adapter[1], and so on. A provider whose circuit is
 * OPEN is skipped entirely until the reset window elapses, at which point a
 * single test request is allowed (half-open). If every provider fails, the
 * last error is rethrown.
 */
export class FallbackModelAdapter implements ModelAdapter {
  readonly providerKey: string;

  private readonly adapters: ModelAdapter[];
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;
  private readonly backoffFactor: number;
  private readonly circuitBreakerThreshold: number;
  private readonly circuitBreakerResetMs: number;
  private readonly circuitStates = new Map<string, CircuitBreakerState>();

  constructor(adapters: ModelAdapter[], config: FallbackAdapterConfig = {}) {
    if (adapters.length === 0) {
      throw new Error("FallbackModelAdapter requires at least one ModelAdapter");
    }
    this.adapters = adapters;
    this.maxRetries = config.maxRetries ?? DEFAULT_MAX_RETRIES;
    this.retryDelayMs = config.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
    this.backoffFactor = config.backoffFactor ?? DEFAULT_BACKOFF_FACTOR;
    this.circuitBreakerThreshold = config.circuitBreakerThreshold ?? DEFAULT_CIRCUIT_BREAKER_THRESHOLD;
    this.circuitBreakerResetMs = config.circuitBreakerResetMs ?? DEFAULT_CIRCUIT_BREAKER_RESET_MS;
    this.providerKey = `fallback(${adapters.map((adapter) => adapter.providerKey).join(",")})`;
  }

  async complete(params: ModelCompletionParams): Promise<ModelCompletionResponse> {
    let lastError: unknown = new Error("No LLM provider adapters available");

    for (const adapter of this.adapters) {
      try {
        const response = await this.tryAdapter(adapter, params);
        logger.info({
          provider: adapter.providerKey,
          chain: this.providerKey,
        }, "LLM request succeeded");
        return response;
      } catch (error) {
        lastError = error;
        logger.info({
          failedProvider: adapter.providerKey,
          chain: this.providerKey,
          error: error instanceof Error ? error.message : String(error),
        }, "LLM provider failed; falling back to next provider");
      }
    }

    throw lastError;
  }

  private async tryAdapter(
    adapter: ModelAdapter,
    params: ModelCompletionParams,
  ): Promise<ModelCompletionResponse> {
    if (this.isCircuitOpen(adapter.providerKey)) {
      logger.info({
        provider: adapter.providerKey,
        chain: this.providerKey,
      }, "LLM provider skipped; circuit breaker is OPEN");
      throw new Error(`LLM provider "${adapter.providerKey}" is open for circuit breaker`);
    }

    let lastError: unknown;
    for (let attempt = 0; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await adapter.complete(params);
        this.recordSuccess(adapter.providerKey);
        return response;
      } catch (error) {
        lastError = error;
        this.recordFailure(adapter.providerKey);
        logger.warn({
          provider: adapter.providerKey,
          attempt: attempt + 1,
          maxRetries: this.maxRetries + 1,
          error: error instanceof Error ? error.message : String(error),
        }, "LLM provider attempt failed");
        if (attempt < this.maxRetries) {
          const backoffMs = this.retryDelayMs * Math.pow(this.backoffFactor, attempt);
          logger.info({
            provider: adapter.providerKey,
            attempt: attempt + 1,
            backoffMs,
          }, "Retrying LLM provider after backoff");
          await this.sleep(backoffMs);
        }
      }
    }

    throw lastError;
  }

  private getCircuitState(providerKey: string): CircuitBreakerState {
    let state = this.circuitStates.get(providerKey);
    if (!state) {
      state = { consecutiveFailures: 0, state: "closed", openedAt: null };
      this.circuitStates.set(providerKey, state);
    }
    return state;
  }

  private isCircuitOpen(providerKey: string): boolean {
    const state = this.getCircuitState(providerKey);
    if (state.state === "open" && state.openedAt !== null) {
      if (Date.now() - state.openedAt >= this.circuitBreakerResetMs) {
        // Reset window elapsed: allow one test request through (half-open).
        state.state = "half-open";
      }
    }
    return state.state === "open";
  }

  private recordSuccess(providerKey: string): void {
    const state = this.getCircuitState(providerKey);
    state.consecutiveFailures = 0;
    state.state = "closed";
    state.openedAt = null;
  }

  private recordFailure(providerKey: string): void {
    const state = this.getCircuitState(providerKey);
    state.consecutiveFailures += 1;
    const thresholdMet =
      state.consecutiveFailures >= this.circuitBreakerThreshold || state.state === "half-open";
    if (thresholdMet) {
      state.state = "open";
      state.openedAt = Date.now();
      logger.warn({
        provider: providerKey,
        consecutiveFailures: state.consecutiveFailures,
        threshold: this.circuitBreakerThreshold,
      }, "LLM circuit breaker OPEN for provider");
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
