import test, { after, afterEach, before, beforeEach } from "node:test";
import assert from "node:assert";
import mongoose, { Types } from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import DocumentModel, { type DocumentClassification } from "../../db/models/document.model.js";
import DocumentVersionModel from "../../db/models/documentVersion.model.js";
import OcrPageResultModel from "../../db/models/ocrPageResult.model.js";
import DocumentQualityModel from "../../db/models/documentQuality.model.js";
import OcrUsageRecordModel from "../../db/models/ocrUsageRecord.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import DocumentClassificationModel from "../../db/models/documentClassification.model.js";
import DocumentAccessPolicyModel from "../../db/models/documentAccessPolicy.model.js";
import PackageModel from "../../db/models/package.model.js";
import SubscriptionModel from "../../db/models/subscription.model.js";
import QuotaOverrideModel from "../../db/models/quotaOverride.model.js";
import DocumentRelationshipModel from "../../db/models/documentRelationship.model.js";
import ConflictFindingModel from "../../db/models/conflictFinding.model.js";
import {
  getOcrPageResults,
  getDocumentQuality,
  assessDocumentQuality,
  reviewDocumentQuality,
  retryOcrPages,
  getOcrUsageSummary,
  triggerOcrProcessing,
  triggerVersionConflictAnalysis,
} from "./processing.service.js";
import type { DocumentAccessAction } from "../document-access/documentAccess.actions.js";
import { checkOcrPageQuota } from "../entitlement/entitlement-checks.js";
import type {
  DocumentComparisonInput,
  VersionConflictAgent,
} from "./ports/versionConflictAgent.port.js";

let mongoServer: MongoMemoryServer | null = null;
const TENANT_ID = "6650f0f0f0f0f0f0f0f0f0f0";
const ACTOR_ID = "6650f0f0f0f0f0f0f0f0f0f1";
const TEST_CONTEXT = {
  tenantId: TENANT_ID,
  actorId: ACTOR_ID,
  actorEmail: "processing-admin@example.com",
  actorRole: "COMPANY_ADMIN" as const,
};

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "test" });
  } else {
    mongoServer = await MongoMemoryServer.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      instance: { launchTimeout: 60_000 },
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "test" });
  }
});

