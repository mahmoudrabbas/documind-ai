export interface ConversationMessage {
  role: "user" | "assistant";
  content: string;
  timestamp: string;
}

export interface ConversationContextPort {
  /**
   * Retrieve conversation context for the given user within their tenant.
   * Returns empty array if conversation doesn't exist or is unauthorized.
   */
  getContext(
    tenantId: string,
    actorId: string,
    conversationId: string,
    maxMessages: number
  ): Promise<ConversationMessage[]>;
}
