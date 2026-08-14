import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../../../db/connection.js";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import ConversationModel from "../../../db/models/conversation.model.js";
import MessageModel from "../../../db/models/message.model.js";
import FeedbackModel from "../../../db/models/feedback.model.js";
import AuditLogModel from "../../../db/models/auditLog.model.js";
import { FeedbackService } from "../feedback.service.js";
import type { KnowledgeGapsService } from "../../knowledge-gaps/knowledge-gaps.service.js";

before(async () => { await connectDB(); });
after(async () => { await disconnectDB(); });
beforeEach(async () => {
  await Promise.all([
    FeedbackModel.deleteMany({}), MessageModel.deleteMany({}), ConversationModel.deleteMany({}),
    UserModel.deleteMany({}), TenantModel.deleteMany({}), AuditLogModel.deleteMany({}),
  ]);
});

test("feedback persistence accepts only the actor's authoritative conversation and assistant message", async () => {
  const [tenant, foreignTenant] = await TenantModel.create([
    { name: "Feedback Tenant", slug: `feedback-${new mongoose.Types.ObjectId()}`, status: "active", plan: "free" },
    { name: "Foreign Feedback Tenant", slug: `foreign-feedback-${new mongoose.Types.ObjectId()}`, status: "active", plan: "free" },
  ]);
  const [actor, other, foreign] = await UserModel.create([
    { tenantId: tenant._id, name: "Feedback Actor", email: "feedback-actor@example.com", passwordHash: "unused", role: "EMPLOYEE", status: "active", emailVerified: true },
    { tenantId: tenant._id, name: "Feedback Other", email: "feedback-other@example.com", passwordHash: "unused", role: "EMPLOYEE", status: "active", emailVerified: true },
    { tenantId: foreignTenant._id, name: "Feedback Foreign", email: "feedback-foreign@example.com", passwordHash: "unused", role: "EMPLOYEE", status: "active", emailVerified: true },
  ]);
  const [ownConversation, otherConversation, foreignConversation] = await ConversationModel.create([
    { tenantId: tenant._id, userId: actor._id, title: "Own", lastMessageAt: new Date(), messageCount: 1 },
    { tenantId: tenant._id, userId: other._id, title: "Other", lastMessageAt: new Date(), messageCount: 1 },
    { tenantId: foreignTenant._id, userId: foreign._id, title: "Foreign", lastMessageAt: new Date(), messageCount: 1 },
  ]);
  const [ownMessage, otherMessage, foreignMessage] = await MessageModel.create([
    { tenantId: tenant._id, conversationId: ownConversation._id, role: "assistant", content: "Own answer", sequenceNumber: 1 },
    { tenantId: tenant._id, conversationId: otherConversation._id, role: "assistant", content: "Other answer", sequenceNumber: 1 },
    { tenantId: foreignTenant._id, conversationId: foreignConversation._id, role: "assistant", content: "Foreign answer", sequenceNumber: 1 },
  ]);
  let gapCalls = 0;
  let judgeCalls = 0;
  const gap = { reportCandidate: async () => { gapCalls += 1; return {}; } } as unknown as KnowledgeGapsService;
  const service = new FeedbackService(undefined, gap, {
    evaluateAsync: async () => { judgeCalls += 1; },
  });

  await service.submitFeedback(tenant.id, actor.id, {
    conversationId: ownConversation.id,
    messageId: ownMessage.id,
    rating: "thumbs_up",
  });
  assert.equal(await FeedbackModel.countDocuments({ tenantId: tenant._id }), 1);
  assert.equal(judgeCalls, 1);

  const deniedTargets = [
    { conversationId: otherConversation.id, messageId: otherMessage.id },
    { conversationId: ownConversation.id, messageId: otherMessage.id },
    { conversationId: foreignConversation.id, messageId: foreignMessage.id },
    { conversationId: new mongoose.Types.ObjectId().toString(), messageId: new mongoose.Types.ObjectId().toString() },
    { conversationId: "malformed", messageId: "malformed" },
  ];
  for (const target of deniedTargets) {
    await assert.rejects(
      service.submitFeedback(tenant.id, actor.id, { ...target, rating: "thumbs_down" }),
      (error: Error & { statusCode?: number; code?: string }) =>
        error.statusCode === 404 && error.code === "FEEDBACK_TARGET_NOT_FOUND",
    );
  }
  assert.equal(await FeedbackModel.countDocuments({ tenantId: tenant._id }), 1);
  assert.equal(gapCalls, 0);
  assert.equal(judgeCalls, 1);
});
