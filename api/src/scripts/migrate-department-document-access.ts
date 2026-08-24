import "dotenv/config";
import mongoose from "mongoose";
import { connectDB, disconnectDB } from "../db/connection.js";
import DocumentModel from "../db/models/document.model.js";
import DepartmentModel from "../db/models/department.model.js";
import DocumentCategoryModel from "../db/models/documentCategory.model.js";
import DocumentClassificationModel from "../db/models/documentClassification.model.js";
import { getAuditWriter } from "../common/observability/index.js";
import { MongoDocumentAccessPolicyRepository } from "../modules/document-access/documentAccess.policy.repository.mongo.js";
import { applyManagedPolicy } from "../modules/document-access/documentPolicyManagement.persistence.js";
import { getDocumentPolicyPropagationDispatcher } from "../modules/document-access/documentPolicyPropagation.dispatcher.js";
import type { DocumentAccessPolicy } from "../modules/document-access/documentAccess.types.js";
import {
  runDepartmentAccessMigration,
  type DepartmentAccessMigrationDeps,
  type DepartmentAccessMigrationTaxonomy,
} from "./migrate-department-document-access.service.js";

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 250;
const DEFAULT_LIMIT = 10_000;
const MAX_LIMIT = 100_000;

export function parseDepartmentAccessArguments(arguments_: readonly string[]) {
  let apply = false;
  let modeSet = false;
  const values = new Map<string, string>();
  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index]!;
    if (argument === "--apply" || argument === "--dry-run") {
      if (modeSet) throw new Error("Specify only one migration mode");
      apply = argument === "--apply"; modeSet = true; continue;
    }
    const [name, inline] = argument.split("=", 2);
    if (!["--tenant-id", "--after-id", "--batch-size", "--limit"].includes(name)) throw new Error(`Unknown migration argument: ${name}`);
    const value = inline ?? arguments_[++index];
    if (!value || value.startsWith("--") || values.has(name)) throw new Error(`${name} requires one value`);
    values.set(name, value);
  }
  const tenantId = values.get("--tenant-id");
  if (!tenantId || !mongoose.isObjectIdOrHexString(tenantId)) throw new Error("--tenant-id is required and must be a 24-character ObjectId");
  const afterId = values.get("--after-id");
  if (afterId && !mongoose.isObjectIdOrHexString(afterId)) throw new Error("--after-id must be a 24-character ObjectId");
  const batchSize = boundedInteger(values.get("--batch-size") ?? String(DEFAULT_BATCH_SIZE), "--batch-size", MAX_BATCH_SIZE);
  const limit = boundedInteger(values.get("--limit") ?? String(DEFAULT_LIMIT), "--limit", MAX_LIMIT);
  return { apply, tenantId, afterId, batchSize, limit };
}

function boundedInteger(value: string, name: string, maximum: number): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > maximum) throw new Error(`${name} must be between 1 and ${maximum}`);
  return parsed;
}

function createDeps(): DepartmentAccessMigrationDeps {
  const policies = new MongoDocumentAccessPolicyRepository();
  const auditWriter = getAuditWriter();
  return {
    scan: async (tenantId, afterId, limit) => {
      const records = await DocumentModel.find({
        tenantId: new mongoose.Types.ObjectId(tenantId),
        ...(afterId ? { _id: { $gt: new mongoose.Types.ObjectId(afterId) } } : {}),
        deletedAt: null,
        departmentId: { $type: "objectId" },
        activePolicyId: { $type: "objectId" },
        activePolicyVersion: { $gte: 1 },
      }).sort({ _id: 1 }).limit(limit).select("_id tenantId version departmentId activePolicyId activePolicyVersion").lean().exec();
      return records.flatMap((record) => record.departmentId && record.activePolicyId && record.activePolicyVersion
        ? [{ documentId: record._id.toString(), tenantId: record.tenantId.toString(), documentVersion: record.version,
            departmentId: record.departmentId.toString(), activePolicyId: record.activePolicyId.toString(), activePolicyVersion: record.activePolicyVersion }]
        : []);
    },
    findPolicy: (tenantId, documentId, policyId, policyVersion) => policies.findExact(tenantId, documentId, policyId, policyVersion),
    resolveTaxonomy: (tenantId, policy, departmentId) => resolveTaxonomy(tenantId, policy, departmentId),
    apply: (input) => applyManagedPolicy({ ...input, changeDirection: "broadening", sensitiveBroadening: false, propagationReason: "policy_change" }),
    dispatch: async (tenantId, eventId) => { await getDocumentPolicyPropagationDispatcher().dispatchEvent(tenantId, eventId); },
    audit: async (entry) => { await auditWriter.write({ action: "DOCUMENT_POLICY_APPLIED", resourceType: "DocumentPolicy", resourceId: entry.documentId,
      tenantId: entry.tenantId, actorKind: "SYSTEM", metadata: { migration: "department_document_access_backfill", policyId: entry.policyId,
        previousPolicyVersion: entry.previousPolicyVersion, policyVersion: entry.policyVersion } }); },
  };
}

async function resolveTaxonomy(tenantId: string, policy: DocumentAccessPolicy, departmentId: string): Promise<DepartmentAccessMigrationTaxonomy | null> {
  const classificationId = policy.indexMetadata.classificationId;
  if (!classificationId || policy.indexMetadata.departmentId !== departmentId) return null;
  const categoryId = policy.indexMetadata.categoryId ?? null;
  const [classification, category, department] = await Promise.all([
    DocumentClassificationModel.findOne({ _id: classificationId, tenantId, status: "active" }).select("name level").lean().exec(),
    categoryId ? DocumentCategoryModel.findOne({ _id: categoryId, tenantId, status: "active" }).select("name").lean().exec() : null,
    DepartmentModel.findOne({ _id: departmentId, tenantId, status: "active" }).select("name").lean().exec(),
  ]);
  if (!classification || !department || (categoryId && !category)) return null;
  return { classificationId, classificationName: classification.name, classificationLevel: classification.level, categoryId,
    categoryName: category?.name ?? null, departmentId, departmentName: department.name };
}

export async function runCli(arguments_: readonly string[]): Promise<number> {
  const options = parseDepartmentAccessArguments(arguments_);
  await connectDB();
  const report = await runDepartmentAccessMigration(options, createDeps());
  console.info(JSON.stringify(report, null, 2));
  return report.counts.failed > 0 ? 1 : report.counts.skipped + report.counts.version_conflict > 0 ? 2 : 0;
}

if (process.argv[1]?.endsWith("migrate-department-document-access.ts")) {
  runCli(process.argv.slice(2)).then((code) => { process.exitCode = code; }).catch((error: unknown) => {
    console.error(JSON.stringify({ success: false, error: error instanceof Error ? error.message : "DEPARTMENT_ACCESS_MIGRATION_FAILED" }));
    process.exitCode = 1;
  }).finally(async () => { await disconnectDB(); });
}
