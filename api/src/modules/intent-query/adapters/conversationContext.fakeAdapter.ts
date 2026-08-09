import type { ConversationContextPort, ConversationMessage } from "../ports/conversationContext.port.js";

interface StoredConversation {
  tenantId: string;
  actorId: string;
  messages: ConversationMessage[];
}

export class FakeConversationContextAdapter implements ConversationContextPort {
  private conversations = new Map<string, StoredConversation>();

  /**
   * Seed conversation data for tests.
   */
  setConversation(
    conversationId: string,
    tenantId: string,
    actorId: string,
    messages: ConversationMessage[]
  ): void {
    this.conversations.set(conversationId, {
      tenantId,
      actorId,
      messages,
    });
  }

  /**
   * Retrieve conversation context, enforcing tenant and user isolation.
   */
  async getContext(
    tenantId: string,
    actorId: string,
    conversationId: string,
    maxMessages: number
  ): Promise<ConversationMessage[]> {
    const convo = this.conversations.get(conversationId);
    if (!convo) {
      return [];
    }

    // Match production's non-enumerating behavior: inaccessible and missing
    // conversations both yield no context.
    if (convo.tenantId !== tenantId || convo.actorId !== actorId) {
      return [];
    }

    // Limit context length
    return convo.messages.slice(-maxMessages);
  }

  clear(): void {
    this.conversations.clear();
  }
}
