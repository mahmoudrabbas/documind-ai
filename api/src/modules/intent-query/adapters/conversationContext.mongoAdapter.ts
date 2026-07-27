import type { ConversationContextPort, ConversationMessage } from "../ports/conversationContext.port.js";
import MessageModel from "../../../db/models/message.model.js";

export class MongoConversationContextAdapter implements ConversationContextPort {
  async getContext(
    tenantId: string,
    actorId: string,
    conversationId: string,
    maxMessages: number,
  ): Promise<ConversationMessage[]> {
    const messages = await MessageModel.find({
      tenantId,
      conversationId,
    })
      .sort({ sequenceNumber: -1 })
      .limit(maxMessages)
      .lean()
      .exec();

    return messages.reverse().map((m) => ({
      role: m.role as "user" | "assistant",
      content: m.content,
      timestamp: m.createdAt.toISOString(),
    }));
  }
}
