import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import ConversationModel from "../../../db/models/conversation.model.js";
import MessageModel from "../../../db/models/message.model.js";
import { FakeConversationContextAdapter } from "./conversationContext.fakeAdapter.js";
import { MongoConversationContextAdapter } from "./conversationContext.mongoAdapter.js";

let mongo: MongoMemoryServer;

before(async () => {
  mongo = await MongoMemoryServer.create({
    binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
  });
  await mongoose.connect(mongo.getUri(), { dbName: "conversation-context-adapter" });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([
    ConversationModel.deleteMany({}),
    MessageModel.deleteMany({}),
  ]);
});

test("Mongo context requires tenant, conversation, and owning actor while preserving bounded order", async () => {
  const tenantId = new mongoose.Types.ObjectId();
  const ownerId = new mongoose.Types.ObjectId();
  const otherActorId = new mongoose.Types.ObjectId();
  const otherTenantId = new mongoose.Types.ObjectId();
  const conversation = await ConversationModel.create({
    tenantId,
    userId: ownerId,
    title: "Owner conversation",
  });
  await MessageModel.create([
    { tenantId, conversationId: conversation._id, role: "user", content: "first", sequenceNumber: 0 },
    { tenantId, conversationId: conversation._id, role: "assistant", content: "second", sequenceNumber: 1 },
    { tenantId, conversationId: conversation._id, role: "user", content: "third", sequenceNumber: 2 },
  ]);

  const adapter = new MongoConversationContextAdapter();
  const ownerContext = await adapter.getContext(
    tenantId.toString(),
    ownerId.toString(),
    conversation.id,
    2,
  );
  assert.deepEqual(ownerContext.map((message) => message.content), ["second", "third"]);

  assert.deepEqual(
    await adapter.getContext(tenantId.toString(), otherActorId.toString(), conversation.id, 20),
    [],
  );
  assert.deepEqual(
    await adapter.getContext(otherTenantId.toString(), ownerId.toString(), conversation.id, 20),
    [],
  );
  assert.deepEqual(
    await adapter.getContext(tenantId.toString(), ownerId.toString(), new mongoose.Types.ObjectId().toString(), 20),
    [],
  );
});

test("fake and Mongo adapters share non-enumerating ownership behavior", async () => {
  const tenantId = new mongoose.Types.ObjectId().toString();
  const ownerId = new mongoose.Types.ObjectId().toString();
  const otherActorId = new mongoose.Types.ObjectId().toString();
  const conversationId = new mongoose.Types.ObjectId().toString();
  const messages = [
    { role: "user" as const, content: "first", timestamp: new Date(1).toISOString() },
    { role: "assistant" as const, content: "second", timestamp: new Date(2).toISOString() },
  ];
  const fake = new FakeConversationContextAdapter();
  fake.setConversation(conversationId, tenantId, ownerId, messages);

  assert.deepEqual(
    await fake.getContext(tenantId, ownerId, conversationId, 1),
    messages.slice(-1),
  );
  assert.deepEqual(await fake.getContext(tenantId, otherActorId, conversationId, 20), []);
  assert.deepEqual(
    await fake.getContext(new mongoose.Types.ObjectId().toString(), ownerId, conversationId, 20),
    [],
  );
  assert.deepEqual(
    await fake.getContext(tenantId, ownerId, new mongoose.Types.ObjectId().toString(), 20),
    [],
  );
});
