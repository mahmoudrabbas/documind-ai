import { createHash } from "node:crypto";
import type { ManagementApplyResult } from "../modules/document-access/documentPolicyManagement.persistence.js";
import type { DocumentAccessPolicy } from "../modules/document-access/documentAccess.types.js";
import { normalizeDocumentAccessPolicy } from "../modules/document-access/documentAccess.policy.validator.js";
import type { ClassificationLevel } from "../modules/document-taxonomy/documentTaxonomy.types.js";

export interface DepartmentAccessMigrationRecord {
  documentId: string;
  tenantId: string;
  documentVersion: number;
  activePolicyId: string;
  activePolicyVersion: number;
  departmentId: string;
}

export interface DepartmentAccessMigrationTaxonomy {
  classificationId: string;
  classificationName: string;
  classificationLevel: ClassificationLevel;
  categoryId: string | null;
  categoryName: string | null;
  departmentId: string;
  departmentName: string;
}

export interface DepartmentAccessMigrationDeps {
  scan(tenantId: string, afterId: string | undefined, limit: number): Promise<DepartmentAccessMigrationRecord[]>;
  findPolicy(tenantId: string, documentId: string, policyId: string, policyVersion: number): Promise<DocumentAccessPolicy | null>;
  resolveTaxonomy(tenantId: string, policy: DocumentAccessPolicy, departmentId: string): Promise<DepartmentAccessMigrationTaxonomy | null>;
  apply(input: {
    tenantId: string;
    documentId: string;
    actorId: string;
    documentVersion: number;
    expectedPolicyId: string;
    expectedPolicyVersion: number;
    policy: DocumentAccessPolicy;
    taxonomy: DepartmentAccessMigrationTaxonomy;
    idempotencyKey: string;
    requestFingerprint: string;
  }): Promise<ManagementApplyResult>;
  dispatch(tenantId: string, eventId: string): Promise<void>;
  audit(entry: { tenantId: string; documentId: string; policyId: string; previousPolicyVersion: number; policyVersion: number }): Promise<void>;
}

export type DepartmentAccessMigrationStatus = "would_migrate" | "migrated" | "replayed" | "already_ok" | "skipped" | "version_conflict" | "failed";

export interface DepartmentAccessMigrationOptions {
  apply: boolean;
  tenantId: string;
  afterId?: string;
  batchSize: number;
  limit: number;
}

export interface DepartmentAccessMigrationReport {
  mode: "apply" | "dry-run";
  tenantId: string;
  scanned: number;
  counts: Record<DepartmentAccessMigrationStatus, number>;
  results: Array<{ documentId: string; status: DepartmentAccessMigrationStatus; policyVersion?: number; reason?: string }>;
  checkpoint: string | null;
  elapsedMs: number;
}

const DEPARTMENT_ACTIONS = ["discover", "read", "download", "use_in_ai"] as const;

export function departmentRuleNeedsMigration(policy: DocumentAccessPolicy, departmentId: string): boolean {
  return !policy.rules.some((rule) => rule.effect === "allow" && rule.subject.type === "department" && rule.subject.id === departmentId && DEPARTMENT_ACTIONS.every((action) => rule.actions.includes(action)));
}

export function buildDepartmentAccessPolicy(policy: DocumentAccessPolicy, departmentId: string): DocumentAccessPolicy {
  if (!departmentRuleNeedsMigration(policy, departmentId)) return policy;
  const createdAt = new Date().toISOString();
  const baseRuleId = `default-department-${departmentId}`;
  const ruleId = policy.rules.some((rule) => rule.ruleId === baseRuleId) ? `${baseRuleId}-automatic` : baseRuleId;
  return normalizeDocumentAccessPolicy({
    contractVersion: 1,
    tenantId: policy.tenantId,
    documentId: policy.documentId,
    policyId: policy.policyId,
    policyVersion: policy.policyVersion + 1,
    status: "active",
    effectiveFrom: createdAt,
    effectiveUntil: policy.effectiveUntil ?? null,
    inherits: policy.inherits ?? null,
    rules: [...policy.rules, { ruleId, effect: "allow", subject: { type: "department", id: departmentId }, actions: [...DEPARTMENT_ACTIONS] }],
    provenance: { createdBy: policy.provenance.createdBy, createdAt, reason: "department document access backfill" },
    indexMetadata: { ...policy.indexMetadata, policyId: policy.policyId, policyVersion: policy.policyVersion + 1 },
  });
}

export function backfillIdempotencyKey(documentId: string, fromVersion: number): string {
  return `department-access-backfill:${documentId}:${fromVersion}`;
}

