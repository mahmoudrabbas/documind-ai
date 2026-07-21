import type { ConversationContextPort, ConversationMessage } from "../ports/conversationContext.port.js";
import { AppError } from "../../../common/errors/AppError.js";
import { FORBIDDEN } from "../../../common/errors/errorCodes.js";

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

    // Verify tenant and user authorization
    if (convo.tenantId !== tenantId || convo.actorId !== actorId) {
      throw new AppError(
        403,
        FORBIDDEN,
        "Access denied to this conversation context"
      );
    }

    // Limit context length
    return convo.messages.slice(-maxMessages);
  }

  clear(): void {
    this.conversations.clear();
  }
}
