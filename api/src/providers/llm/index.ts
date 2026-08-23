import type { ModelAdapter } from "../../modules/agents/agents.types.js";
import { AppError } from "../../common/errors/AppError.js";
import { LLM_PROVIDER_UNAVAILABLE } from "../../common/errors/errorCodes.js";
import { FakeModelAdapter } from "./fakeAdapters.js";
import { FallbackModelAdapter } from "./fallbackAdapter.js";
import { FailoverModelAdapter } from "./failoverModelAdapter.js";
import { GroqChatAdapter } from "./groqChat.adapter.js";
import { ItiBedrockChatAdapter } from "./itiBedrockAdapter.js";
import { NvidiaNimChatAdapter } from "./nvidiaNimChat.adapter.js";
import { createStudentBedrockProvider } from "../bedrock/index.js";
import { logger } from "../../common/logger/logger.js";
import {
  getEffectiveAiRuntimeConfig,
  type EffectiveAiRuntimeConfig,
} from "../../modules/platform/ai-runtime-config.js";

let singleton: ModelAdapter | null = null;

const SUPPORTED_PROVIDERS = [
  "groq",
  "iti-bedrock",
  "nvidia-nim",
  "student-bedrock",
] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

function isSupportedProvider(value: string): value is SupportedProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
}

/**
 * A configured chatModel is only meaningful for the provider that selected it:
 * a model name normalized for one provider is rejected by another. Two paths
 * can now pair a config with a different provider — LLM_PRIMARY_PROVIDER wins
 * over a database-sourced config.provider, and a failover chain builds a second
 * provider from the same config — so both must fall back to the resolved
 * provider's own env default instead of borrowing this model name.
 *
 * Environment-sourced configs fall back for a second reason: their chatModel is
 * a module-load snapshot, so re-reading env here keeps a post-boot change (and a
 * per-test override) authoritative. The env defaults are identical either way.
 */
function resolveConfiguredChatModel(
  key: SupportedProvider,
  config: EffectiveAiRuntimeConfig,
): string | undefined {
  if (config.source !== "database" || config.provider !== key) return undefined;
  return config.chatModel.trim() || undefined;
}

function buildSupportedProvider(
  key: SupportedProvider,
  config = getEffectiveAiRuntimeConfig(),
): ModelAdapter {
  switch (key) {
    case "groq": {
      const apiKey = process.env.GROQ_API_KEY;
      if (!apiKey || apiKey.trim() === "") {
        throw new AppError(
          503,
          LLM_PROVIDER_UNAVAILABLE,
          'LLM provider "groq" requires GROQ_API_KEY.',
        );
      }
      return new GroqChatAdapter(
        apiKey,
        resolveConfiguredChatModel("groq", config) ||
          process.env.GROQ_CHAT_MODEL ||
          "llama-3.3-70b-versatile",
      );
    }
    case "iti-bedrock": {
      const apiKey = process.env.SBG_API_KEY;
      if (!apiKey || apiKey.trim() === "") {
        throw new AppError(
          503,
          LLM_PROVIDER_UNAVAILABLE,
          'LLM provider "iti-bedrock" requires SBG_API_KEY.',
        );
      }
      const baseUrl = process.env.ITI_BEDROCK_BASE_URL;
      if (!baseUrl || baseUrl.trim() === "") {
        throw new AppError(
          503,
          LLM_PROVIDER_UNAVAILABLE,
          'LLM provider "iti-bedrock" requires ITI_BEDROCK_BASE_URL.',
        );
      }
      const model = process.env.ITI_BEDROCK_MODEL?.trim();
      return new ItiBedrockChatAdapter({
        apiKey,
        baseUrl,
        model: resolveConfiguredChatModel("iti-bedrock", config) || model || undefined,
        timeoutMs: parseInt(process.env.BEDROCK_TIMEOUT_MS || "30000", 10),
        maxRetries: parseInt(process.env.BEDROCK_MAX_RETRIES || "2", 10),
        retryDelayMs: parseInt(process.env.BEDROCK_RETRY_DELAY_MS || "500", 10),
      });
    }
    case "nvidia-nim": {
      const apiKey = process.env.NVIDIA_API_KEY;
      if (!apiKey || apiKey.trim() === "") {
        throw new AppError(
          503,
          LLM_PROVIDER_UNAVAILABLE,
          'LLM provider "nvidia-nim" requires NVIDIA_API_KEY.',
        );
      }
      return new NvidiaNimChatAdapter({
        apiKey,
        baseUrl: process.env.NVIDIA_BASE_URL,
        model:
          resolveConfiguredChatModel("nvidia-nim", config) ||
          process.env.NVIDIA_CHAT_MODEL,
        timeoutMs: Number.parseInt(process.env.NVIDIA_TIMEOUT_MS || "120000", 10),
        reasoningEffort: process.env.NVIDIA_REASONING_EFFORT,
      });
    }
    case "student-bedrock": {
      return createStudentBedrockProvider();
    }
  }
}

