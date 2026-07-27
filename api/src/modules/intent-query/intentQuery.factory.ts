import { IntentQueryService } from "./intentQuery.service.js";
import { FakeModelAdapter } from "../../providers/llm/fakeAdapters.js";
import { FakeConversationContextAdapter } from "./adapters/conversationContext.fakeAdapter.js";
import { MongoConversationContextAdapter } from "./adapters/conversationContext.mongoAdapter.js";
import type { ModelAdapter } from "../agents/agents.types.js";
import type { ConversationContextPort } from "./ports/conversationContext.port.js";
import { logger } from "../../common/logger/logger.js";

export const fakeConversationContextAdapter = new FakeConversationContextAdapter();
const mongoConversationContextAdapter = new MongoConversationContextAdapter();

/**
 * Factory function to instantiate the IntentQueryService with required adapters.
 * Allows injecting custom/mock adapters in test environments.
 */
export function createIntentQueryService(options?: {
  modelAdapter?: ModelAdapter;
  conversationContextAdapter?: ConversationContextPort;
}): IntentQueryService {
  const modelAdapter = options?.modelAdapter ?? new FakeModelAdapter();
  const conversationContextAdapter =
    options?.conversationContextAdapter ?? fakeConversationContextAdapter;

  return new IntentQueryService(modelAdapter, conversationContextAdapter);
}

// Mutable singleton — swapped in by initializeIntentQueryService() at startup
let _instance: IntentQueryService = createIntentQueryService();

/**
 * Called during app startup to swap in the real model adapter.
 * Uses the async LLM provider which respects AI_PROVIDER env var.
 * Also swaps in the real MongoDB conversation context adapter.
 */
export async function initializeIntentQueryService(): Promise<void> {
  const { setModelAdapter } = await import("../../providers/llm/index.js");
  const aiProvider = process.env.AI_PROVIDER || "fake";
  let modelAdapter;
  if (aiProvider === "student-bedrock") {
    const { createStudentBedrockProvider } = await import("../../providers/bedrock/index.js");
    modelAdapter = createStudentBedrockProvider();
  } else if (aiProvider === "groq") {
    const { GroqChatAdapter } = await import("../../providers/llm/groqChat.adapter.js");
    modelAdapter = new GroqChatAdapter(process.env.GROQ_API_KEY || "", process.env.GROQ_CHAT_MODEL || "llama-3.3-70b-versatile");
  } else {
    const { FakeModelAdapter } = await import("../../providers/llm/fakeAdapters.js");
    modelAdapter = new FakeModelAdapter();
  }
  setModelAdapter(modelAdapter);
  _instance = new IntentQueryService(modelAdapter, mongoConversationContextAdapter);
  logger.info(`IntentQueryService initialized with model: ${aiProvider}, conversation context: MongoDB`);
}

/**
 * Accessor that always returns the current service instance.
 * Used by controllers so they always get the latest (potentially real) adapter.
 */
export function getIntentQueryService(): IntentQueryService {
  return _instance;
}
