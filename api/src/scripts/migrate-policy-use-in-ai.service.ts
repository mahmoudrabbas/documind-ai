import { createHash } from "node:crypto";
import type { ManagementApplyResult } from "../modules/document-access/documentPolicyManagement.persistence.js";
import type {
  DocumentAccessPolicy,
  DocumentAccessPolicyRule,
} from "../modules/document-access/documentAccess.types.js";
import { normalizeDocumentAccessPolicy } from "../modules/document-access/documentAccess.policy.validator.js";
import type { ClassificationLevel } from "../modules/document-taxonomy/documentTaxonomy.types.js";

export interface UseInAiMigrationTaxonomy {
  classificationId: string;
  classificationName: string;
  classificationLevel: ClassificationLevel;
  categoryId: string | null;
  categoryName: string | null;
  departmentId: string | null;
  departmentName: string | null;
}

export interface UseInAiMigrationScanRecord {
  documentId: string;
  tenantId: string;
  documentVersion: number;
  activePolicyId: string;
  activePolicyVersion: number;
}

export interface UseInAiMigrationOptions {
  apply: boolean;
  tenantId?: string;
  afterId?: string;
  batchSize: number;
  limit: number;
}

export type UseInAiMigrationStatus =
  | "would_migrate"
  | "migrated"
  | "replayed"
  | "already_ok"
  | "skipped"
  | "version_conflict"
  | "failed";

export interface UseInAiMigrationResult {
  documentId: string;
  status: UseInAiMigrationStatus;
  policyVersion?: number;
  reason?: string;
}

export interface UseInAiMigrationReport {
  mode: "apply" | "dry-run";
  tenantId: string | null;
  scanned: number;
  counts: Record<UseInAiMigrationStatus, number>;
  results: UseInAiMigrationResult[];
  checkpoint: string | null;
  elapsedMs: number;
}

export interface UseInAiMigrationDeps {
  scan(afterId: string | undefined, limit: number): Promise<UseInAiMigrationScanRecord[]>;
  findPolicy(
    tenantId: string,
    documentId: string,
    policyId: string,
    policyVersion: number,
  ): Promise<DocumentAccessPolicy | null>;
  resolveTaxonomy(
    tenantId: string,
    policy: DocumentAccessPolicy,
  ): Promise<UseInAiMigrationTaxonomy | null>;
  apply(input: {
    tenantId: string;
    documentId: string;
    actorId: string;
    documentVersion: number;
    expectedPolicyId: string;
    expectedPolicyVersion: number;
    policy: DocumentAccessPolicy;
    taxonomy: UseInAiMigrationTaxonomy;
    idempotencyKey: string;
    requestFingerprint: string;
  }): Promise<ManagementApplyResult>;
  dispatch(tenantId: string, eventId: string): Promise<void>;
  audit(entry: {
    tenantId: string;
    documentId: string;
    policyId: string;
    previousPolicyVersion: number;
    policyVersion: number;
  }): Promise<void>;
}

/**
 * Owner/admin control-plane bypass does not cover `use_in_ai`, so every allow
 * rule that grants `read` without `use_in_ai` silently blocks RAG for its
 * subjects. This planner selects those rules for extension.
 */
export function rulesNeedingUseInAi(rules: readonly DocumentAccessPolicyRule[]): string[] {
  return rules
    .filter(
      (rule) =>
        rule.effect === "allow" &&
        rule.actions.includes("read") &&
        !rule.actions.includes("use_in_ai"),
    )
    .map((rule) => rule.ruleId);
}

export function buildUseInAiExtendedPolicy(
  policy: DocumentAccessPolicy,
  ruleIds: readonly string[],
): DocumentAccessPolicy {
  const createdAt = new Date().toISOString();
  const extend = new Set(ruleIds);
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
    rules: policy.rules.map((rule) =>
      extend.has(rule.ruleId)
        ? { ...rule, actions: [...rule.actions, "use_in_ai"] }
        : rule,
    ),
    provenance: {
      createdBy: policy.provenance.createdBy,
      createdAt,
      reason: "use_in_ai backfill (system migration): read grants extended to AI use",
    },
    indexMetadata: {
      policyId: policy.policyId,
      policyVersion: policy.policyVersion + 1,
      classificationId: policy.indexMetadata.classificationId ?? null,
      categoryId: policy.indexMetadata.categoryId ?? null,
      departmentId: policy.indexMetadata.departmentId ?? null,
    },
  });
}

export function backfillIdempotencyKey(documentId: string, fromVersion: number): string {
  return `use-in-ai-backfill:${documentId}:${fromVersion}`;
}

