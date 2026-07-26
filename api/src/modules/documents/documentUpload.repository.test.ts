import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import DocumentAccessPolicyModel from "../../db/models/documentAccessPolicy.model.js";
import UserModel from "../../db/models/user.model.js";
import type { DocumentDocument } from "../../db/models/document.model.js";
import type { DocumentVersionDocument } from "../../db/models/documentVersion.model.js";
import { createDocumentWithPrivatePolicy } from "./documentUpload.repository.js";

let mongo: MongoMemoryReplSet | null = null;
let blocked: string | null = null;
before(async () => { try { mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } }); await mongoose.connect(mongo.getUri()); }
  catch { blocked = "replica-set listener unavailable"; } });
after(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });

test("upload commits Restricted document, version, private policy, and pointer atomically", async (context) => {
  if (blocked) { context.skip(blocked); return; }
  const tenantId = new mongoose.Types.ObjectId();
  const user = await UserModel.create({ tenantId, name: "Uploader", email: "uploader@example.test", passwordHash: "hash", role: "COMPANY_ADMIN", status: "active", emailVerified: true });
  const document = await createDocumentWithPrivatePolicy({ tenantId, fileName: "private.pdf", originalFileName: "private.pdf", fileSize: 1,
    mimeType: "application/pdf", storageKey: "private", checksum: "checksum", status: "uploaded", metadata: { title: null, description: null, tags: [] },
    category: null, department: null, classification: "restricted", owner: user._id, effectiveDate: null, expiryDate: null, version: 1, versionLabel: "v1",
    isArchived: false, archivedAt: null, archivedBy: null, deletedAt: null, deletedBy: null, quarantineStatus: "none", scanResult: null, uploadedBy: user._id,
  } as unknown as Omit<DocumentDocument, "_id" | "createdAt" | "updatedAt">, { tenantId, version: 1, versionLabel: "v1", fileName: "private.pdf", fileSize: 1,
    mimeType: "application/pdf", checksum: "checksum", storageKey: "private", uploadedBy: user._id, uploadReason: "initial", changeDescription: null,
  } as Omit<DocumentVersionDocument, "_id" | "documentId" | "createdAt">);
  assert.equal(document.classification, "restricted"); assert.ok(document.classificationId && document.activePolicyId); assert.equal(document.activePolicyVersion, 1);
  const policy = await DocumentAccessPolicyModel.findOne({ tenantId, documentId: document._id }).lean().exec();
  assert.deepEqual(policy?.rules, [{ ruleId: "default-owner-minimum", effect: "allow", subject: { type: "owner" }, actions: ["discover", "read", "download"] }]);
});
