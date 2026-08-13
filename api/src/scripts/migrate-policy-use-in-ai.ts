import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../db/connection.js";
import DocumentModel from "../db/models/document.model.js";
import DepartmentModel from "../db/models/department.model.js";
import DocumentCategoryModel from "../db/models/documentCategory.model.js";
import DocumentClassificationModel from "../db/models/documentClassification.model.js";
import { MongoDocumentAccessPolicyRepository } from "../modules/document-access/documentAccess.policy.repository.mongo.js";
import { applyManagedPolicy } from "../modules/document-access/documentPolicyManagement.persistence.js";
import { getDocumentPolicyPropagationDispatcher } from "../modules/document-access/documentPolicyPropagation.dispatcher.js";
import { getAuditWriter } from "../common/observability/index.js";
import type { DocumentAccessPolicy } from "../modules/document-access/documentAccess.types.js";
import {
  runUseInAiMigration,
  type UseInAiMigrationDeps,
  type UseInAiMigrationTaxonomy,
} from "./migrate-policy-use-in-ai.service.js";

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_LIMIT = 100_000;

function parseArguments(arguments_: string[]) {
  let apply = false;
  let modeWasSet = false;
  let tenantId: string | undefined;
  let afterId: string | undefined;
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--apply" || argument === "--dry-run") {
      if (modeWasSet) throw new Error("Specify only one migration mode");
      apply = argument === "--apply";
      modeWasSet = true;
      continue;
    }
    if (argument === "--tenant-id") {
      tenantId = arguments_[index + 1];
      index += 1;
      if (!tenantId) throw new Error("--tenant-id requires a value");
      continue;
    }
    if (argument === "--after-id") {
      afterId = arguments_[index + 1];
      index += 1;
      if (!afterId) throw new Error("--after-id requires a value");
      continue;
    }
    throw new Error(`Unknown migration argument: ${argument}`);
  }
  if (tenantId && !mongoose.isObjectIdOrHexString(tenantId)) throw new Error("--tenant-id must be a 24-character ObjectId");
  if (afterId && !mongoose.isObjectIdOrHexString(afterId)) throw new Error("--after-id must be a 24-character ObjectId");
  return { apply, tenantId, afterId };
}

function createDeps(tenantId: string | undefined): UseInAiMigrationDeps {
  const policies = new MongoDocumentAccessPolicyRepository();
  const auditWriter = getAuditWriter();
  return {
    scan: async (afterId, limit) => {
      const records = await DocumentModel.find({
        ...(tenantId ? { tenantId: new mongoose.Types.ObjectId(tenantId) } : {}),
        ...(afterId ? { _id: { $gt: new mongoose.Types.ObjectId(afterId) } } : {}),
        deletedAt: null,
        activePolicyId: { $type: "objectId" },
        activePolicyVersion: { $ne: null },
      }).sort({ _id: 1 }).limit(limit).select("_id tenantId version activePolicyId activePolicyVersion").lean().exec();
      return records
        .filter((record) => record._id && record.tenantId && record.activePolicyId && record.activePolicyVersion != null)
        .map((record) => ({
          documentId: record._id.toString(),
          tenantId: record.tenantId.toString(),
          documentVersion: record.version,
          activePolicyId: record.activePolicyId!.toString(),
          activePolicyVersion: record.activePolicyVersion!,
        }));
    },
    findPolicy: (tenantIdValue, documentId, policyId, policyVersion) =>
      policies.findExact(tenantIdValue, documentId, policyId, policyVersion),
    resolveTaxonomy: async (tenantIdValue, policy) => resolveTaxonomy(tenantIdValue, policy),
    apply: (input) => applyManagedPolicy({
      tenantId: input.tenantId,
      documentId: input.documentId,
      actorId: input.actorId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint: input.requestFingerprint,
      expectedPolicyId: input.expectedPolicyId,
      expectedPolicyVersion: input.expectedPolicyVersion,
      documentVersion: input.documentVersion,
      changeDirection: "broadening",
      sensitiveBroadening: false,
      propagationReason: "policy_change",
      policy: input.policy,
      taxonomy: input.taxonomy,
    }),
    dispatch: async (tenantIdValue, eventId) => {
      await getDocumentPolicyPropagationDispatcher().dispatchEvent(tenantIdValue, eventId);
    },
    audit: async (entry) => {
      await auditWriter.write({
        action: "DOCUMENT_POLICY_APPLIED",
        resourceType: "DocumentPolicy",
        resourceId: entry.documentId,
        tenantId: entry.tenantId,
        actorKind: "SYSTEM",
        metadata: {
          migration: "use_in_ai_backfill",
          policyId: entry.policyId,
          previousPolicyVersion: entry.previousPolicyVersion,
          policyVersion: entry.policyVersion,
        },
      });
    },
  };
}

async function resolveTaxonomy(tenantId: string, policy: DocumentAccessPolicy): Promise<UseInAiMigrationTaxonomy | null> {
  const classificationId = policy.indexMetadata.classificationId;
  if (!classificationId) return null;
  const categoryId = policy.indexMetadata.categoryId ?? null;
  const departmentId = policy.indexMetadata.departmentId ?? null;
  const [classification, category, department] = await Promise.all([
    DocumentClassificationModel.findOne({ _id: classificationId, tenantId, status: "active" }).select("name level").lean().exec(),
    categoryId ? DocumentCategoryModel.findOne({ _id: categoryId, tenantId, status: "active" }).select("name").lean().exec() : null,
    departmentId ? DepartmentModel.findOne({ _id: departmentId, tenantId, status: "active" }).select("name").lean().exec() : null,
  ]);
  if (!classification) return null;
  if (categoryId && !category) return null;
  if (departmentId && !department) return null;
  return {
    classificationId,
    classificationName: classification.name,
    classificationLevel: classification.level,
    categoryId,
    categoryName: category?.name ?? null,
    departmentId,
    departmentName: department?.name ?? null,
  };
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  await connectDB();
  const report = await runUseInAiMigration(
    { apply: options.apply, tenantId: options.tenantId, afterId: options.afterId, batchSize: DEFAULT_BATCH_SIZE, limit: DEFAULT_LIMIT },
    createDeps(options.tenantId),
  );
  console.info(JSON.stringify(report, null, 2));
}

main()
  .catch((error: unknown) => {
    console.error(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "USE_IN_AI_MIGRATION_FAILED" }));
    process.exitCode = 1;
  })
  .finally(async () => {
    await disconnectDB();
    process.exit(process.exitCode ?? 0);
  });