export function backfillRequestFingerprint(documentId: string, policyId: string, fromVersion: number): string {
  return createHash("sha256")
    .update(`use-in-ai-backfill:${documentId}:${policyId}:${fromVersion}`)
    .digest("hex");
}

export async function runUseInAiMigration(
  options: UseInAiMigrationOptions,
  deps: UseInAiMigrationDeps,
): Promise<UseInAiMigrationReport> {
  const startedAt = Date.now();
  const counts: Record<UseInAiMigrationStatus, number> = {
    would_migrate: 0, migrated: 0, replayed: 0, already_ok: 0,
    skipped: 0, version_conflict: 0, failed: 0,
  };
  const report: UseInAiMigrationReport = {
    mode: options.apply ? "apply" : "dry-run",
    tenantId: options.tenantId ?? null,
    scanned: 0,
    counts,
    results: [],
    checkpoint: options.afterId ?? null,
    elapsedMs: 0,
  };
  let cursor = options.afterId;
  while (report.scanned < options.limit) {
    const requested = Math.min(options.batchSize, options.limit - report.scanned);
    const batch = await deps.scan(cursor, requested);
    if (batch.length === 0) break;
    for (const record of batch) {
      report.scanned += 1;
      report.checkpoint = record.documentId;
      cursor = record.documentId;
      const result = options.apply
        ? await migrateRecord(record, deps)
        : await planRecord(record, deps);
      report.results.push(result);
      counts[result.status] += 1;
    }
    if (batch.length < requested) break;
  }
  report.elapsedMs = Date.now() - startedAt;
  return report;
}

async function planRecord(
  record: UseInAiMigrationScanRecord,
  deps: UseInAiMigrationDeps,
): Promise<UseInAiMigrationResult> {
  try {
    const policy = await deps.findPolicy(
      record.tenantId, record.documentId, record.activePolicyId, record.activePolicyVersion,
    );
    if (!policy) return { documentId: record.documentId, status: "skipped", reason: "policy_missing" };
    const ruleIds = rulesNeedingUseInAi(policy.rules);
    if (ruleIds.length === 0) return { documentId: record.documentId, status: "already_ok", policyVersion: policy.policyVersion };
    return { documentId: record.documentId, status: "would_migrate", policyVersion: policy.policyVersion };
  } catch (error) {
    return { documentId: record.documentId, status: "failed", reason: error instanceof Error ? error.message : "unexpected_error" };
  }
}

async function migrateRecord(
  record: UseInAiMigrationScanRecord,
  deps: UseInAiMigrationDeps,
): Promise<UseInAiMigrationResult> {
  try {
    const policy = await deps.findPolicy(
      record.tenantId, record.documentId, record.activePolicyId, record.activePolicyVersion,
    );
    if (!policy) return { documentId: record.documentId, status: "skipped", reason: "policy_missing" };
    const ruleIds = rulesNeedingUseInAi(policy.rules);
    if (ruleIds.length === 0) return { documentId: record.documentId, status: "already_ok", policyVersion: policy.policyVersion };
    const taxonomy = await deps.resolveTaxonomy(record.tenantId, policy);
    if (!taxonomy) return { documentId: record.documentId, status: "skipped", reason: "taxonomy_unresolvable" };
    const proposed = buildUseInAiExtendedPolicy(policy, ruleIds);
    const result = await deps.apply({
      tenantId: record.tenantId,
      documentId: record.documentId,
      actorId: policy.provenance.createdBy,
      documentVersion: record.documentVersion,
      expectedPolicyId: policy.policyId,
      expectedPolicyVersion: policy.policyVersion,
      policy: proposed,
      taxonomy,
      idempotencyKey: backfillIdempotencyKey(record.documentId, policy.policyVersion),
      requestFingerprint: backfillRequestFingerprint(record.documentId, policy.policyId, policy.policyVersion),
    });
    if (result.outcome === "version_conflict") return { documentId: record.documentId, status: "version_conflict" };
    if (result.outcome === "idempotency_conflict") return { documentId: record.documentId, status: "failed", reason: "idempotency_conflict" };
    if (result.outcome === "applied" && result.propagationEventId) await deps.dispatch(record.tenantId, result.propagationEventId);
    if (result.outcome === "applied") {
      await deps.audit({
        tenantId: record.tenantId,
        documentId: record.documentId,
        policyId: result.policyId,
        previousPolicyVersion: policy.policyVersion,
        policyVersion: result.policyVersion,
      });
    }
    return {
      documentId: record.documentId,
      status: result.outcome === "applied" ? "migrated" : "replayed",
      policyVersion: result.policyVersion,
    };
  } catch (error) {
    return { documentId: record.documentId, status: "failed", reason: error instanceof Error ? error.message : "unexpected_error" };
  }
}
