import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import DocumentModel from "../../../db/models/document.model.js";
import DocumentClassificationModel from "../../../db/models/documentClassification.model.js";
import DocumentAccessPolicyModel from "../../../db/models/documentAccessPolicy.model.js";
import { hashPassword } from "../../auth/passwordHashing.js";
import { disconnectRedis } from "../../../db/redis.js";

import { IntentQueryService } from "../intentQuery.service.js";
import { FakeConversationContextAdapter } from "../adapters/conversationContext.fakeAdapter.js";
import { FakeModelAdapter } from "../../../providers/llm/fakeAdapters.js";
import type { OperationAuthorizationContext } from "../../permissions/permissions.operation.js";
import type { DocumentAccessAction } from "../../document-access/documentAccess.actions.js";

let mongoServer: MongoMemoryReplSet | null = null;
const TEST_PASSWORD = "StrongPass123!";

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "intent-query-security" });
  } else {
    mongoServer = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [
        {
          launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000),
        },
      ],
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "intent-query-security" });
  }
});

after(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

let tenantId: string;
let actorId: string;
let companyAdminContext: OperationAuthorizationContext;
let fakeConvoAdapter: FakeConversationContextAdapter;
let modelAdapter: RecordingFakeModelAdapter;
let service: IntentQueryService;

class RecordingFakeModelAdapter extends FakeModelAdapter {
  readonly requestMessages: string[][] = [];

  override async complete(
    params: Parameters<FakeModelAdapter["complete"]>[0],
  ): ReturnType<FakeModelAdapter["complete"]> {
    this.requestMessages.push(params.messages.map((message) => message.content));
    return super.complete(params);
  }
}

async function createManifestDocument(options: {
  tenantId: string;
  ownerId: string;
  fileName: string;
  aliases?: string[];
  actions: DocumentAccessAction[];
}) {
  const classification = await DocumentClassificationModel.findOneAndUpdate(
    { tenantId: options.tenantId, normalizedName: "internal" },
    {
      $setOnInsert: {
        name: "Internal",
        normalizedName: "internal",
        level: "confidential" as const,
        description: "Manifest test classification",
        status: "active" as const,
        version: 1,
        createdBy: options.ownerId,
        updatedBy: options.ownerId,
      },
    },
    { upsert: true, new: true },
  );
  const policyId = new mongoose.Types.ObjectId();
  const now = new Date();
  const document = await DocumentModel.create({
    tenantId: options.tenantId,
    fileName: options.fileName,
    originalFileName: options.fileName,
    fileSize: 100,
    mimeType: "application/pdf",
    storageKey: `${options.tenantId}/${options.fileName}`,
    checksum: `manifest-${options.fileName}`,
    status: "uploaded" as const,
    metadata: {
      title: options.fileName,
      aliases: options.aliases ?? [],
      description: null,
      tags: [],
    },
    classification: "internal" as const,
    version: 1,
    versionLabel: "v1",
    uploadedBy: options.ownerId,
    owner: options.ownerId,
    classificationId: classification._id,
    activePolicyId: policyId,
    activePolicyVersion: 1,
    policyChangedAt: now,
    isArchived: false,
    archivedAt: null,
    archivedBy: null,
    deletedAt: null,
    deletedBy: null,
    quarantineStatus: "none" as const,
    scanResult: null,
    category: null,
    department: null,
    effectiveDate: null,
    expiryDate: null,
  });
  await DocumentAccessPolicyModel.create({
    tenantId: options.tenantId,
    documentId: document._id,
    policyId,
    policyVersion: 1,
    contractVersion: 1,
    status: "active",
    effectiveFrom: now,
    effectiveUntil: null,
    inherits: null,
    rules: [{
      ruleId: "manifest-owner-rule",
      effect: "allow",
      subject: { type: "owner" },
      actions: options.actions,
    }],
    provenance: {
      createdBy: options.ownerId,
      createdAt: now,
      reason: "Manifest authorization test",
    },
    indexMetadata: {
      policyId,
      policyVersion: 1,
      classificationId: classification._id,
      categoryId: null,
      departmentId: null,
    },
    createdAt: now,
  });
  return document;
}

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await DocumentModel.deleteMany({});
  await DocumentClassificationModel.deleteMany({});
  await DocumentAccessPolicyModel.deleteMany({});

  const tenant = await TenantModel.create({
    name: "Tenant A",
    slug: "tenant-a",
    status: "active",
    plan: "free",
  });
  tenantId = tenant.id;

  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Admin User",
    email: "admin@tenanta.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  actorId = user.id;

  companyAdminContext = {
    tenantId: tenantId,
    actorId: actorId,
    actorEmail: user.email,
    actorRole: user.role,
    traceId: "security-trace",
    requestId: "security-req",
  };

  fakeConvoAdapter = new FakeConversationContextAdapter();
  modelAdapter = new RecordingFakeModelAdapter();
  service = new IntentQueryService(modelAdapter, fakeConvoAdapter);
});

