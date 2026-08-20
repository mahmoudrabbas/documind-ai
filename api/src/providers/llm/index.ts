import type { ModelAdapter } from "../../modules/agents/agents.types.js";
import { AppError } from "../../common/errors/AppError.js";
import { LLM_PROVIDER_UNAVAILABLE } from "../../common/errors/errorCodes.js";
import { FakeModelAdapter } from "./fakeAdapters.js";
import { FallbackModelAdapter } from "./fallbackAdapter.js";
import { FailoverModelAdapter } from "./failoverModelAdapter.js";
import { GroqChatAdapter } from "./groqChat.adapter.js";
import { ItiBedrockChatAdapter } from "./itiBedrockAdapter.js";
import { createStudentBedrockProvider } from "../bedrock/index.js";
import { getEffectiveAiRuntimeConfig } from "../../modules/platform/ai-runtime-config.js";

let singleton: ModelAdapter | null = null;

const SUPPORTED_PROVIDERS = ["groq", "iti-bedrock", "student-bedrock"] as const;
type SupportedProvider = (typeof SUPPORTED_PROVIDERS)[number];

function isSupportedProvider(value: string): value is SupportedProvider {
  return (SUPPORTED_PROVIDERS as readonly string[]).includes(value);
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
        config.chatModel || process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile",
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
        model: config.chatModel || model || undefined,
        timeoutMs: parseInt(process.env.BEDROCK_TIMEOUT_MS || "30000", 10),
        maxRetries: parseInt(process.env.BEDROCK_MAX_RETRIES || "2", 10),
        retryDelayMs: parseInt(process.env.BEDROCK_RETRY_DELAY_MS || "500", 10),
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
 *   LLM_FALLBACK_PROVIDER  (optional)  failover provider; must differ from primary
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
  const primaryProvider = config.provider || process.env.LLM_PRIMARY_PROVIDER?.trim().toLowerCase();
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

  const fallbackRaw = process.env.LLM_FALLBACK_PROVIDER?.trim().toLowerCase();
  const fallbackKey =
    fallbackRaw && fallbackRaw !== "none" ? fallbackRaw : undefined;
  if (fallbackKey && !isSupportedProvider(fallbackKey)) {
    throw new AppError(
      503,
      LLM_PROVIDER_UNAVAILABLE,
      `Unknown LLM_FALLBACK_PROVIDER "${fallbackKey}". Supported values: ${SUPPORTED_PROVIDERS.join(", ")}, none.`,
    );
  }
  if (fallbackKey === primaryProvider) {
    throw new AppError(
      503,
      LLM_PROVIDER_UNAVAILABLE,
      "LLM_FALLBACK_PROVIDER must differ from LLM_PRIMARY_PROVIDER.",
    );
  }

  const providers: ModelAdapter[] = [];
  let configError: unknown;

  for (const key of [primaryProvider, ...(fallbackKey ? [fallbackKey] : [])]) {
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
