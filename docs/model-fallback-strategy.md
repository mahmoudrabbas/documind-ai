# Model Fallback Strategy

When a primary LLM provider fails (rate limit, outage, timeout) the request no
longer crashes with an `AppError`. A `FallbackModelAdapter` wraps the configured
providers in an ordered chain with per-provider retries, exponential backoff,
and a circuit breaker, so traffic automatically shifts to a healthy provider.

- Implementation: `api/src/providers/llm/fallbackAdapter.ts`
- Chain wiring: `api/src/providers/llm/index.ts`
- Health probe: `GET /health/llm`

## Provider chain order

The chain is built by `buildModelAdapterChain()` in
`api/src/providers/llm/index.ts`, in priority order:

| Priority | Provider | Enabled when | Why it was chosen |
| --- | --- | --- | --- |
| 1 | Groq (`GroqChatAdapter`) | `GROQ_API_KEY` set | Fastest and cheapest inference for chat/intent workloads; the primary provider. |
| 2 | Bedrock (`StudentBedrockProvider`) | `SBG_API_KEY` set | Anthropic/DeepSeek/OpenAI-class models through the Student Bedrock Gateway; high quality fallback when Groq is degraded. |
| 3 | Fake (`FakeModelAdapter`) | always | Graceful degradation: a deterministic local responder so the system never crashes when every real provider is down. |

When only one adapter is configured the chain returns it unwrapped. The chain
`providerKey` reports its composition, e.g. `fallback(groq,bedrock,fake)`.

## Retry policy

Each adapter is tried up to `maxRetries` retries after the initial attempt
(default `2`, so up to 3 attempts per provider).

Backoff is exponential between attempts:

```
delayMs = retryDelayMs * backoffFactor ^ attempt
```

With the default config this yields 500ms, 1s, then 2s of delay.

| Config | Default |
| --- | --- |
| `maxRetries` | `2` |
| `retryDelayMs` | `500` |
| `backoffFactor` | `2` |

After an adapter exhausts its retries the chain moves to the next provider.
Only if every provider fails is the last error rethrown.

## Circuit breaker

Consecutive failures per provider are tracked in a `Map<providerKey, state>`.

- After `circuitBreakerThreshold` (default `5`) consecutive failures the
  provider's circuit is marked **OPEN**.
- An OPEN provider is **skipped** entirely — it is not attempted again.
- After `circuitBreakerResetMs` (default 60,000ms = 1 minute) a single test
  request is allowed through (**half-open**).
- A successful request resets the failure count and **closes** the circuit.
- A failure while half-open re-opens the circuit immediately.

| Config | Default |
| --- | --- |
| `circuitBreakerThreshold` | `5` |
| `circuitBreakerResetMs` | `60000` |

The breaker prevents hammering a dead provider and absorbs recovery windows
without manual intervention.

## Graceful degradation

The terminal adapter in the chain is always `FakeModelAdapter`, a deterministic
in-process responder. This means:

- When all real providers are unavailable the system still returns a response
  instead of crashing.
- During development or when no API keys are configured the chain collapses to
  the fake adapter, keeping the app fully runnable.

All fallback events are logged with the structured `logger` (which provider
failed, which succeeded, retry attempt, backoff delay, and circuit state
transitions) for monitoring.

## Health endpoint

`GET /health/llm` probes the chain with a `maxTokens: 1` ping.

- `200` → `{ "status": "ok", "provider": "<providerKey>" }`
- `503` → `{ "status": "degraded", "provider": "<providerKey>" }`

The endpoint is exempt from the maintenance-mode guard alongside `/healthz`
and `/readyz`.
