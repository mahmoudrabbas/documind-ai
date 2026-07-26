import assert from "node:assert/strict";
import test, { after, before } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import DocumentAccessPolicyModel from "../db/models/documentAccessPolicy.model.js";
import DocumentModel from "../db/models/document.model.js";
import UserModel from "../db/models/user.model.js";
import { MongoDocumentPolicyBackfillPersistence } from "./document-policy-backfill.mongo.js";
import { planDocumentBackfill } from "./document-policy-backfill.planner.js";

let mongo: MongoMemoryReplSet | null = null;
let startupError: string | null = null;
before(async () => {
  try {
    mongo = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
    await mongoose.connect(mongo.getUri());
  } catch (error) {
    startupError = error && typeof error === "object" && "code" in error && error.code === "EPERM"
      ? "sandbox does not permit a replica-set listener" : "replica set did not start";
  }
});
after(async () => { await mongoose.disconnect(); if (mongo) await mongo.stop(); });

test("owner, references, immutable policy, and pointer commit together and retry skips", async (context) => {
  if (startupError) { context.skip(startupError); return; }
  const tenantId = new mongoose.Types.ObjectId();
  const user = await UserModel.create({ tenantId, name: "Migration Actor", email: "actor@example.test", passwordHash: "hash",
    role: "EMPLOYEE", status: "active", emailVerified: true });
  const document = await DocumentModel.create({ tenantId, fileName: "hidden.pdf", originalFileName: "hidden.pdf", fileSize: 1,
    mimeType: "application/pdf", storageKey: "hidden", checksum: "checksum", category: "Finance", department: "Operations",
    classification: "internal", owner: null, uploadedBy: user._id, version: 7, versionLabel: "v7" });
  const persistence = new MongoDocumentPolicyBackfillPersistence();
  const [source] = await persistence.scan(tenantId.toString(), undefined, 1);
  assert.ok(source);
  const plan = await planDocumentBackfill(source, persistence);
  const first = await persistence.apply(plan);
  assert.equal(first.status, "migrated");
  const changed = await DocumentModel.findById(document._id).lean().exec();
  assert.equal(changed?.owner?.toString(), user._id.toString());
  assert.ok(changed?.categoryId && changed.departmentId && changed.classificationId && changed.activePolicyId);
  assert.equal(changed?.version, 7); assert.equal(changed?.versionLabel, "v7");
  assert.equal(changed?.category, "Finance"); assert.equal(changed?.department, "Operations");
  const policies = await DocumentAccessPolicyModel.find({ tenantId, documentId: document._id }).lean().exec();
  assert.equal(policies.length, 1);
  assert.deepEqual(policies[0]?.rules, [{ ruleId: "default-owner-minimum", effect: "allow", subject: { type: "owner" }, actions: ["discover", "read", "download"] }]);
  const retry = await persistence.apply(plan);
  assert.equal(retry.status, "already_migrated");
  assert.equal(await DocumentAccessPolicyModel.countDocuments({ tenantId, documentId: document._id }), 1);
});
