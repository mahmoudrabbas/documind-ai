import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../../db/connection.js";
import KnowledgeGapModel from "../../db/models/knowledgeGap.model.js";
import ConversationModel from "../../db/models/conversation.model.js";
import MessageModel from "../../db/models/message.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import { disconnectRedis } from "../../db/redis.js";
import { hashPassword } from "../auth/passwordHashing.js";
import { FeedbackService } from "../feedback/feedback.service.js";

before(async () => {
  await connectDB();
});

after(async () => {
  await disconnectRedis();
  await disconnectDB();
});

beforeEach(async () => {
  await Promise.all([
    TenantModel.deleteMany({}),
    UserModel.deleteMany({}),
    KnowledgeGapModel.deleteMany({}),
    ConversationModel.deleteMany({}),
    MessageModel.deleteMany({}),
  ]);
});

test("thumbs-down feedback still creates a negative-feedback knowledge gap", async () => {
  const tenant = await TenantModel.create({
    name: "Gap Co",
    slug: `gap-co-${new mongoose.Types.ObjectId().toString()}`,
    status: "active",
    plan: "free",
  });
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Gap Admin",
    email: `gap-${new mongoose.Types.ObjectId().toString()}@example.com`,
    passwordHash: await hashPassword("StrongPass123!"),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });

  const conversation = await ConversationModel.create({
    tenantId: tenant._id, userId: user._id, title: "Gap conversation", lastMessageAt: new Date(), messageCount: 1,
  });
  const message = await MessageModel.create({
    tenantId: tenant._id, conversationId: conversation._id, role: "assistant", content: "Gap answer", sequenceNumber: 1,
  });
  await new FeedbackService().submitFeedback(tenant.id, user.id, {
    messageId: message.id,
    conversationId: conversation.id,
    rating: "thumbs_down",
    category: "inaccurate",
  });

  const gap = await KnowledgeGapModel.findOne({ tenantId: tenant.id }).lean().exec();
  assert.ok(gap);
  assert.equal(gap.source, "negative_feedback");
  assert.equal(gap.sourceMetadata?.outcome, "negative_feedback");
});
