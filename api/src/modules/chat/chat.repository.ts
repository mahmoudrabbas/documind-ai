import mongoose from "mongoose";
import ConversationModel from "../../db/models/conversation.model.js";
import MessageModel from "../../db/models/message.model.js";
import type { MessageAttachment, MessageSource } from "../../db/models/message.model.js";
import { tenantScopedFindById } from "../../db/repositories/tenantScopedRepository.js";

export async function createConversation(
  tenantId: string,
  userId: string,
  title: string,
) {
  return ConversationModel.create({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    userId: new mongoose.Types.ObjectId(userId),
    title,
    lastMessageAt: new Date(),
    messageCount: 0,
  });
}

export async function addMessage(
  tenantId: string,
  conversationId: string,
  role: "user" | "assistant",
  content: string,
  sequenceNumber: number,
  sources?: MessageSource[],
  attachments?: MessageAttachment[],
  clientMessageId?: string,
) {
  const doc = await MessageModel.create({
    tenantId: new mongoose.Types.ObjectId(tenantId),
    conversationId: new mongoose.Types.ObjectId(conversationId),
    role,
    content,
    sequenceNumber,
    sources: sources ?? [],
    attachments: attachments ?? [],
    ...(clientMessageId ? { clientMessageId } : {}),
  });

  await ConversationModel.updateOne(
    { _id: conversationId, tenantId },
    {
      $inc: { messageCount: 1 },
      $set: { lastMessageAt: new Date() },
    },
  ).exec();

  return doc;
}

/**
 * Finds the first user message carrying a clientMessageId idempotency key in
 * a conversation, used to de-duplicate retried vision sends.
 */
export async function getUserMessageByClientMessageId(
  tenantId: string,
  conversationId: string,
  clientMessageId: string,
) {
  return MessageModel.findOne({
    tenantId,
    conversationId,
    role: "user",
    clientMessageId,
  })
    .lean()
    .exec();
}

/**
 * Returns the first assistant message that follows a given user message
 * (strictly greater sequenceNumber), or null.
 */
export async function getAssistantReplyAfter(
  tenantId: string,
  conversationId: string,
  sequenceNumber: number,
) {
  return MessageModel.findOne({
    tenantId,
    conversationId,
    role: "assistant",
    sequenceNumber: { $gt: sequenceNumber },
  })
    .sort({ sequenceNumber: 1 })
    .lean()
    .exec();
}

/**
 * Finds a message carrying an attachment with the given id, scoped to the
 * tenant. Ownership of the underlying conversation is checked by callers.
 */
export async function findMessageByAttachmentId(
  tenantId: string,
  attachmentId: string,
) {
  return MessageModel.findOne({
    tenantId,
    "attachments.id": attachmentId,
  })
    .lean()
    .exec();
}

export async function getConversationHistory(
  tenantId: string,
  conversationId: string,
  limit = 20,
) {
  return MessageModel.find({
    tenantId,
    conversationId,
  })
    .sort({ sequenceNumber: 1 })
    .limit(limit)
    .lean()
    .exec();
}

export async function listConversationsByUser(
  tenantId: string,
  userId: string,
  page = 1,
  pageSize = 20,
) {
  const skip = (page - 1) * pageSize;
  const [conversations, total] = await Promise.all([
    ConversationModel.find({ tenantId, userId })
      .sort({ lastMessageAt: -1 })
      .skip(skip)
      .limit(pageSize)
      .lean()
      .exec(),
    ConversationModel.countDocuments({ tenantId, userId }).exec(),
  ]);
  return { conversations, total, page, pageSize };
}

export async function getConversationById(
  tenantId: string,
  conversationId: string,
) {
  return tenantScopedFindById(ConversationModel, tenantId, conversationId)
    .lean()
    .exec();
}

export async function deleteConversation(
  tenantId: string,
  conversationId: string,
  userId: string,
) {
  const conversation = await ConversationModel.findOneAndDelete({
    _id: conversationId,
    tenantId,
    userId,
  })
    .lean()
    .exec();

  if (conversation) {
    await MessageModel.deleteMany({
      tenantId,
      conversationId,
    }).exec();
  }

  return conversation;
}

export async function countMessages(
  tenantId: string,
  conversationId: string,
) {
  return MessageModel.countDocuments({
    tenantId,
    conversationId,
  }).exec();
}
