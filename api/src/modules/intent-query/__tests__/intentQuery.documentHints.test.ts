import test, { before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import TenantModel from "../../../db/models/tenant.model.js";
import UserModel from "../../../db/models/user.model.js";
import DocumentModel from "../../../db/models/document.model.js";
import DocumentClassificationModel from "../../../db/models/documentClassification.model.js";
import DocumentAccessPolicyModel from "../../../db/models/documentAccessPolicy.model.js";
import { hashPassword } from "../../auth/passwordHashing.js";
import { disconnectRedis } from "../../../db/redis.js";
import {
  extractNaturalDocumentTitleHints,
  resolveAuthorizedDocumentHints,
} from "../intentQuery.documentHints.js";

test("extractNaturalDocumentTitleHints only extracts explicit document references", () => {
  assert.deepEqual(
    extractNaturalDocumentTitleHints("summarize the network security guide file in 5 lines"),
    ["network security guide file"],
  );
  assert.deepEqual(
    extractNaturalDocumentTitleHints("What cloud tools are listed in the SecurityManual.pdf?"),
    ["SecurityManual.pdf"],
  );
  assert.deepEqual(extractNaturalDocumentTitleHints("لخص ملف handbook.pdf"), ["ملف handbook.pdf"]);
  assert.deepEqual(extractNaturalDocumentTitleHints("how i can install snort"), []);
});

test("extractNaturalDocumentTitleHints handles polite modal wrappers around summarize", () => {
  assert.deepEqual(
    extractNaturalDocumentTitleHints("can you summarize the remote work file?"),
    ["remote work file"],
  );
  assert.deepEqual(
    extractNaturalDocumentTitleHints("could you summarize the remote work file?"),
    ["remote work file"],
  );
  assert.deepEqual(
    extractNaturalDocumentTitleHints("would you summarize the remote work file?"),
    ["remote work file"],
  );
  assert.deepEqual(
    extractNaturalDocumentTitleHints("please summarize the remote work file"),
    ["remote work file"],
  );
  assert.deepEqual(
    extractNaturalDocumentTitleHints("please can you summarize the remote work file?"),
    ["remote work file"],
  );
  assert.deepEqual(
    extractNaturalDocumentTitleHints("summarize the network security guide file in 5 lines"),
    ["network security guide file"],
  );
  assert.deepEqual(
    extractNaturalDocumentTitleHints("can you give me a summary of the policy document?"),
    ["policy document"],
  );
});

let mongoServer: MongoMemoryReplSet | null = null;
const TEST_PASSWORD = "StrongPass123!";

before(async () => {
  if (process.env.MONGODB_URI) {
    await mongoose.connect(process.env.MONGODB_URI, { dbName: "intent-query-doc-hints-test" });
  } else {
    mongoServer = await MongoMemoryReplSet.create({
      binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
      replSet: { count: 1 },
      instanceOpts: [
        { launchTimeout: Number(process.env.MONGOMS_LAUNCH_TIMEOUT_MS ?? 60_000) },
      ],
    });
    await mongoose.connect(mongoServer.getUri(), { dbName: "intent-query-doc-hints-test" });
  }
});

after(async () => {
  await disconnectRedis();
  await mongoose.disconnect();
  if (mongoServer) await mongoServer.stop();
});

let tenantId: string;
let actorId: string;
let otherTenantId: string;
let otherActorId: string;

async function seedClassification(forTenantId: string, userId: string) {
  const normalizedName = "internal";
  let classificationDoc = await DocumentClassificationModel.findOne({
    tenantId: forTenantId,
    normalizedName,
    status: "active",
  });
  if (!classificationDoc) {
    classificationDoc = await DocumentClassificationModel.create({
      tenantId: forTenantId,
      name: "Internal",
      normalizedName,
      level: "confidential" as const,
      description: "Internal classification",
      status: "active" as const,
      version: 1,
      createdBy: userId,
      updatedBy: userId,
    });
  }
  return classificationDoc;
}

async function createDoc(options: {
  tenantId: string;
  ownerId: string;
  fileName: string;
  title?: string | null;
  withPolicy?: boolean;
  status?: "uploaded" | "processed" | "failed" | "canceled";
  isArchived?: boolean;
  deletedAt?: Date | null;
}) {
  const withPolicy = options.withPolicy ?? true;
  const classificationDoc = await seedClassification(options.tenantId, options.ownerId);
  const policyId = new Types.ObjectId();
  const now = new Date();

  const doc = await DocumentModel.create({
    tenantId: options.tenantId,
    fileName: options.fileName,
    originalFileName: options.fileName,
    fileSize: 1024,
    mimeType: "application/pdf",
    storageKey: `${options.tenantId}/${options.fileName}`,
    checksum: `cs-${options.fileName}`,
    status: (options.status ?? "uploaded") as "uploaded" | "processed" | "failed" | "canceled",
    metadata: { title: options.title ?? null, description: null, tags: [] },
    classification: "internal" as const,
    version: 1,
    versionLabel: "v1",
    uploadedBy: options.ownerId,
    owner: options.ownerId,
    classificationId: classificationDoc._id,
    activePolicyId: withPolicy ? policyId : null,
    activePolicyVersion: withPolicy ? 1 : null,
    policyChangedAt: now,
    isArchived: options.isArchived ?? false,
    archivedAt: options.isArchived ? now : null,
    archivedBy: null,
    deletedAt: options.deletedAt ?? null,
    deletedBy: null,
    quarantineStatus: "none" as const,
    scanResult: null,
    category: null,
    department: null,
    effectiveDate: null,
    expiryDate: null,
  });

  if (withPolicy) {
    await DocumentAccessPolicyModel.create({
      tenantId: options.tenantId,
      documentId: doc._id,
      policyId,
      policyVersion: 1,
      contractVersion: 1,
      status: "active",
      effectiveFrom: now,
      effectiveUntil: null,
      inherits: null,
      rules: [{
        ruleId: "test-owner-rule",
        effect: "allow",
        subject: { type: "owner" },
        actions: ["discover", "read", "download", "use_in_ai"],
      }],
      provenance: { createdBy: options.ownerId, createdAt: now, reason: "Test fixture" },
      indexMetadata: {
        policyId,
        policyVersion: 1,
        classificationId: classificationDoc._id,
        categoryId: null,
        departmentId: null,
      },
      createdAt: now,
    });
  }

  return doc;
}

function hintContext() {
  return {
    tenantId,
    actorId,
    tenantObjectId: new mongoose.Types.ObjectId(tenantId),
  };
}

beforeEach(async () => {
  await TenantModel.deleteMany({});
  await UserModel.deleteMany({});
  await DocumentModel.deleteMany({});
  await DocumentClassificationModel.deleteMany({});
  await DocumentAccessPolicyModel.deleteMany({});

  const tenant = await TenantModel.create({ name: "Hint Corp", slug: "hint-corp", status: "active", plan: "free" });
  tenantId = tenant.id;
  const user = await UserModel.create({
    tenantId: tenant.id,
    name: "Admin User",
    email: "admin@hint.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  actorId = user.id;

  const otherTenant = await TenantModel.create({ name: "Other Corp", slug: "other-corp", status: "active", plan: "free" });
  otherTenantId = otherTenant.id;
  const otherUser = await UserModel.create({
    tenantId: otherTenant.id,
    name: "Other Admin",
    email: "admin@other-hint.com",
    passwordHash: await hashPassword(TEST_PASSWORD),
    role: "COMPANY_ADMIN",
    status: "active",
    emailVerified: true,
    emailVerifiedAt: new Date(),
  });
  otherActorId = otherUser.id;
});

test("resolveAuthorizedDocumentHints resolves titles in hint order", async () => {
  const first = await createDoc({ tenantId, ownerId: actorId, fileName: "first.pdf", title: "First Policy" });
  const second = await createDoc({ tenantId, ownerId: actorId, fileName: "second.pdf", title: "Second Policy" });

  const result = await resolveAuthorizedDocumentHints([first.id, second.id], hintContext());

  assert.deepEqual(result.referencedDocumentIds, [first.id, second.id]);
  assert.deepEqual(result.referencedDocumentTitles, ["First Policy", "Second Policy"]);
});

test("title falls back to fileName when metadata.title is blank", async () => {
  const titled = await createDoc({ tenantId, ownerId: actorId, fileName: "titled.pdf", title: "   " });
  const noTitle = await createDoc({ tenantId, ownerId: actorId, fileName: "plain.pdf", title: null });

  const result = await resolveAuthorizedDocumentHints([titled.id, noTitle.id], hintContext());

  assert.equal(result.referencedDocumentTitles[0], "titled.pdf");
  assert.equal(result.referencedDocumentTitles[1], "plain.pdf");
});

test("malformed and duplicate ids are ignored", async () => {
  const doc = await createDoc({ tenantId, ownerId: actorId, fileName: "valid.pdf", title: "Valid" });

  const result = await resolveAuthorizedDocumentHints(
    ["not-an-object-id", "12345", doc.id, doc.id, "zzz"],
    hintContext(),
  );

  assert.deepEqual(result.referencedDocumentIds, [doc.id]);
  assert.deepEqual(result.referencedDocumentTitles, ["Valid"]);
});

test("documents from another tenant are never exposed", async () => {
  const foreign = await createDoc({ tenantId: otherTenantId, ownerId: otherActorId, fileName: "foreign.pdf", title: "Foreign Title" });

  const result = await resolveAuthorizedDocumentHints([foreign.id], hintContext());

  assert.deepEqual(result, {
    referencedDocumentIds: [],
    referencedDocumentTitles: [],
    ambiguousTitleMatches: false,
    unresolvedTitleHints: [],
  });
});

test("documents without a use_in_ai grant are silently dropped without titles", async () => {
  const noPolicy = await createDoc({ tenantId, ownerId: actorId, fileName: "no-policy.pdf", title: "Secret Title", withPolicy: false });

  const result = await resolveAuthorizedDocumentHints([noPolicy.id], hintContext());

  assert.deepEqual(result, {
    referencedDocumentIds: [],
    referencedDocumentTitles: [],
    ambiguousTitleMatches: false,
    unresolvedTitleHints: [],
  });
});

test("empty or all-invalid input returns empty resolution without touching the db", async () => {
  assert.deepEqual(await resolveAuthorizedDocumentHints([], hintContext()), {
    referencedDocumentIds: [],
    referencedDocumentTitles: [],
    ambiguousTitleMatches: false,
    unresolvedTitleHints: [],
  });
  assert.deepEqual(await resolveAuthorizedDocumentHints(["nonsense"], hintContext()), {
    referencedDocumentIds: [],
    referencedDocumentTitles: [],
    ambiguousTitleMatches: false,
    unresolvedTitleHints: [],
  });
});

test("title hints resolve by exact normalized metadata.title", async () => {
  const doc = await createDoc({ tenantId, ownerId: actorId, fileName: "handbook.pdf", title: "Employee Handbook" });

  const result = await resolveAuthorizedDocumentHints([], hintContext(), ["employee handbook"]);

  assert.deepEqual(result.referencedDocumentIds, [doc.id]);
  assert.deepEqual(result.referencedDocumentTitles, ["Employee Handbook"]);
  assert.equal(result.ambiguousTitleMatches, false);
  assert.deepEqual(result.unresolvedTitleHints, []);
});

test("natural file wrappers resolve one clear authorized title", async () => {
  const doc = await createDoc({
    tenantId,
    ownerId: actorId,
    fileName: "network-security.pdf",
    title: "Network Security Guide",
  });

  const result = await resolveAuthorizedDocumentHints(
    [],
    hintContext(),
    ["the network security guide file"],
  );

  assert.deepEqual(result.referencedDocumentIds, [doc.id]);
  assert.deepEqual(result.referencedDocumentTitles, ["Network Security Guide"]);
  assert.deepEqual(result.unresolvedTitleHints, []);
  assert.equal(result.ambiguousTitleMatches, false);
});

test("filename extensions and safe spacing differences resolve when unique", async () => {
  const doc = await createDoc({
    tenantId,
    ownerId: actorId,
    fileName: "SecurityManual.pdf",
    title: "Security Manual",
  });

  const extensionResult = await resolveAuthorizedDocumentHints(
    [],
    hintContext(),
    ["security manual pdf"],
  );
  const filenameResult = await resolveAuthorizedDocumentHints(
    [],
    hintContext(),
    ["SecurityManual"],
  );

  assert.deepEqual(extensionResult.referencedDocumentIds, [doc.id]);
  assert.deepEqual(filenameResult.referencedDocumentIds, [doc.id]);
});

test("exact matches outrank wrapper-normalized alternatives", async () => {
  const exact = await createDoc({
    tenantId,
    ownerId: actorId,
    fileName: "quarterly-presentation.pdf",
    title: "Quarterly Presentation",
  });
  await createDoc({
    tenantId,
    ownerId: actorId,
    fileName: "quarterly.pdf",
    title: "Quarterly",
  });

  const result = await resolveAuthorizedDocumentHints(
    [],
    hintContext(),
    ["Quarterly Presentation"],
  );

  assert.deepEqual(result.referencedDocumentIds, [exact.id]);
  assert.equal(result.ambiguousTitleMatches, false);
});

test("wrapper normalization preserves genuine ambiguity", async () => {
  await createDoc({ tenantId, ownerId: actorId, fileName: "one.pdf", title: "Operations Guide" });
  await createDoc({ tenantId, ownerId: actorId, fileName: "two.pdf", title: "Operations Guide" });

  const result = await resolveAuthorizedDocumentHints(
    [],
    hintContext(),
    ["the operations guide document"],
  );

  assert.deepEqual(result.referencedDocumentIds, []);
  assert.equal(result.ambiguousTitleMatches, true);
});

test("wrapper normalization never exposes cross-tenant or unauthorized matches", async () => {
  await createDoc({
    tenantId: otherTenantId,
    ownerId: otherActorId,
    fileName: "foreign-guide.pdf",
    title: "Foreign Guide",
  });
  await createDoc({
    tenantId,
    ownerId: actorId,
    fileName: "private-guide.pdf",
    title: "Private Guide",
    withPolicy: false,
  });

  const foreign = await resolveAuthorizedDocumentHints([], hintContext(), ["the foreign guide file"]);
  const unauthorized = await resolveAuthorizedDocumentHints([], hintContext(), ["private guide document"]);

  assert.deepEqual(foreign.referencedDocumentIds, []);
  assert.deepEqual(foreign.unresolvedTitleHints, ["the foreign guide file"]);
  assert.deepEqual(unauthorized.referencedDocumentIds, []);
  assert.deepEqual(unauthorized.unresolvedTitleHints, ["private guide document"]);
});

test("title hints resolve by fileName when no metadata.title exists", async () => {
  const doc = await createDoc({ tenantId, ownerId: actorId, fileName: "leave-policy-2026.pdf", title: null });

  const result = await resolveAuthorizedDocumentHints([], hintContext(), ["LEAVE-POLICY-2026.PDF"]);

  assert.deepEqual(result.referencedDocumentIds, [doc.id]);
  assert.deepEqual(result.referencedDocumentTitles, ["leave-policy-2026.pdf"]);
});

test("Arabic title hints match after alif/hamza normalization", async () => {
  const doc = await createDoc({ tenantId, ownerId: actorId, fileName: "policy.pdf", title: "سياسة الإجازات" });

  const result = await resolveAuthorizedDocumentHints([], hintContext(), ["سياسة الاجازات"]);

  assert.deepEqual(result.referencedDocumentIds, [doc.id]);
  assert.deepEqual(result.referencedDocumentTitles, ["سياسة الإجازات"]);
});

test("title hints preserve hint order", async () => {
  const first = await createDoc({ tenantId, ownerId: actorId, fileName: "a.pdf", title: "Alpha Policy" });
  const second = await createDoc({ tenantId, ownerId: actorId, fileName: "b.pdf", title: "Beta Policy" });

  const result = await resolveAuthorizedDocumentHints([], hintContext(), ["Beta Policy", "Alpha Policy"]);

  assert.deepEqual(result.referencedDocumentIds, [second.id, first.id]);
  assert.deepEqual(result.referencedDocumentTitles, ["Beta Policy", "Alpha Policy"]);
});

test("multiple authorized title matches are flagged ambiguous", async () => {
  await createDoc({ tenantId, ownerId: actorId, fileName: "one.pdf", title: "Shared Title" });
  await createDoc({ tenantId, ownerId: actorId, fileName: "two.pdf", title: "Shared Title" });

  const result = await resolveAuthorizedDocumentHints([], hintContext(), ["Shared Title"]);

  assert.deepEqual(result.referencedDocumentIds, []);
  assert.equal(result.ambiguousTitleMatches, true);
});

test("title hints with no matching authorized document are reported unresolved", async () => {
  const result = await resolveAuthorizedDocumentHints([], hintContext(), ["Nonexistent Document"]);

  assert.deepEqual(result.referencedDocumentIds, []);
  assert.deepEqual(result.unresolvedTitleHints, ["Nonexistent Document"]);
  assert.equal(result.ambiguousTitleMatches, false);
});

test("title hints never resolve cross-tenant documents", async () => {
  const foreign = await createDoc({ tenantId: otherTenantId, ownerId: otherActorId, fileName: "foreign.pdf", title: "Foreign Secret" });

  const result = await resolveAuthorizedDocumentHints([], hintContext(), ["Foreign Secret"]);
  const resolvedIds = result.referencedDocumentIds;
  const unresolved = result.unresolvedTitleHints;

  assert.ok(!resolvedIds.includes(foreign.id));
  assert.deepEqual(resolvedIds, []);
  assert.deepEqual(unresolved, ["Foreign Secret"]);
});

test("title hints never resolve documents without use_in_ai", async () => {
  await createDoc({ tenantId, ownerId: actorId, fileName: "no-policy.pdf", title: "Secret Title", withPolicy: false });

  const result = await resolveAuthorizedDocumentHints([], hintContext(), ["Secret Title"]);

  assert.deepEqual(result.referencedDocumentIds, []);
  assert.deepEqual(result.unresolvedTitleHints, ["Secret Title"]);
});

test("title hints never resolve archived, deleted, or failed documents", async () => {
  await createDoc({ tenantId, ownerId: actorId, fileName: "archived.pdf", title: "Archived Policy", isArchived: true });
  await createDoc({ tenantId, ownerId: actorId, fileName: "deleted.pdf", title: "Deleted Policy", deletedAt: new Date() });
  await createDoc({ tenantId, ownerId: actorId, fileName: "failed.pdf", title: "Failed Policy", status: "failed" });

  const result = await resolveAuthorizedDocumentHints([], hintContext(), ["Archived Policy", "Deleted Policy", "Failed Policy"]);

  assert.deepEqual(result.referencedDocumentIds, []);
  assert.equal(result.ambiguousTitleMatches, false);
  assert.equal(result.unresolvedTitleHints.length, 3);
});

test("a resolved ID hint plus title hint deduplicates the same document", async () => {
  const doc = await createDoc({ tenantId, ownerId: actorId, fileName: "handbook.pdf", title: "Employee Handbook" });

  const result = await resolveAuthorizedDocumentHints([doc.id], hintContext(), ["Employee Handbook"]);

  assert.deepEqual(result.referencedDocumentIds, [doc.id]);
  assert.deepEqual(result.referencedDocumentTitles, ["Employee Handbook"]);
  assert.deepEqual(result.unresolvedTitleHints, []);
  assert.equal(result.ambiguousTitleMatches, false);
});

test("title hint ambiguity never fabricates an arbitrary match", async () => {
  await createDoc({ tenantId, ownerId: actorId, fileName: "one.pdf", title: "Duplicate Name" });
  await createDoc({ tenantId, ownerId: actorId, fileName: "two.pdf", title: "Duplicate Name" });

  const result = await resolveAuthorizedDocumentHints([], hintContext(), ["duplicate name"]);

  assert.equal(result.ambiguousTitleMatches, true);
  assert.equal(result.referencedDocumentIds.length, 0);
  assert.equal(result.referencedDocumentTitles.length, 0);
});