test("IntentQueryService - Security & Isolation Tests", async (t) => {
  await t.test("filters the provider-visible manifest through canonical use_in_ai authorization", async () => {
    const authorized = await createManifestDocument({
      tenantId,
      ownerId: actorId,
      fileName: "Remote Work Policy.pdf",
      aliases: ["WFH Policy", "Remote Work Handbook"],
      actions: ["discover", "read", "use_in_ai"],
    });
    await createManifestDocument({
      tenantId,
      ownerId: actorId,
      fileName: "Restricted Executive Compensation.pdf",
      aliases: ["Executive Pay Secret", "Board Compensation"],
      actions: ["discover", "read"],
    });

    const otherTenant = await TenantModel.create({
      name: "Tenant B",
      slug: "tenant-b",
      status: "active",
      plan: "free",
    });
    const otherUser = await UserModel.create({
      tenantId: otherTenant._id,
      name: "Other User",
      email: "other@tenant-b.com",
      passwordHash: await hashPassword(TEST_PASSWORD),
      role: "COMPANY_ADMIN",
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });
    await createManifestDocument({
      tenantId: otherTenant.id,
      ownerId: otherUser.id,
      fileName: "Foreign Tenant Policy.pdf",
      aliases: ["Foreign Secret Alias"],
      actions: ["discover", "read", "use_in_ai"],
    });

    const plan = await service.analyzeQuery(
      { question: "What is the remote work policy?" },
      companyAdminContext,
    );
    assert.equal(plan.route, "rag");
    const providerPayload = modelAdapter.requestMessages.flat().join("\n");
    assert.match(providerPayload, /Remote Work Policy\.pdf/);
    assert.match(providerPayload, /WFH Policy/);
    assert.doesNotMatch(providerPayload, /Restricted Executive Compensation\.pdf/);
    assert.doesNotMatch(providerPayload, /Executive Pay Secret/);
    assert.doesNotMatch(providerPayload, /Board Compensation/);
    assert.doesNotMatch(providerPayload, /Foreign Tenant Policy\.pdf/);
    assert.doesNotMatch(providerPayload, /Foreign Secret Alias/);

    const targeted = await service.analyzeQuery(
      { question: "What is in Remote Work Policy.pdf?" },
      companyAdminContext,
    );
    assert.equal(targeted.route, "rag");
    assert.deepEqual(targeted.referencedDocumentIds, [authorized.id]);
    assert.deepEqual(targeted.referencedDocumentTitles, [authorized.fileName]);
  });

  await t.test("should not consume conversation context belonging to another tenant", async () => {
    const anotherTenantId = new mongoose.Types.ObjectId().toString();
    const anotherActorId = new mongoose.Types.ObjectId().toString();
    const conversationId = new mongoose.Types.ObjectId().toString();

    // Seed conversation with another tenant's credentials
    fakeConvoAdapter.setConversation(conversationId, anotherTenantId, anotherActorId, [
      { role: "user", content: "Top secret details", timestamp: new Date().toISOString() },
    ]);

    const result = await service.analyzeQuery(
      {
        question: "What is my vacation policy?",
        conversationId,
      },
      companyAdminContext,
    );
    assert.equal(result.conversationContextUsed, false);
    assert.equal(
      modelAdapter.requestMessages.flat().some((content) => content.includes("Top secret details")),
      false,
    );
  });

  await t.test("should not consume conversation context belonging to another user in same tenant", async () => {
    const anotherActorId = new mongoose.Types.ObjectId().toString();
    const conversationId = new mongoose.Types.ObjectId().toString();

    // Seed conversation in same tenant but different user
    fakeConvoAdapter.setConversation(conversationId, tenantId, anotherActorId, [
      { role: "user", content: "Top secret details of User B", timestamp: new Date().toISOString() },
    ]);

    const result = await service.analyzeQuery(
      {
        question: "What did I ask last time?",
        conversationId,
      },
      companyAdminContext,
    );
    assert.equal(result.conversationContextUsed, false);
    assert.equal(
      modelAdapter.requestMessages.flat().some((content) =>
        content.includes("Top secret details of User B")
      ),
      false,
    );

    const missingResult = await service.analyzeQuery(
      {
        question: "What did I ask last time?",
        conversationId: new mongoose.Types.ObjectId().toString(),
      },
      companyAdminContext,
    );
    assert.deepEqual(
      {
        route: result.route,
        detectedIntent: result.detectedIntent,
        isFollowUp: result.isFollowUp,
        conversationContextUsed: result.conversationContextUsed,
      },
      {
        route: missingResult.route,
        detectedIntent: missingResult.detectedIntent,
        isFollowUp: missingResult.isFollowUp,
        conversationContextUsed: missingResult.conversationContextUsed,
      },
    );
  });

  await t.test("should prevent execution of disabled users", async () => {
    const employeeUser = await UserModel.create({
      tenantId: new mongoose.Types.ObjectId(tenantId),
      name: "Employee User",
      email: "employee@tenanta.com",
      passwordHash: await hashPassword(TEST_PASSWORD),
      role: "EMPLOYEE",
      status: "disabled",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });

    const employeeContext = {
      tenantId: tenantId,
      actorId: employeeUser.id,
      actorEmail: employeeUser.email,
      actorRole: employeeUser.role,
      traceId: "employee-trace",
      requestId: "employee-req",
    };

    // Disabled users do not pass resolvePersistedActor.
    // Let's assert it rejects with a 403 Permission Denied.
    await assert.rejects(
      service.analyzeQuery(
        { question: "What is the policy?" },
        employeeContext
      ),
      (err: unknown) => {
        const error = err as Record<string, unknown>;
        assert.equal(error.statusCode, 403);
        assert.equal(error.code, "PERMISSION_REQUIRED");
        return true;
      }
    );
  });
});