export function backfillRequestFingerprint(documentId: string, policyId: string, fromVersion: number): string {
  return createHash("sha256").update(`department-access-backfill:${documentId}:${policyId}:${fromVersion}`).digest("hex");
}

export async function runDepartmentAccessMigration(options: DepartmentAccessMigrationOptions, deps: DepartmentAccessMigrationDeps): Promise<DepartmentAccessMigrationReport> {
  const startedAt = Date.now();
  const counts: Record<DepartmentAccessMigrationStatus, number> = { would_migrate: 0, migrated: 0, replayed: 0, already_ok: 0, skipped: 0, version_conflict: 0, failed: 0 };
  const report: DepartmentAccessMigrationReport = { mode: options.apply ? "apply" : "dry-run", tenantId: options.tenantId, scanned: 0, counts, results: [], checkpoint: options.afterId ?? null, elapsedMs: 0 };
  let cursor = options.afterId;
  while (report.scanned < options.limit) {
    const requested = Math.min(options.batchSize, options.limit - report.scanned);
    const records = await deps.scan(options.tenantId, cursor, requested);
    if (records.length === 0) break;
    for (const record of records) {
      report.scanned += 1; report.checkpoint = record.documentId; cursor = record.documentId;
      const result = options.apply ? await migrateRecord(record, deps) : await planRecord(record, deps);
      report.results.push(result); counts[result.status] += 1;
    }
    if (records.length < requested) break;
  }
  report.elapsedMs = Date.now() - startedAt;
  return report;
}

async function planRecord(record: DepartmentAccessMigrationRecord, deps: DepartmentAccessMigrationDeps) {
  try {
    const policy = await deps.findPolicy(record.tenantId, record.documentId, record.activePolicyId, record.activePolicyVersion);
    if (!policy) return { documentId: record.documentId, status: "skipped" as const, reason: "policy_missing" };
    if (!departmentRuleNeedsMigration(policy, record.departmentId)) return { documentId: record.documentId, status: "already_ok" as const, policyVersion: policy.policyVersion };
    return { documentId: record.documentId, status: "would_migrate" as const, policyVersion: policy.policyVersion };
  } catch (error) { return { documentId: record.documentId, status: "failed" as const, reason: error instanceof Error ? error.message : "unexpected_error" }; }
}

async function migrateRecord(record: DepartmentAccessMigrationRecord, deps: DepartmentAccessMigrationDeps) {
  try {
    const policy = await deps.findPolicy(record.tenantId, record.documentId, record.activePolicyId, record.activePolicyVersion);
    if (!policy) return { documentId: record.documentId, status: "skipped" as const, reason: "policy_missing" };
    if (!departmentRuleNeedsMigration(policy, record.departmentId)) return { documentId: record.documentId, status: "already_ok" as const, policyVersion: policy.policyVersion };
    const taxonomy = await deps.resolveTaxonomy(record.tenantId, policy, record.departmentId);
    if (!taxonomy) return { documentId: record.documentId, status: "skipped" as const, reason: "taxonomy_unresolvable" };
    const proposed = buildDepartmentAccessPolicy(policy, record.departmentId);
    const result = await deps.apply({ tenantId: record.tenantId, documentId: record.documentId, actorId: policy.provenance.createdBy, documentVersion: record.documentVersion,
      expectedPolicyId: policy.policyId, expectedPolicyVersion: policy.policyVersion, policy: proposed, taxonomy,
      idempotencyKey: backfillIdempotencyKey(record.documentId, policy.policyVersion), requestFingerprint: backfillRequestFingerprint(record.documentId, policy.policyId, policy.policyVersion) });
    if (result.outcome === "version_conflict") return { documentId: record.documentId, status: "version_conflict" as const };
    if (result.outcome === "idempotency_conflict") return { documentId: record.documentId, status: "failed" as const, reason: "idempotency_conflict" };
    if (result.outcome === "applied" && result.propagationEventId) await deps.dispatch(record.tenantId, result.propagationEventId);
    if (result.outcome === "applied") await deps.audit({ tenantId: record.tenantId, documentId: record.documentId, policyId: result.policyId, previousPolicyVersion: policy.policyVersion, policyVersion: result.policyVersion });
    return { documentId: record.documentId, status: result.outcome === "applied" ? "migrated" as const : "replayed" as const, policyVersion: result.policyVersion };
  } catch (error) { return { documentId: record.documentId, status: "failed" as const, reason: error instanceof Error ? error.message : "unexpected_error" }; }
}