after(async () => {
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

afterEach(async () => {
  await OcrPageResultModel.deleteMany({});
  await DocumentQualityModel.deleteMany({});
  await OcrUsageRecordModel.deleteMany({});
  await DocumentModel.deleteMany({});
  await DocumentVersionModel.deleteMany({});
  await UserModel.deleteMany({});
  await TenantModel.deleteMany({});
  await DocumentClassificationModel.deleteMany({});
  await DocumentAccessPolicyModel.deleteMany({});
  await PackageModel.deleteMany({});
  await SubscriptionModel.deleteMany({});
  await QuotaOverrideModel.deleteMany({});
  await DocumentRelationshipModel.deleteMany({});
  await ConflictFindingModel.deleteMany({});
});

beforeEach(async () => {
  await TenantModel.updateOne(
    { _id: new mongoose.Types.ObjectId(TENANT_ID) },
    {
      $set: {
        name: "Processing Tenant",
        slug: "processing-tenant",
        status: "active",
        plan: "free",
      },
    },
    { upsert: true },
  );
  await UserModel.updateOne(
    { _id: new mongoose.Types.ObjectId(ACTOR_ID) },
    {
      $set: {
        tenantId: new mongoose.Types.ObjectId(TENANT_ID),
        name: "Processing Admin",
        email: TEST_CONTEXT.actorEmail,
        passwordHash: "test-password-hash",
        role: TEST_CONTEXT.actorRole,
        status: "active",
        emailVerified: true,
        emailVerifiedAt: new Date(),
      },
    },
    { upsert: true },
  );
});

async function seedActiveSubscription() {
  const pkg = await PackageModel.create({
    code: `test-ocr-pkg-${new mongoose.Types.ObjectId().toString()}`,
    name: "Test OCR Package",
    description: "Test package for OCR quota tests",
    active: true,
    version: 1,
    monthlyPrice: 0,
    currency: "USD",
    entitlements: {
      employees: 10,
      admins: 2,
      documents: 1000,
      storageMb: 1024,
      fileSizeMb: 100,
      queriesPerMonth: 1000,
      tokensPerMonth: 100000,
      ocrPagesPerMonth: 100,
    },
    versions: [
      {
        version: 1,
        monthlyPrice: 0,
        entitlements: {
          employees: 10,
          admins: 2,
          documents: 1000,
          storageMb: 1024,
          fileSizeMb: 100,
          queriesPerMonth: 1000,
          tokensPerMonth: 100000,
          ocrPagesPerMonth: 100,
        },
        createdAt: new Date(),
      },
    ],
  });
  await SubscriptionModel.create({
    tenantId: new mongoose.Types.ObjectId(TENANT_ID),
    packageId: pkg._id,
    packageVersion: 1,
    status: "ACTIVE",
    paymentState: "paid",
    currentPeriodStart: new Date(),
    currentPeriodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    billingInterval: "monthly",
  });
  return pkg;
}

async function createTestDocument(
  version = 1,
  actions: DocumentAccessAction[] = ["read", "update", "reprocess"],
  options: {
    fileName?: string;
    checksum?: string;
    ownerId?: string;
    status?: "uploading" | "uploaded" | "processing" | "processed" | "failed" | "canceled";
    searchStatus?: "NOT_INDEXED" | "INDEXING" | "READY" | "FAILED" | "STALE";
    additionalPolicyRules?: Array<{
      ruleId: string;
      effect: "allow" | "deny";
      subject: { type: "tenant_member" | "department"; id?: string };
      actions: DocumentAccessAction[];
    }>;
  } = {},
) {
  const actorId = new mongoose.Types.ObjectId(ACTOR_ID);
  const ownerId = new mongoose.Types.ObjectId(options.ownerId ?? ACTOR_ID);
  const tenantIdObj = new mongoose.Types.ObjectId(TENANT_ID);
  const normalizedName = "internal";

  let classificationDoc = await DocumentClassificationModel.findOne({
    tenantId: TENANT_ID,
    normalizedName,
    status: "active",
  });
  if (!classificationDoc) {
    try {
      classificationDoc = await DocumentClassificationModel.create({
        tenantId: TENANT_ID,
        name: "Internal",
        normalizedName,
        level: "confidential" as const,
        description: "Internal classification",
        status: "active" as const,
        version: 1,
        createdBy: ACTOR_ID,
        updatedBy: ACTOR_ID,
      });
    } catch (error: unknown) {
      if (error && typeof error === "object" && "code" in error && (error as { code?: number }).code === 11000) {
        classificationDoc = await DocumentClassificationModel.findOne({
          tenantId: TENANT_ID,
          normalizedName,
          status: "active",
        });
        if (!classificationDoc) throw error;
      } else {
        throw error;
      }
    }
  }

  const policyId = new Types.ObjectId();
  const now = new Date();

  const doc = await DocumentModel.create({
    tenantId: tenantIdObj,
    fileName: options.fileName ?? "test-document.pdf",
    originalFileName: options.fileName ?? "test-document.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
    storageKey: "test-key",
    checksum: options.checksum ?? "test-checksum",
    status: options.status ?? "uploaded",
    metadata: { title: "Test Document", description: null, tags: [] },
    classification: "internal" as DocumentClassification,
    version,
    versionLabel: `v${version}`,
    uploadedBy: actorId,
    owner: ownerId,
    classificationId: classificationDoc._id,
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
    searchStatus: options.searchStatus ?? "READY",
  });

  await DocumentVersionModel.create({
    tenantId: tenantIdObj,
    documentId: doc._id,
    version,
    versionLabel: `v${version}`,
    fileName: options.fileName ?? "test-document.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
    checksum: options.checksum ?? "test-checksum",
    storageKey: "test-key-v" + version,
    uploadedBy: actorId,
    uploadReason: "initial",
  });

  await DocumentAccessPolicyModel.create({
    tenantId: TENANT_ID,
    documentId: doc._id,
    policyId,
    policyVersion: 1,
    contractVersion: 1,
    status: "active",
    effectiveFrom: now,
    effectiveUntil: null,
    inherits: null,
    rules: [
      {
        ruleId: "test-owner-rule",
        effect: "allow",
        subject: { type: "owner" },
        actions,
      },
      ...(options.additionalPolicyRules ?? []),
    ],
    provenance: {
      createdBy: ACTOR_ID,
      createdAt: now,
      reason: "Test fixture",
    },
    indexMetadata: {
      policyId,
      policyVersion: 1,
      classificationId: classificationDoc._id,
      categoryId: null,
      departmentId: null,
    },
    createdAt: now,
  });

  return doc;
}

async function seedOcrPages(documentId: string, pages: Array<{ pageNumber: number; text: string; confidence: number; status?: "pending" | "processing" | "completed" | "failed" | "retry" }>) {
  for (const page of pages) {
    const words = page.text.length > 0
      ? [{ text: page.text.slice(0, 20), confidence: page.confidence }]
      : [];
    await OcrPageResultModel.create({
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      documentId: new mongoose.Types.ObjectId(documentId),
      documentVersion: 1,
      pageNumber: page.pageNumber,
      text: page.text,
      confidence: page.confidence,
      words,
      language: "ar+en",
      provider: "fake-ocr",
      providerModel: "fake-ocr-v1.0.0",
      durationMs: 100,
      costUsd: 0,
      warnings: [],
      status: page.status || "completed",
      retryCount: 0,
    });
  }
}

test("processing.service", async (t) => {
  await t.test("getOcrPageResults returns pages for a document", async () => {
    const doc = await createTestDocument();
    const docId = doc._id.toString();
    await seedOcrPages(docId, [
      { pageNumber: 1, text: "Page one content", confidence: 0.95 },
      { pageNumber: 2, text: "Page two content", confidence: 0.88 },
    ]);

    const results = await getOcrPageResults(TENANT_ID, docId, 1, TEST_CONTEXT);
    assert.equal(results.length, 2);
    assert.equal(results[0].pageNumber, 1);
    assert.equal(results[0].text, "Page one content");
    assert.equal(results[1].pageNumber, 2);
    assert.equal(results[1].confidence, 0.88);
  });

  await t.test("getOcrPageResults returns empty array when no pages exist", async () => {
    const doc = await createTestDocument();
    const results = await getOcrPageResults(
      TENANT_ID,
      doc._id.toString(),
      1,
      TEST_CONTEXT,
    );
    assert.equal(results.length, 0);
  });

  await t.test("getDocumentQuality returns null when no quality record exists", async () => {
    const doc = await createTestDocument();
    const result = await getDocumentQuality(
      TENANT_ID,
      doc._id.toString(),
      1,
      TEST_CONTEXT,
    );
    assert.equal(result, null);
  });

  await t.test("assessDocumentQuality creates quality record from OCR pages", async () => {
    const doc = await createTestDocument();
    const docId = doc._id.toString();
    await seedOcrPages(docId, [
      { pageNumber: 1, text: "Good quality text content here", confidence: 0.95 },
      { pageNumber: 2, text: "Another page with good text", confidence: 0.92 },
    ]);

    const quality = await assessDocumentQuality(
      TENANT_ID,
      docId,
      1,
      TEST_CONTEXT,
    );
    assert.ok(quality);
    assert.equal(quality.documentId, docId);
    assert.equal(quality.documentVersion, 1);
    assert.ok(quality.overallConfidence > 0.8);
    assert.equal(quality.requiresReview, false);
    assert.ok(quality.summary.length > 0);
  });

  await t.test("assessDocumentQuality marks REVIEW_REQUIRED for low confidence", async () => {
    const doc = await createTestDocument();
    const docId = doc._id.toString();
    await seedOcrPages(docId, [
      { pageNumber: 1, text: "Very garbled text", confidence: 0.25 },
    ]);

    const quality = await assessDocumentQuality(
      TENANT_ID,
      docId,
      1,
      TEST_CONTEXT,
    );
    assert.equal(quality.qualityStatus, "REVIEW_REQUIRED");
    assert.equal(quality.requiresReview, true);
  });

  await t.test("reviewDocumentQuality approves a document", async () => {
    const doc = await createTestDocument();
    const docId = doc._id.toString();
    await seedOcrPages(docId, [
      { pageNumber: 1, text: "Page content", confidence: 0.3 },
    ]);
    await assessDocumentQuality(TENANT_ID, docId, 1, TEST_CONTEXT);

    const reviewed = await reviewDocumentQuality(TENANT_ID, docId, 1, {
      decision: "approved",
      notes: "Looks good after manual check",
    }, TEST_CONTEXT);

    assert.equal(reviewed.reviewDecision, "approved");
    assert.equal(reviewed.reviewedBy, ACTOR_ID);
    assert.equal(reviewed.reviewNotes, "Looks good after manual check");
    assert.equal(reviewed.qualityStatus, "READY_FOR_INDEXING");
    assert.equal(reviewed.requiresReview, false);
  });

  await t.test("reviewDocumentQuality rejects a document", async () => {
    const doc = await createTestDocument();
    const docId = doc._id.toString();
    await seedOcrPages(docId, [
      { pageNumber: 1, text: "Bad quality", confidence: 0.2 },
    ]);
    await assessDocumentQuality(TENANT_ID, docId, 1, TEST_CONTEXT);

    const reviewed = await reviewDocumentQuality(TENANT_ID, docId, 1, {
      decision: "rejected",
      notes: "Unreadable document",
    }, TEST_CONTEXT);

    assert.equal(reviewed.reviewDecision, "rejected");
    assert.equal(reviewed.qualityStatus, "REJECTED");
    assert.equal(reviewed.requiresReview, false);
  });

  await t.test("reviewDocumentQuality retry resets pages for retry", async () => {
    const doc = await createTestDocument();
    const docId = doc._id.toString();
    await seedOcrPages(docId, [
      { pageNumber: 1, text: "Bad", confidence: 0.2 },
      { pageNumber: 2, text: "Bad", confidence: 0.3 },
    ]);
    await assessDocumentQuality(TENANT_ID, docId, 1, TEST_CONTEXT);

    await reviewDocumentQuality(TENANT_ID, docId, 1, {
      decision: "retry",
      pageNumbers: [1],
    }, TEST_CONTEXT);

    const pages = await getOcrPageResults(TENANT_ID, docId, 1, TEST_CONTEXT);
    const page1 = pages.find((p) => p.pageNumber === 1);
    assert.equal(page1?.status, "retry");
  });

  await t.test("reviewDocumentQuality throws when no quality record exists", async () => {
    const doc = await createTestDocument();
    await assert.rejects(
      () => reviewDocumentQuality(TENANT_ID, doc._id.toString(), 1, { decision: "approved" }, TEST_CONTEXT),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, "REVIEW_NOT_FOUND");
        return true;
      },
    );
  });

  await t.test("retryOcrPages enqueues retry job for failed pages", async () => {
    const doc = await createTestDocument();
    const docId = doc._id.toString();
    await seedOcrPages(docId, [
      { pageNumber: 1, text: "", confidence: 0, status: "failed" },
      { pageNumber: 2, text: "Good content", confidence: 0.9, status: "completed" },
    ]);

    const queuedJobs: unknown[] = [];
    const dispatcher = {
      async enqueue(job: unknown) {
        queuedJobs.push(job);
        return {
          ok: true,
          jobId: "test-ocr-retry-job",
          idempotencyKey: (job as { idempotencyKey: string }).idempotencyKey,
        };
      },
    };

    const result = await retryOcrPages(
      TENANT_ID,
      docId,
      1,
      {},
      TEST_CONTEXT,
      dispatcher,
    );
    assert.ok(result.jobId);
    assert.ok(result.idempotencyKey);
    assert.ok(result.idempotencyKey.startsWith("ocr-retry-"));
    assert.equal(queuedJobs.length, 1);
    assert.deepEqual(
      (queuedJobs[0] as { payload: { pageNumbers: number[] } }).payload.pageNumbers,
      [1],
    );
  });

  await t.test("retryOcrPages throws when no pages are retryable", async () => {
    const doc = await createTestDocument();
    const docId = doc._id.toString();
    await seedOcrPages(docId, [
      { pageNumber: 1, text: "Good content", confidence: 0.9, status: "completed" },
    ]);

    await assert.rejects(
      () => retryOcrPages(TENANT_ID, docId, 1, {}, TEST_CONTEXT),
      (err: Error & { code?: string }) => {
        assert.equal(err.code, "NO_PAGES_TO_RETRY");
        return true;
      },
    );
  });

  await t.test("getOcrUsageSummary returns correct monthly usage", async () => {
    const now = new Date();
    const doc = await createTestDocument();
    const docId = doc._id.toString();

    for (let i = 0; i < 5; i++) {
      await OcrUsageRecordModel.create({
        tenantId: new mongoose.Types.ObjectId(TENANT_ID),
        documentId: new mongoose.Types.ObjectId(docId),
        documentVersion: 1,
        pageNumber: i + 1,
        provider: "fake-ocr",
        providerModel: "fake-ocr-v1.0.0",
        language: "ar+en",
        pagesProcessed: 1,
        durationMs: 100,
        costUsd: 0,
        createdAt: now,
      });
    }

    const summary = await getOcrUsageSummary(TENANT_ID, TEST_CONTEXT);
    assert.equal(summary.pagesUsed, 5);
    assert.ok(summary.periodStart);
    assert.ok(summary.periodEnd);
  });

  await t.test("getOcrUsageSummary returns zero when no usage", async () => {
    const summary = await getOcrUsageSummary(TENANT_ID, TEST_CONTEXT);
    assert.equal(summary.pagesUsed, 0);
  });

  await t.test("getOcrPageResults returns hidden DOCUMENT_NOT_FOUND for non-owner actor", async () => {
    const doc = await createTestDocument();
    const docId = doc._id.toString();
    await seedOcrPages(docId, [
      { pageNumber: 1, text: "Page content", confidence: 0.95 },
    ]);

    const nonOwnerContext = {
      tenantId: TENANT_ID,
      actorId: new mongoose.Types.ObjectId().toString(),
      actorEmail: "stranger@example.com",
      actorRole: "EMPLOYEE" as const,
    };
    await UserModel.create({
      _id: new mongoose.Types.ObjectId(nonOwnerContext.actorId),
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      name: "Stranger",
      email: nonOwnerContext.actorEmail,
      passwordHash: "test-hash",
      role: nonOwnerContext.actorRole,
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });

    await assert.rejects(
      () => getOcrPageResults(TENANT_ID, docId, 1, nonOwnerContext),
      (err: Error & { statusCode?: number; code?: string }) => {
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, "DOCUMENT_NOT_FOUND");
        return true;
      },
    );
  });

  await t.test("getOcrPageResults returns hidden DOCUMENT_NOT_FOUND for cross-tenant actor", async () => {
    const doc = await createTestDocument();
    const docId = doc._id.toString();
    await seedOcrPages(docId, [
      { pageNumber: 1, text: "Page content", confidence: 0.95 },
    ]);

    const crossTenantId = new mongoose.Types.ObjectId().toString();
    const crossTenantContext = {
      tenantId: crossTenantId,
      actorId: new mongoose.Types.ObjectId().toString(),
      actorEmail: "other@example.com",
      actorRole: "COMPANY_ADMIN" as const,
    };
    await TenantModel.create({
      _id: new mongoose.Types.ObjectId(crossTenantId),
      name: "Other Tenant",
      slug: "other-tenant",
      status: "active",
      plan: "free",
    });
    await UserModel.create({
      _id: new mongoose.Types.ObjectId(crossTenantContext.actorId),
      tenantId: new mongoose.Types.ObjectId(crossTenantId),
      name: "Other User",
      email: crossTenantContext.actorEmail,
      passwordHash: "test-hash",
      role: crossTenantContext.actorRole,
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });

    await assert.rejects(
      () => getOcrPageResults(TENANT_ID, docId, 1, crossTenantContext),
      (err: Error & { statusCode?: number; code?: string }) => {
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, "DOCUMENT_NOT_FOUND");
        return true;
      },
    );
  });

  await t.test("assessDocumentQuality returns hidden DOCUMENT_NOT_FOUND for non-owner actor", async () => {
    const doc = await createTestDocument();
    const docId = doc._id.toString();
    await seedOcrPages(docId, [
      { pageNumber: 1, text: "Good quality text", confidence: 0.95 },
    ]);

    const nonOwnerContext = {
      tenantId: TENANT_ID,
      actorId: new mongoose.Types.ObjectId().toString(),
      actorEmail: "stranger@example.com",
      actorRole: "EMPLOYEE" as const,
    };
    await UserModel.create({
      _id: new mongoose.Types.ObjectId(nonOwnerContext.actorId),
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      name: "Stranger",
      email: nonOwnerContext.actorEmail,
      passwordHash: "test-hash",
      role: nonOwnerContext.actorRole,
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });

    await assert.rejects(
      () => assessDocumentQuality(TENANT_ID, docId, 1, nonOwnerContext),
      (err: Error & { statusCode?: number; code?: string }) => {
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, "DOCUMENT_NOT_FOUND");
        return true;
      },
    );
  });

  await t.test("retryOcrPages returns hidden DOCUMENT_NOT_FOUND for non-owner actor", async () => {
    const doc = await createTestDocument();
    const docId = doc._id.toString();
    await seedOcrPages(docId, [
      { pageNumber: 1, text: "", confidence: 0, status: "failed" },
    ]);

    const nonOwnerContext = {
      tenantId: TENANT_ID,
      actorId: new mongoose.Types.ObjectId().toString(),
      actorEmail: "stranger@example.com",
      actorRole: "EMPLOYEE" as const,
    };
    await UserModel.create({
      _id: new mongoose.Types.ObjectId(nonOwnerContext.actorId),
      tenantId: new mongoose.Types.ObjectId(TENANT_ID),
      name: "Stranger",
      email: nonOwnerContext.actorEmail,
      passwordHash: "test-hash",
      role: nonOwnerContext.actorRole,
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });

    await assert.rejects(
      () => retryOcrPages(TENANT_ID, docId, 1, {}, nonOwnerContext),
      (err: Error & { statusCode?: number; code?: string }) => {
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, "DOCUMENT_NOT_FOUND");
        return true;
      },
    );
  });

  await t.test("retryOcrPages returns hidden DOCUMENT_NOT_FOUND for cross-tenant actor", async () => {
    const doc = await createTestDocument();
    const docId = doc._id.toString();
    await seedOcrPages(docId, [
      { pageNumber: 1, text: "", confidence: 0, status: "failed" },
    ]);

    const crossTenantId = new mongoose.Types.ObjectId().toString();
    const crossTenantContext = {
      tenantId: crossTenantId,
      actorId: new mongoose.Types.ObjectId().toString(),
      actorEmail: "other@example.com",
      actorRole: "COMPANY_ADMIN" as const,
    };
    await TenantModel.create({
      _id: new mongoose.Types.ObjectId(crossTenantId),
      name: "Other Tenant",
      slug: "other-tenant",
      status: "active",
      plan: "free",
    });
    await UserModel.create({
      _id: new mongoose.Types.ObjectId(crossTenantContext.actorId),
      tenantId: new mongoose.Types.ObjectId(crossTenantId),
      name: "Other User",
      email: crossTenantContext.actorEmail,
      passwordHash: "test-hash",
      role: crossTenantContext.actorRole,
      status: "active",
      emailVerified: true,
      emailVerifiedAt: new Date(),
    });

    await assert.rejects(
      () => retryOcrPages(crossTenantId, docId, 1, {}, crossTenantContext),
      (err: Error & { statusCode?: number; code?: string }) => {
        assert.equal(err.statusCode, 404);
        assert.equal(err.code, "DOCUMENT_NOT_FOUND");
        return true;
      },
    );
  });

  await t.test(
    "checkOcrPageQuota allows page counts within the monthly quota",
    async () => {
      await seedActiveSubscription();
      await assert.doesNotReject(checkOcrPageQuota(TENANT_ID, 10));
    },
  );

  await t.test(
    "triggerOcrProcessing rejects with 429 OCR_QUOTA_EXCEEDED when the page count exceeds the monthly quota",
    async () => {
      await seedActiveSubscription();
      const doc = await createTestDocument();
      const docId = doc._id.toString();

      await assert.rejects(
        () =>
          triggerOcrProcessing(
            TENANT_ID,
            {
              documentId: docId,
              pageNumbers: Array.from({ length: 150 }, (_, i) => i + 1),
            },
            TEST_CONTEXT,
          ),
        (err: Error & { statusCode?: number; code?: string; message: string }) => {
          assert.equal(err.statusCode, 429);
          assert.equal(err.code, "OCR_QUOTA_EXCEEDED");
          assert.equal(
            err.message,
            "OCR quota exceeded. Used 0 of 100 pages this month. Requested 150, only 100 remaining.",
          );
          return true;
        },
      );
    },
  );
});

