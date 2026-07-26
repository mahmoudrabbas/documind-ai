import assert from "node:assert/strict";
import test, { after, before, beforeEach } from "node:test";
import mongoose from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import DocumentAccessPolicyModel from "../../db/models/documentAccessPolicy.model.js";
import DocumentModel from "../../db/models/document.model.js";
import { MongoDocumentAccessPolicyRepository } from "./documentAccess.policy.repository.mongo.js";
import type { DocumentAccessPolicy } from "./documentAccess.types.js";

let mongo: MongoMemoryReplSet | null = null;
const repository = new MongoDocumentAccessPolicyRepository();
const tenantA = new mongoose.Types.ObjectId();
const tenantB = new mongoose.Types.ObjectId();
const documentId = new mongoose.Types.ObjectId();
const actorId = new mongoose.Types.ObjectId();
const policyId = new mongoose.Types.ObjectId();
const classificationId = new mongoose.Types.ObjectId();

before(async () => {
  mongo = await MongoMemoryReplSet.create({
    replSet: { count: 1 },
    binary: { version: process.env.MONGOMS_VERSION ?? "7.0.14" },
  });
  await mongoose.connect(mongo.getUri(), { dbName: "document-policy-repository" });
  await Promise.all([DocumentModel.init(), DocumentAccessPolicyModel.init()]);
});

beforeEach(async () => {
  await Promise.all([DocumentAccessPolicyModel.deleteMany({}), DocumentModel.deleteMany({})]);
  await DocumentModel.create({
    _id: documentId,
    tenantId: tenantA,
    fileName: "policy.pdf",
    originalFileName: "policy.pdf",
    fileSize: 10,
    mimeType: "application/pdf",
    storageKey: "tenant/document/policy.pdf",
    checksum: "checksum",
    metadata: { title: null, description: null, tags: [] },
    classification: "restricted",
    version: 7,
    versionLabel: "v7",
    uploadedBy: actorId,
  });
});

after(async () => {
  await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

test("atomically creates immutable snapshots and updates only the policy pointer", async () => {
  const initial = policy(1);
  assert.equal((await repository.createInitial(tenantA.toString(), documentId.toString(), {
    policy: initial,
    expectedActivePolicy: null,
  })).outcome, "created");
  const before = await DocumentModel.findById(documentId).lean().exec();
  assert.equal(before?.version, 7);
  assert.equal(before?.versionLabel, "v7");
  assert.equal(before?.activePolicyVersion, 1);

  const attempts = await Promise.all([
    repository.createNextAndActivate(tenantA.toString(), documentId.toString(), {
      policy: policy(2),
      expectedActivePolicy: { policyId: policyId.toString(), policyVersion: 1 },
    }),
    repository.createNextAndActivate(tenantA.toString(), documentId.toString(), {
      policy: policy(2),
      expectedActivePolicy: { policyId: policyId.toString(), policyVersion: 1 },
    }),
  ]);
  assert.equal(attempts.filter((result) => result.outcome === "created").length, 1);
  assert.equal(attempts.filter((result) => result.outcome !== "created").length, 1);
  assert.equal((await repository.findExact(
    tenantA.toString(), documentId.toString(), policyId.toString(), 1,
  ))?.rules[0]?.ruleId, "owner-v1");
  const history = await repository.listHistory(tenantA.toString(), documentId.toString(), null, 20);
  assert.deepEqual(history.policies.map((item) => item.policyVersion), [2, 1]);
  assert.equal(await repository.findExact(
    tenantB.toString(), documentId.toString(), policyId.toString(), 1,
  ), null);
  await assert.rejects(
    DocumentAccessPolicyModel.updateOne(
      { tenantId: tenantA, documentId, policyId, policyVersion: 1 },
      { $set: { status: "retired" } },
    ),
    /DOCUMENT_POLICY_SNAPSHOT_IMMUTABLE/,
  );
});

test("cross-tenant activation is hidden and cannot change the pointer", async () => {
  await repository.createInitial(tenantA.toString(), documentId.toString(), {
    policy: policy(1),
    expectedActivePolicy: null,
  });
  const result = await repository.activateExact(
    tenantB.toString(),
    documentId.toString(),
    { policyId: policyId.toString(), policyVersion: 1 },
    null,
  );
  assert.equal(result.outcome, "document_not_found");
  assert.equal((await DocumentModel.findById(documentId).lean().exec())?.activePolicyVersion, 1);
});

function policy(version: number): DocumentAccessPolicy {
  const timestamp = `2026-07-22T10:00:0${version}.000Z`;
  return {
    contractVersion: 1,
    tenantId: tenantA.toString(),
    documentId: documentId.toString(),
    policyId: policyId.toString(),
    policyVersion: version,
    status: "active",
    effectiveFrom: timestamp,
    effectiveUntil: null,
    inherits: version === 1 ? null : { policyId: policyId.toString(), policyVersion: version - 1 },
    rules: [{
      ruleId: `owner-v${version}`,
      effect: "allow",
      subject: { type: "owner" },
      actions: ["read"],
    }],
    provenance: { createdBy: actorId.toString(), createdAt: timestamp },
    indexMetadata: {
      policyId: policyId.toString(),
      policyVersion: version,
      classificationId: classificationId.toString(),
      categoryId: null,
      departmentId: null,
    },
  };
}