/**
 * Returns the configured model adapter singleton. Builds the real provider
 * chain according to the routing strategy. Never enables FakeModelAdapter
 * outside automated tests.
 */
export function getModelAdapter(): ModelAdapter {
  if (singleton) return singleton;
  singleton = buildModelAdapterChain();
  return singleton;
}

export function setModelAdapter(adapter: ModelAdapter | null): void {
  singleton = adapter;
}

// Async version kept for callers that may await provider initialization.
export async function getModelAdapterAsync(): Promise<ModelAdapter> {
  if (singleton) return singleton;
  singleton = buildModelAdapterChain();
  return singleton;
}

/**
 * Builds the runtime provider chain.
 *
 * Routing strategy 1 — explicit env-driven routing (default when
 * LLM_PRIMARY_PROVIDER is set):
 *   LLM_PRIMARY_PROVIDER   (required)  first provider, e.g. groq | iti-bedrock | student-bedrock
 *   LLM_FALLBACK_PROVIDERS (optional)  ordered comma-separated failovers
 *   LLM_FALLBACK_PROVIDER  (optional)  legacy single failover, used only when
 *                                      LLM_FALLBACK_PROVIDERS is empty
 *   → FailoverModelAdapter (proactive availability probing, skips downed
 *     providers). A single configured provider is returned unwrapped.
 *
 * Routing strategy 2 — legacy env-driven chain (when LLM_PRIMARY_PROVIDER is
 * empty):
 *   GROQ_API_KEY → Groq (primary), SBG_API_KEY → Student Bedrock Gateway
 *   (secondary), wrapped in the existing FallbackModelAdapter.
 *
 * FakeModelAdapter is a test double that simulates completions. It must never
 * be part of the runtime chain: real users must never receive simulated
 * answers or simulated sources. Tests inject it explicitly (setModelAdapter,
 * ChatService/IntentQueryService constructors, setIntentQueryAdaptersForTests).
 * Under NODE_ENV=test a FakeModelAdapter is allowed as a terminal adapter so
 * un-injected test paths degrade deterministically.
 *
 * When no real provider is configured outside NODE_ENV=test, this throws a
 * controlled LLM_PROVIDER_UNAVAILABLE configuration error instead of silently
 * serving simulated responses.
 */
function buildModelAdapterChain(): ModelAdapter {
  const config = getEffectiveAiRuntimeConfig();
  const envProvider = process.env.LLM_PRIMARY_PROVIDER?.trim().toLowerCase();
  const primaryProvider =
    envProvider || (config.source === "database" ? config.provider : undefined);
  if (envProvider && config.source === "database" && config.provider !== envProvider) {
    logger.warn(
      {
        envProvider,
        configuredProvider: config.provider,
        configuredChatModel: config.chatModel,
      },
      "LLM_PRIMARY_PROVIDER overrides the database-configured AI provider; the configured chat model is ignored because it belongs to a different provider",
    );
  }
  if (primaryProvider) {
    return buildEnvDrivenChain(primaryProvider, config);
  }
  return buildLegacyChain();
}

