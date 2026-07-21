import { IntentQueryService } from "./intentQuery.service.js";
import { FakeModelAdapter } from "../../providers/llm/fakeAdapters.js";
import { FakeConversationContextAdapter } from "./adapters/conversationContext.fakeAdapter.js";
import type { ModelAdapter } from "../agents/agents.types.js";
import type { ConversationContextPort } from "./ports/conversationContext.port.js";

export const fakeConversationContextAdapter = new FakeConversationContextAdapter();

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

// Default singleton instance for routing/standard application use
export const intentQueryService = createIntentQueryService();
