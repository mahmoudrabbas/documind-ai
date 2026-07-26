import type { ClassificationLevel, TaxonomyKind, TaxonomyStatus } from "../modules/document-taxonomy/documentTaxonomy.types.js";

export const MIGRATION_BATCH_MAX = 250;
export const MIGRATION_LIMIT_MAX = 10_000;

export type MigrationStatus = "would_migrate" | "migrated" | "already_migrated" | "quarantined" | "source_changed" | "failed";
export type MigrationReason =
  | "ELIGIBLE"
  | "DEFAULTED_TO_RESTRICTED"
  | "OWNER_UNRESOLVED"
  | "TAXONOMY_ARCHIVED_CONFLICT"
  | "ALREADY_MIGRATED"
  | "SOURCE_CHANGED"
  | "POLICY_CONFLICT"
  | "TRANSACTION_FAILED";

export interface BackfillOptions {
  apply: boolean;
  tenantId: string;
  batchSize: number;
  limit: number;
  afterId?: string;
  checkpoint?: string;
}

export interface SourceDocument {
  id: string;
  tenantId: string;
  updatedAt: Date;
  ownerId: string | null;
  uploadedBy: string;
  category: string | null;
  department: string | null;
  classification: unknown;
  categoryId: string | null;
  departmentId: string | null;
  classificationId: string | null;
  activePolicyId: string | null;
  activePolicyVersion: number | null;
}

export interface TaxonomyIdentity {
  id: string;
  kind: TaxonomyKind;
  normalizedName: string;
  status: TaxonomyStatus;
  level?: ClassificationLevel;
}

export interface TaxonomyDecision {
  kind: TaxonomyKind;
  normalizedName: string;
  displayName: string;
  level?: ClassificationLevel;
  existingId: string | null;
  create: boolean;
}

export interface BackfillPlan {
  document: SourceDocument;
  ownerId: string | null;
  taxonomy: readonly TaxonomyDecision[];
  reason: MigrationReason;
  quarantined: boolean;
}

export interface BackfillResult {
  tenantId: string;
  documentId: string;
  status: MigrationStatus;
  reasonCode: MigrationReason;
  checkpoint: string;
  categoryId?: string | null;
  departmentId?: string | null;
  classificationId?: string | null;
  policyId?: string;
  policyVersion?: 1;
}

export interface BackfillReport {
  mode: "dry-run" | "apply";
  tenantId: string;
  batchSize: number;
  limit: number;
  afterId: string | null;
  checkpoint: string | null;
  scanned: number;
  counts: Record<MigrationStatus, number>;
  reasonCounts: Partial<Record<MigrationReason, number>>;
  results: BackfillResult[];
  elapsedMs: number;
}
