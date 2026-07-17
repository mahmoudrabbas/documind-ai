import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId, type MongoClient } from "mongodb";
import { createEmailSendJobHandler } from "./emailSendJob.js";
import { setMockClient } from "../db/mongo.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import type { JobHandlerContext } from "../contracts/jobDispatcher.js";
import type { EmailDispatchInput, EmailDispatchResult, EmailDispatchPort } from "../providers/emailDispatchPort.js";

const mockPort: EmailDispatchPort = {
  send: async (): Promise<EmailDispatchResult> => ({ providerMessageId: null, state: "SENT" }),
};

const mockCtx: JobHandlerContext = {
  envelope: {} as JobHandlerContext["envelope"],
  traceId: "trace-1",
  isRetry: false,
  attemptsMade: 0,
  maxAttempts: 5,
  signal: new AbortController().signal,
  progress: () => {},
};

test("happy path: queues email, sends it, transitions to SENT", async () => {
  const messageId = new ObjectId();
  const tenantId = new ObjectId();
  
  const mockMessage = {
    _id: messageId,
    tenantId,
    recipientEmail: "test@example.com",
    recipientHash: "hash",
    state: "QUEUED",
    templateId: "email_verification",
    language: "en",
    variables: { adminName: "Bob", companyName: "Acme", verificationUrl: "url", expiryLabel: "1h" },
    idempotencyKey: "idem-1",
    attemptCount: 0,
  };

  const findOneCalls: Array<{ name: string; query: Record<string, unknown> }> = [];
  const updateOneCalls: Array<{ name: string; query: Record<string, unknown>; update: Record<string, unknown> }> = [];
  const insertOneCalls: Array<{ name: string; doc: Record<string, unknown> }> = [];

  const mockDb = {
    collection: (name: string) => {
      return {
        findOne: async (query: Record<string, unknown>) => {
          findOneCalls.push({ name, query });
          if (name === "emailmessages") return mockMessage;
          if (name === "emailsuppressions") return null;
          if (name === "tenants") return { settings: { accentColor: "#ff0000", logoUrl: "logo" } };
          return null;
        },
        updateOne: async (query: Record<string, unknown>, update: Record<string, unknown>) => {
          updateOneCalls.push({ name, query, update });
          if (name === "emailmessages") {
            const $set = update.$set as Record<string, unknown> | undefined;
            if ($set && $set.state) {
              mockMessage.state = $set.state as string;
            }
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
        insertOne: async (doc: Record<string, unknown>) => {
          insertOneCalls.push({ name, doc });
          return { insertedId: doc._id };
        },
      };
    },
  };

  const mockClient = {
    db: () => mockDb,
  } as unknown as MongoClient;

  setMockClient(mockClient);

  mockPort.send = async (input: EmailDispatchInput): Promise<EmailDispatchResult> => {
    assert.equal(input.to, "test@example.com");
    assert.equal(input.idempotencyKey, "idem-1");
    return {
      providerMessageId: "prov-1",
      state: "SENT",
    };
  };

  const handler = createEmailSendJobHandler(mockPort);
  const result = await handler.handle({ messageId: messageId.toString() }, mockCtx);

  assert.deepEqual(result, { summary: { sent: true, providerMessageId: "prov-1" } });
  assert.equal(mockMessage.state, "SENT");
  
  assert.ok(updateOneCalls.some(c => c.name === "emailmessages" && (c.update.$set as Record<string, unknown>)?.state === "PROCESSING"));
  assert.ok(updateOneCalls.some(c => c.name === "emailmessages" && (c.update.$set as Record<string, unknown>)?.state === "SENT"));
  assert.ok(insertOneCalls.some(c => c.name === "emailattempts" && c.doc.state === "PROCESSING"));

  setMockClient(null);
});

test("discards if CANCELLED", async () => {
  const messageId = new ObjectId();
  const mockMessage = {
    _id: messageId,
    state: "CANCELLED",
  };

  const mockDb = {
    collection: () => {
      return {
        findOne: async () => mockMessage,
      };
    },
  };

  const mockClient = {
    db: () => mockDb,
  } as unknown as MongoClient;

  setMockClient(mockClient);

  let sendCalled = false;
  mockPort.send = async () => {
    sendCalled = true;
    return { providerMessageId: null, state: "SENT" };
  };

  const handler = createEmailSendJobHandler(mockPort);
  const result = await handler.handle({ messageId: messageId.toString() }, mockCtx);

  assert.deepEqual(result, { summary: { discarded: true, reason: "state_CANCELLED" } });
  assert.equal(sendCalled, false);

  setMockClient(null);
});

test("throws RetryableJobError on TEMPORARY_FAILURE", async () => {
  const messageId = new ObjectId();
  const tenantId = new ObjectId();
  const mockMessage = {
    _id: messageId,
    tenantId,
    recipientEmail: "test@example.com",
    recipientHash: "hash",
    state: "QUEUED",
    templateId: "email_verification",
    language: "en",
    variables: { adminName: "Bob", companyName: "Acme", verificationUrl: "url", expiryLabel: "1h" },
    idempotencyKey: "idem-1",
    attemptCount: 0,
  };

  const mockDb = {
    collection: (name: string) => {
      return {
        findOne: async () => {
          if (name === "emailmessages") return mockMessage;
          if (name === "emailsuppressions") return null;
          if (name === "tenants") return { settings: {} };
          return null;
        },
        updateOne: async (_query: Record<string, unknown>, update: Record<string, unknown>) => {
          const $set = update.$set as Record<string, unknown> | undefined;
          if (name === "emailmessages" && $set && $set.state) {
            mockMessage.state = $set.state as string;
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
        insertOne: async (doc: Record<string, unknown>) => {
          return { insertedId: doc._id };
        },
      };
    },
  };

  const mockClient = {
    db: () => mockDb,
  } as unknown as MongoClient;

  setMockClient(mockClient);

  mockPort.send = async () => {
    return {
      providerMessageId: null,
      state: "TEMPORARY_FAILURE",
      errorCategory: "timeout",
      errorMessage: "Connection timed out",
    };
  };

  const handler = createEmailSendJobHandler(mockPort);
  await assert.rejects(
    handler.handle({ messageId: messageId.toString() }, mockCtx),
    RetryableJobError
  );

  assert.equal(mockMessage.state, "TEMPORARY_FAILURE");

  setMockClient(null);
});

test("throws PermanentJobError and suppresses on hard bounce", async () => {
  const messageId = new ObjectId();
  const tenantId = new ObjectId();
  const mockMessage = {
    _id: messageId,
    tenantId,
    recipientEmail: "test@example.com",
    recipientHash: "hash",
    state: "QUEUED",
    templateId: "email_verification",
    language: "en",
    variables: { adminName: "Bob", companyName: "Acme", verificationUrl: "url", expiryLabel: "1h" },
    idempotencyKey: "idem-1",
    attemptCount: 0,
  };

  const updateOneCalls: Array<{ name: string; query: Record<string, unknown>; update: Record<string, unknown> }> = [];

  const mockDb = {
    collection: (name: string) => {
      return {
        findOne: async () => {
          if (name === "emailmessages") return mockMessage;
          if (name === "emailsuppressions") return null;
          if (name === "tenants") return { settings: {} };
          return null;
        },
        updateOne: async (query: Record<string, unknown>, update: Record<string, unknown>) => {
          updateOneCalls.push({ name, query, update });
          const $set = update.$set as Record<string, unknown> | undefined;
          if (name === "emailmessages" && $set && $set.state) {
            mockMessage.state = $set.state as string;
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
        insertOne: async (doc: Record<string, unknown>) => {
          return { insertedId: doc._id };
        },
      };
    },
  };

  const mockClient = {
    db: () => mockDb,
  } as unknown as MongoClient;

  setMockClient(mockClient);

  mockPort.send = async () => {
    return {
      providerMessageId: null,
      state: "PERMANENT_FAILURE",
      errorCategory: "rejected",
      errorMessage: "Hard bounce 550",
    };
  };

  const handler = createEmailSendJobHandler(mockPort);
  await assert.rejects(
    handler.handle({ messageId: messageId.toString() }, mockCtx),
    PermanentJobError
  );

  assert.equal(mockMessage.state, "PERMANENT_FAILURE");
  assert.ok(updateOneCalls.some(c => c.name === "emailsuppressions" && c.query.emailHash === "hash"));

  setMockClient(null);
});
