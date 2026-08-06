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
 * Uses the async LLM provider which builds the fallback chain
 * (Groq → Bedrock → Fake). Also swaps in the real MongoDB conversation
 * context adapter.
 */
export async function initializeIntentQueryService(): Promise<void> {
  const { getModelAdapterAsync, setModelAdapter } = await import("../../providers/llm/index.js");
  const modelAdapter = await getModelAdapterAsync();
  setModelAdapter(modelAdapter);
  _instance = new IntentQueryService(modelAdapter, mongoConversationContextAdapter);
  logger.info(`IntentQueryService initialized with model: ${modelAdapter.providerKey}, conversation context: MongoDB`);
}

/**
 * Accessor that always returns the current service instance.
 * Used by controllers so they always get the latest (potentially real) adapter.
 */
export function getIntentQueryService(): IntentQueryService {
  return _instance;
}