function recordingConflictAgent(inputs: DocumentComparisonInput[]): VersionConflictAgent {
  return {
    async analyzeDocument(input) {
      inputs.push(input);
      return {
        relationships: [],
        conflicts: [],
        summary: `Analyzed ${input.candidateDocuments.length} authorized candidates.`,
        overallConfidence: 1,
        requiresReview: false,
      };
    },
  };
}

test("version-conflict analysis excludes unauthorized explicit candidates before agent input", async () => {
  const source = await createTestDocument(1, ["read", "reprocess"], {
    fileName: "source-explicit.pdf",
    checksum: "source-explicit-checksum",
    status: "processed",
  });
  const authorized = await createTestDocument(1, ["use_in_ai"], {
    fileName: "authorized-candidate.pdf",
    checksum: "authorized-candidate-checksum",
    status: "processed",
  });
  const missingAiGrant = await createTestDocument(1, ["read"], {
    fileName: "restricted-candidate.pdf",
    checksum: "restricted-candidate-checksum",
    status: "processed",
  });
  const explicitDeny = await createTestDocument(1, ["use_in_ai"], {
    fileName: "explicit-deny-candidate.pdf",
    checksum: "explicit-deny-checksum",
    status: "processed",
    additionalPolicyRules: [{
      ruleId: "deny-ai",
      effect: "deny",
      subject: { type: "tenant_member" },
      actions: ["use_in_ai"],
    }],
  });
  const departmentScoped = await createTestDocument(1, ["read"], {
    fileName: "department-scoped-candidate.pdf",
    checksum: "department-scoped-checksum",
    status: "processed",
    additionalPolicyRules: [{
      ruleId: "other-department-ai",
      effect: "allow",
      subject: { type: "department", id: new Types.ObjectId().toString() },
      actions: ["use_in_ai"],
    }],
  });
  const crossTenant = await createTestDocument(1, ["use_in_ai"], {
    fileName: "cross-tenant-candidate.pdf",
    checksum: "cross-tenant-checksum",
    status: "processed",
  });
  await DocumentModel.updateOne(
    { _id: crossTenant._id },
    { $set: { tenantId: new Types.ObjectId() } },
  );

  await seedOcrPages(source.id, [{ pageNumber: 1, text: "source public text", confidence: 0.99 }]);
  await seedOcrPages(authorized.id, [{ pageNumber: 1, text: "authorized candidate text", confidence: 0.99 }]);
  await seedOcrPages(missingAiGrant.id, [{ pageNumber: 1, text: "RESTRICTED OCR SECRET", confidence: 0.99 }]);
  await seedOcrPages(explicitDeny.id, [{ pageNumber: 1, text: "EXPLICIT DENY SECRET", confidence: 0.99 }]);
  await seedOcrPages(departmentScoped.id, [{ pageNumber: 1, text: "DEPARTMENT SECRET", confidence: 0.99 }]);

  const agentInputs: DocumentComparisonInput[] = [];
  const result = await triggerVersionConflictAnalysis(
    TENANT_ID,
    {
      documentId: source.id,
      candidateDocumentIds: [
        missingAiGrant.id,
        authorized.id,
        explicitDeny.id,
        departmentScoped.id,
        crossTenant.id,
      ],
    },
    TEST_CONTEXT,
    recordingConflictAgent(agentInputs),
  );

  assert.equal(result.summary, "Analyzed 1 authorized candidates.");
  assert.equal(agentInputs.length, 1);
  assert.deepEqual(agentInputs[0]?.candidateDocuments.map((candidate) => candidate.id), [authorized.id]);
  const serializedInput = JSON.stringify(agentInputs[0]);
  assert.equal(serializedInput.includes("RESTRICTED OCR SECRET"), false);
  assert.equal(serializedInput.includes("EXPLICIT DENY SECRET"), false);
  assert.equal(serializedInput.includes("DEPARTMENT SECRET"), false);
  assert.equal(serializedInput.includes("restricted-candidate.pdf"), false);
});

