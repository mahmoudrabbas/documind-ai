import mongoose from "mongoose";
import { normalizeTaxonomyDisplayName, normalizeTaxonomyName } from "../modules/document-taxonomy/documentTaxonomy.normalization.js";
import type { ClassificationLevel, TaxonomyKind } from "../modules/document-taxonomy/documentTaxonomy.types.js";
import type { BackfillPlan, SourceDocument, TaxonomyDecision, TaxonomyIdentity } from "./document-policy-backfill.contracts.js";

export const CANONICAL_CLASSIFICATIONS: Readonly<Record<ClassificationLevel, string>> = {
  internal: "Internal",
  restricted: "Restricted",
  confidential: "Confidential",
  highly_confidential: "Highly Confidential",
};

export interface PlannerLookups {
  userEligible(tenantId: string, userId: string): Promise<boolean>;
  taxonomyByName(tenantId: string, kind: TaxonomyKind, normalizedName: string): Promise<TaxonomyIdentity | null>;
}

export async function planDocumentBackfill(document: SourceDocument, lookups: PlannerLookups): Promise<BackfillPlan> {
  if (document.activePolicyId || document.activePolicyVersion) {
    return { document, ownerId: null, taxonomy: [], reason: "ALREADY_MIGRATED", quarantined: false };
  }
  const ownerId = await resolveOwner(document, lookups);
  if (!ownerId) return { document, ownerId: null, taxonomy: [], reason: "OWNER_UNRESOLVED", quarantined: true };

  const taxonomy: TaxonomyDecision[] = [];
  for (const [kind, value] of [["category", document.category], ["department", document.department]] as const) {
    const decision = await planOptionalName(document.tenantId, kind, value, lookups);
    if (decision === "conflict") return { document, ownerId, taxonomy, reason: "TAXONOMY_ARCHIVED_CONFLICT", quarantined: true };
    if (decision) taxonomy.push(decision);
  }
  const level = classificationLevel(document.classification);
  const classification = await planClassification(document.tenantId, level.value, lookups);
  if (classification === "conflict") return { document, ownerId, taxonomy, reason: "TAXONOMY_ARCHIVED_CONFLICT", quarantined: true };
  taxonomy.push(classification);
  return { document, ownerId, taxonomy, reason: level.defaulted ? "DEFAULTED_TO_RESTRICTED" : "ELIGIBLE", quarantined: false };
}

async function resolveOwner(document: SourceDocument, lookups: PlannerLookups): Promise<string | null> {
  for (const candidate of [document.ownerId, document.uploadedBy]) {
    if (candidate && mongoose.isObjectIdOrHexString(candidate) && await lookups.userEligible(document.tenantId, candidate)) return candidate;
  }
  return null;
}

async function planOptionalName(tenantId: string, kind: "category" | "department", value: string | null, lookups: PlannerLookups): Promise<TaxonomyDecision | "conflict" | null> {
  if (!value || normalizeTaxonomyName(value).length === 0) return null;
  const displayName = normalizeTaxonomyDisplayName(value);
  const normalizedName = normalizeTaxonomyName(value);
  const existing = await lookups.taxonomyByName(tenantId, kind, normalizedName);
  if (existing?.status === "archived") return "conflict";
  return { kind, normalizedName, displayName, existingId: existing?.id ?? null, create: !existing };
}

async function planClassification(tenantId: string, level: ClassificationLevel, lookups: PlannerLookups): Promise<TaxonomyDecision | "conflict"> {
  const displayName = CANONICAL_CLASSIFICATIONS[level];
  const normalizedName = normalizeTaxonomyName(displayName);
  const existing = await lookups.taxonomyByName(tenantId, "classification", normalizedName);
  if (existing?.status === "archived" || (existing?.level && existing.level !== level)) return "conflict";
  return { kind: "classification", normalizedName, displayName, level, existingId: existing?.id ?? null, create: !existing };
}

function classificationLevel(value: unknown): { value: ClassificationLevel; defaulted: boolean } {
  if (value === "internal" || value === "restricted" || value === "confidential" || value === "highly_confidential") return { value, defaulted: false };
  return { value: "restricted", defaulted: true };
}
