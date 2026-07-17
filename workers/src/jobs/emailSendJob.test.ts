import test from "node:test";
import assert from "node:assert/strict";
import { ObjectId } from "mongodb";
import { createEmailSendJobHandler } from "./emailSendJob.js";
import { setMockClient } from "../db/mongo.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import type { JobHandlerContext } from "../contracts/jobDispatcher.js";

const mockPort = {
  send: async (input: any): Promise<any> => ({}) as any,
};

const mockCtx: JobHandlerContext = {
  envelope: {} as any,
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

  const findOneCalls: any[] = [];
  const updateOneCalls: any[] = [];
  const insertOneCalls: any[] = [];

  const mockDb = {
    collection: (name: string) => {
      return {
        findOne: async (query: any) => {
          findOneCalls.push({ name, query });
          if (name === "emailmessages") return mockMessage;
          if (name === "emailsuppressions") return null;
          if (name === "tenants") return { settings: { accentColor: "#ff0000", logoUrl: "logo" } };
          return null;
        },
        updateOne: async (query: any, update: any) => {
          updateOneCalls.push({ name, query, update });
          if (name === "emailmessages") {
            if (update.$set && update.$set.state) {
              mockMessage.state = update.$set.state;
            }
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
        insertOne: async (doc: any) => {
          insertOneCalls.push({ name, doc });
          return { insertedId: doc._id };
        },
      };
    },
  };

  const mockClient = {
    db: () => mockDb,
  } as any;

  setMockClient(mockClient);

  mockPort.send = async (input) => {
    assert.equal(input.to, "test@example.com");
    assert.equal(input.idempotencyKey, "idem-1");
    return {
      providerMessageId: "prov-1",
      state: "SENT",
    };
  };

  const handler = createEmailSendJobHandler(mockPort as any);
  const result = await handler.handle({ messageId: messageId.toString() }, mockCtx);

  assert.deepEqual(result, { summary: { sent: true, providerMessageId: "prov-1" } });
  assert.equal(mockMessage.state, "SENT");
  
  assert.ok(updateOneCalls.some(c => c.name === "emailmessages" && c.update.$set.state === "PROCESSING"));
  assert.ok(updateOneCalls.some(c => c.name === "emailmessages" && c.update.$set.state === "SENT"));
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
    collection: (name: string) => {
      return {
        findOne: async () => mockMessage,
      };
    },
  };

  const mockClient = {
    db: () => mockDb,
  } as any;

  setMockClient(mockClient);

  let sendCalled = false;
  mockPort.send = async () => {
    sendCalled = true;
    return { providerMessageId: null, state: "SENT" };
  };

  const handler = createEmailSendJobHandler(mockPort as any);
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
        findOne: async (query: any) => {
          if (name === "emailmessages") return mockMessage;
          if (name === "emailsuppressions") return null;
          if (name === "tenants") return { settings: {} };
          return null;
        },
        updateOne: async (query: any, update: any) => {
          if (name === "emailmessages" && update.$set && update.$set.state) {
            mockMessage.state = update.$set.state;
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
        insertOne: async (doc: any) => {
          return { insertedId: doc._id };
        },
      };
    },
  };

  const mockClient = {
    db: () => mockDb,
  } as any;

  setMockClient(mockClient);

  mockPort.send = async () => {
    return {
      providerMessageId: null,
      state: "TEMPORARY_FAILURE",
      errorCategory: "timeout",
      errorMessage: "Connection timed out",
    };
  };

  const handler = createEmailSendJobHandler(mockPort as any);
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

  const updateOneCalls: any[] = [];

  const mockDb = {
    collection: (name: string) => {
      return {
        findOne: async (query: any) => {
          if (name === "emailmessages") return mockMessage;
          if (name === "emailsuppressions") return null;
          if (name === "tenants") return { settings: {} };
          return null;
        },
        updateOne: async (query: any, update: any) => {
          updateOneCalls.push({ name, query, update });
          if (name === "emailmessages" && update.$set && update.$set.state) {
            mockMessage.state = update.$set.state;
          }
          return { matchedCount: 1, modifiedCount: 1 };
        },
        insertOne: async (doc: any) => {
          return { insertedId: doc._id };
        },
      };
    },
  };

  const mockClient = {
    db: () => mockDb,
  } as any;

  setMockClient(mockClient);

  mockPort.send = async () => {
    return {
      providerMessageId: null,
      state: "PERMANENT_FAILURE",
      errorCategory: "rejected",
      errorMessage: "Hard bounce 550",
    };
  };

  const handler = createEmailSendJobHandler(mockPort as any);
  await assert.rejects(
    handler.handle({ messageId: messageId.toString() }, mockCtx),
    PermanentJobError
  );

  assert.equal(mockMessage.state, "PERMANENT_FAILURE");
  assert.ok(updateOneCalls.some(c => c.name === "emailsuppressions" && c.query.emailHash === "hash"));

  setMockClient(null);
});
