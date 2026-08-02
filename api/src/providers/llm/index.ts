import type { ModelAdapter } from "../../modules/agents/agents.types.js";
import { FakeModelAdapter } from "./fakeAdapters.js";
import { GroqChatAdapter } from "./groqChat.adapter.js";

let singleton: ModelAdapter | null = null;

/**
 * Returns the configured model adapter singleton.
 * Set AI_PROVIDER=groq and GROQ_API_KEY to use Groq.
 * Set AI_PROVIDER=student-bedrock and SBG_API_KEY to use the Student Bedrock Gateway.
 * Falls back to FakeModelAdapter only when AI_PROVIDER is unset or "fake".
 */
export function getModelAdapter(): ModelAdapter {
  if (singleton) return singleton;
  const adapter = createModelAdapterSync();
  singleton = adapter;
  return singleton;
}

export function setModelAdapter(adapter: ModelAdapter | null): void {
  singleton = adapter;
}

function createModelAdapterSync(): ModelAdapter {
  const aiProvider = process.env.AI_PROVIDER || "fake";

  if (aiProvider === "groq") {
    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile";
    if (!apiKey) throw new Error("GROQ_API_KEY is required for groq provider");
    return new GroqChatAdapter(apiKey, model);
  }

  if (aiProvider === "student-bedrock") {
    // Bedrock requires async init; swap in on first async use.
    return new FakeModelAdapter();
  }

  return new FakeModelAdapter();
}

// Async version for proper initialization
export async function getModelAdapterAsync(): Promise<ModelAdapter> {
  if (singleton) return singleton;
  singleton = await createModelAdapter();
  return singleton;
}

async function createModelAdapter(): Promise<ModelAdapter> {
  const aiProvider = process.env.AI_PROVIDER || "fake";

  if (aiProvider === "student-bedrock") {
    const { createStudentBedrockProvider } = await import("../bedrock/index.js");
    return createStudentBedrockProvider();
  }

  if (aiProvider === "groq") {
    const apiKey = process.env.GROQ_API_KEY;
    const model = process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile";
    if (!apiKey) throw new Error("GROQ_API_KEY is required for groq provider");
    return new GroqChatAdapter(apiKey, model);
  }

  return new FakeModelAdapter();
}

export type { ModelAdapter } from "../../modules/agents/agents.types.js";