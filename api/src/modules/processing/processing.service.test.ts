import test, { after, afterEach, before, beforeEach } from "node:test";
import assert from "node:assert";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import DocumentModel from "../../db/models/document.model.js";
import DocumentVersionModel from "../../db/models/documentVersion.model.js";
import OcrPageResultModel from "../../db/models/ocrPageResult.model.js";
import DocumentQualityModel from "../../db/models/documentQuality.model.js";
import OcrUsageRecordModel from "../../db/models/ocrUsageRecord.model.js";
import TenantModel from "../../db/models/tenant.model.js";
import UserModel from "../../db/models/user.model.js";
import {
  getOcrPageResults,
  getDocumentQuality,
  assessDocumentQuality,
  reviewDocumentQuality,
  retryOcrPages,
  getOcrUsageSummary,
} from "./processing.service.js";
import { closeApiJobDispatcher } from "../jobs/jobDispatcher.js";
import { disconnectRedis } from "../../db/redis.js";

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
  await closeApiJobDispatcher();
  await disconnectRedis();
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

async function createTestDocument(version = 1) {
  const actorId = new mongoose.Types.ObjectId(ACTOR_ID);
  const tenantId = new mongoose.Types.ObjectId(TENANT_ID);

  const doc = await DocumentModel.create({
    tenantId,
    fileName: "test-document.pdf",
    originalFileName: "test-document.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
    storageKey: "test-key",
    checksum: "test-checksum",
    version,
    uploadedBy: actorId,
  });

  await DocumentVersionModel.create({
    tenantId,
    documentId: doc._id,
    version,
    versionLabel: `v${version}`,
    fileName: "test-document.pdf",
    fileSize: 1024,
    mimeType: "application/pdf",
    checksum: "test-checksum",
    storageKey: "test-key-v" + version,
    uploadedBy: actorId,
    uploadReason: "initial",
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

  await t.test("retryOcrPages enqueues retry job for failed pages", { skip: !process.env.REDIS_URL }, async () => {
    const doc = await createTestDocument();
    const docId = doc._id.toString();
    await seedOcrPages(docId, [
      { pageNumber: 1, text: "", confidence: 0, status: "failed" },
      { pageNumber: 2, text: "Good content", confidence: 0.9, status: "completed" },
    ]);

    const result = await retryOcrPages(TENANT_ID, docId, 1, {}, TEST_CONTEXT);
    assert.ok(result.jobId);
    assert.ok(result.idempotencyKey);
    assert.ok(result.idempotencyKey.startsWith("ocr-retry-"));
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
});
