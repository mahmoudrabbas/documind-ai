import type { PlannerLookups } from "./document-policy-backfill.planner.js";
import { planDocumentBackfill } from "./document-policy-backfill.planner.js";
import type { BackfillOptions, BackfillPlan, BackfillReport, BackfillResult, MigrationStatus, SourceDocument } from "./document-policy-backfill.contracts.js";

export interface BackfillPersistence extends PlannerLookups {
  scan(tenantId: string, afterId: string | undefined, limit: number): Promise<SourceDocument[]>;
  apply(plan: BackfillPlan): Promise<BackfillResult>;
}

export async function runDocumentPolicyBackfill(options: BackfillOptions, persistence: BackfillPersistence): Promise<BackfillReport> {
  const startedAt = Date.now();
  const report: BackfillReport = {
    mode: options.apply ? "apply" : "dry-run",
    tenantId: options.tenantId,
    batchSize: options.batchSize,
    limit: options.limit,
    afterId: options.afterId ?? options.checkpoint ?? null,
    checkpoint: null,
    scanned: 0,
    counts: emptyCounts(),
    reasonCounts: {},
    results: [],
    elapsedMs: 0,
  };
  let cursor = options.afterId ?? options.checkpoint;
  while (report.scanned < options.limit) {
    const remaining = options.limit - report.scanned;
    const documents = await persistence.scan(options.tenantId, cursor, Math.min(options.batchSize, remaining));
    if (documents.length === 0) break;
    for (const document of documents) {
      const plan = await planDocumentBackfill(document, persistence);
      const result = options.apply ? await applyOrClassify(plan, persistence) : dryRunResult(plan);
      report.results.push(result);
      report.scanned += 1;
      report.counts[result.status] += 1;
      report.reasonCounts[result.reasonCode] = (report.reasonCounts[result.reasonCode] ?? 0) + 1;
      report.checkpoint = document.id;
      cursor = document.id;
    }
    if (documents.length < Math.min(options.batchSize, remaining)) break;
  }
  report.elapsedMs = Date.now() - startedAt;
  return report;
}

async function applyOrClassify(plan: BackfillPlan, persistence: BackfillPersistence): Promise<BackfillResult> {
  if (plan.reason === "ALREADY_MIGRATED") return baseResult(plan, "already_migrated", "ALREADY_MIGRATED");
  if (plan.quarantined) return baseResult(plan, "quarantined", plan.reason);
  return persistence.apply(plan);
}

function dryRunResult(plan: BackfillPlan): BackfillResult {
  if (plan.reason === "ALREADY_MIGRATED") return baseResult(plan, "already_migrated", "ALREADY_MIGRATED");
  if (plan.quarantined) return baseResult(plan, "quarantined", plan.reason);
  return baseResult(plan, "would_migrate", plan.reason);
}

function baseResult(plan: BackfillPlan, status: MigrationStatus, reasonCode: BackfillResult["reasonCode"]): BackfillResult {
  return { tenantId: plan.document.tenantId, documentId: plan.document.id, status, reasonCode, checkpoint: plan.document.id };
}

function emptyCounts(): Record<MigrationStatus, number> {
  return { would_migrate: 0, migrated: 0, already_migrated: 0, quarantined: 0, source_changed: 0, failed: 0 };
}