test("version-conflict automatic discovery filters restricted candidates before agent input", async () => {
  const sharedChecksum = "automatic-discovery-checksum";
  const source = await createTestDocument(1, ["read", "reprocess"], {
    fileName: "automatic-source.pdf",
    checksum: sharedChecksum,
    status: "processed",
  });
  const authorized = await createTestDocument(1, ["use_in_ai"], {
    fileName: "automatic-authorized.pdf",
    checksum: sharedChecksum,
    status: "processed",
  });
  const restricted = await createTestDocument(1, ["read"], {
    fileName: "automatic-restricted.pdf",
    checksum: sharedChecksum,
    status: "processed",
  });
  await seedOcrPages(restricted.id, [{ pageNumber: 1, text: "AUTO DISCOVERY SECRET", confidence: 0.99 }]);

  const agentInputs: DocumentComparisonInput[] = [];
  await triggerVersionConflictAnalysis(
    TENANT_ID,
    { documentId: source.id },
    TEST_CONTEXT,
    recordingConflictAgent(agentInputs),
  );

  assert.equal(agentInputs.length, 1);
  assert.deepEqual(agentInputs[0]?.candidateDocuments.map((candidate) => candidate.id), [authorized.id]);
  assert.equal(JSON.stringify(agentInputs[0]).includes("AUTO DISCOVERY SECRET"), false);
});

test("version-conflict analysis still produces relationships for an authorized candidate", async () => {
  const sharedChecksum = "authorized-version-checksum";
  const source = await createTestDocument(1, ["read", "reprocess"], {
    fileName: "authorized-source.pdf",
    checksum: sharedChecksum,
    status: "processed",
  });
  const candidate = await createTestDocument(1, ["use_in_ai"], {
    fileName: "authorized-target.pdf",
    checksum: sharedChecksum,
    status: "processed",
  });

  const result = await triggerVersionConflictAnalysis(
    TENANT_ID,
    { documentId: source.id, candidateDocumentIds: [candidate.id] },
    TEST_CONTEXT,
  );

  assert.ok(result.relationships.some((relationship) =>
    relationship.targetDocumentId === candidate.id &&
    relationship.relationshipType === "DUPLICATE_OF"));
});