function buildEnvDrivenChain(primaryProvider: string, config = getEffectiveAiRuntimeConfig()): ModelAdapter {
  if (!isSupportedProvider(primaryProvider)) {
    throw new AppError(
      503,
      LLM_PROVIDER_UNAVAILABLE,
      `Unknown LLM_PRIMARY_PROVIDER "${primaryProvider}". Supported values: ${SUPPORTED_PROVIDERS.join(", ")}.`,
    );
  }

  const orderedFallbackRaw = process.env.LLM_FALLBACK_PROVIDERS
    ?.trim()
    .toLowerCase();
  const legacyFallbackRaw = process.env.LLM_FALLBACK_PROVIDER
    ?.trim()
    .toLowerCase();
  const fallbackValues = orderedFallbackRaw
    ? orderedFallbackRaw.split(",").map((value) => value.trim()).filter(Boolean)
    : legacyFallbackRaw
      ? [legacyFallbackRaw]
      : [];
  const fallbackKeys = fallbackValues.length === 1 && fallbackValues[0] === "none"
    ? []
    : fallbackValues;

  if (fallbackKeys.includes("none")) {
    throw new AppError(
      503,
      LLM_PROVIDER_UNAVAILABLE,
      "LLM_FALLBACK_PROVIDERS may use none only as its sole value.",
    );
  }

  for (const fallbackKey of fallbackKeys) {
    if (!isSupportedProvider(fallbackKey)) {
      const variable = orderedFallbackRaw
        ? "LLM_FALLBACK_PROVIDERS"
        : "LLM_FALLBACK_PROVIDER";
      throw new AppError(
        503,
        LLM_PROVIDER_UNAVAILABLE,
        `Unknown ${variable} provider "${fallbackKey}". Supported values: ${SUPPORTED_PROVIDERS.join(", ")}, none.`,
      );
    }
  }

  const providerOrder = [primaryProvider, ...fallbackKeys];
  const seenProviders = new Set<string>();
  for (const provider of providerOrder) {
    if (seenProviders.has(provider)) {
      throw new AppError(
        503,
        LLM_PROVIDER_UNAVAILABLE,
        `LLM provider "${provider}" is duplicated; fallback providers must differ from the primary and from each other.`,
      );
    }
    seenProviders.add(provider);
  }

  const providers: ModelAdapter[] = [];
  let configError: unknown;

  for (const key of providerOrder) {
    try {
      providers.push(buildSupportedProvider(key as SupportedProvider, config));
    } catch (error) {
      configError = error;
      const missingUnderTest =
        process.env.NODE_ENV === "test" &&
        error instanceof AppError &&
        error.code === LLM_PROVIDER_UNAVAILABLE;
      if (!missingUnderTest) {
        throw error;
      }
    }
  }

  if (providers.length === 0 && process.env.NODE_ENV === "test") {
    providers.push(new FakeModelAdapter());
  }

  if (providers.length === 0) {
    if (configError instanceof AppError) {
      throw configError;
    }
    throw new AppError(
      503,
      LLM_PROVIDER_UNAVAILABLE,
      "No AI model provider is configured. Set LLM_PRIMARY_PROVIDER and the provider credentials before starting the server.",
    );
  }

  if (providers.length === 1) return providers[0];
  return new FailoverModelAdapter(providers);
}

function buildLegacyChain(): ModelAdapter {
  const adapters: ModelAdapter[] = [];

  if (process.env.GROQ_API_KEY) {
    adapters.push(
      new GroqChatAdapter(
        process.env.GROQ_API_KEY,
        process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile",
      ),
    );
  }

  if (process.env.SBG_API_KEY) {
    adapters.push(createStudentBedrockProvider());
  }

  if (adapters.length === 0 && process.env.NODE_ENV === "test") {
    adapters.push(new FakeModelAdapter());
  }

  if (adapters.length === 0) {
    throw new AppError(
      503,
      LLM_PROVIDER_UNAVAILABLE,
      "No AI model provider is configured. Set GROQ_API_KEY or SBG_API_KEY before starting the server.",
      { configuredProviders: ["groq", "student-bedrock"] },
    );
  }

  if (adapters.length === 1) return adapters[0];
  return new FallbackModelAdapter(adapters);
}

export type { ModelAdapter } from "../../modules/agents/agents.types.js";
