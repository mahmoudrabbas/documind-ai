import type { ModelAdapter } from "../../modules/agents/agents.types.js";
import { AppError } from "../../common/errors/AppError.js";
import { LLM_PROVIDER_UNAVAILABLE } from "../../common/errors/errorCodes.js";
import { FakeModelAdapter } from "./fakeAdapters.js";
import { FallbackModelAdapter } from "./fallbackAdapter.js";
import { GroqChatAdapter } from "./groqChat.adapter.js";
import { createStudentBedrockProvider } from "../bedrock/index.js";

let singleton: ModelAdapter | null = null;

/**
 * Returns the configured model adapter singleton.
 * Builds the real provider fallback chain: Groq → Bedrock. Set GROQ_API_KEY
 * and/or SBG_API_KEY to enable real providers. Never enables FakeModelAdapter
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
 * Builds the runtime fallback chain in priority order:
 *  1. Groq (primary) when GROQ_API_KEY is set
 *  2. Bedrock (secondary) when SBG_API_KEY is set
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
