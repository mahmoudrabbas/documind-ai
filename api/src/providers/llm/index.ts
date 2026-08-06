import type { ModelAdapter } from "../../modules/agents/agents.types.js";
import { FakeModelAdapter } from "./fakeAdapters.js";
import { FallbackModelAdapter } from "./fallbackAdapter.js";
import { GroqChatAdapter } from "./groqChat.adapter.js";
import { createStudentBedrockProvider } from "../bedrock/index.js";

let singleton: ModelAdapter | null = null;

/**
 * Returns the configured model adapter singleton.
 * Builds the provider fallback chain: Groq → Bedrock → Fake (graceful
 * degradation). Set GROQ_API_KEY and/or SBG_API_KEY to enable real providers.
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
 * Builds the fallback chain in priority order:
 *  1. Groq (primary) when GROQ_API_KEY is set
 *  2. Bedrock (secondary) when SBG_API_KEY is set
 *  3. FakeModelAdapter (graceful degradation) as the terminal adapter
 * When only one adapter is configured it is returned unwrapped.
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

  adapters.push(new FakeModelAdapter());

  if (adapters.length === 1) return adapters[0];
  return new FallbackModelAdapter(adapters);
}

export type { ModelAdapter } from "../../modules/agents/agents.types.js";
