import type { ConversationContextPort, ConversationMessage } from "../ports/conversationContext.port.js";
import mongoose from "mongoose";
import ConversationModel from "../../../db/models/conversation.model.js";
import MessageModel from "../../../db/models/message.model.js";

export class MongoConversationContextAdapter implements ConversationContextPort {
  async getContext(
    tenantId: string,
    actorId: string,
    conversationId: string,
    maxMessages: number,
  ): Promise<ConversationMessage[]> {
    if (
      !mongoose.Types.ObjectId.isValid(tenantId) ||
      !mongoose.Types.ObjectId.isValid(actorId) ||
      !mongoose.Types.ObjectId.isValid(conversationId)
    ) {
      return [];
    }

    // Enforce ownership at the persistence boundary. Message documents do not
    // carry the owning user, so authorize against the parent conversation
    // before reading any history. A missing, foreign-tenant, or foreign-owner
    // conversation is deliberately indistinguishable from one another.
    const ownedConversation = await ConversationModel.exists({
      _id: conversationId,
      tenantId,
      userId: actorId,
    });
    if (!ownedConversation) return [];

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
