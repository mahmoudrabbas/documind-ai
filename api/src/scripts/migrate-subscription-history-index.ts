import {
  EFFECTIVE_SUBSCRIPTION_INDEX_FILTER,
  EFFECTIVE_SUBSCRIPTION_INDEX_KEY,
  EFFECTIVE_SUBSCRIPTION_INDEX_NAME,
  inspectSubscriptionIndexInvariant,
  isExactEffectiveSubscriptionIndex,
  isTenantUniqueIndex,
  type SubscriptionIndexDescription,
} from "../db/subscription-index-invariant.js";

export interface SubscriptionIndexCollection {
  indexes(): Promise<SubscriptionIndexDescription[]>;
  createIndex(key: Record<string, 1 | -1>, options: Record<string, unknown>): Promise<string>;
  dropIndex(name: string): Promise<unknown>;
  aggregate(pipeline: Record<string, unknown>[]): { toArray(): Promise<Array<{ count?: number }>> };
}

export interface SubscriptionIndexMigrationDatabase { collection(name: string): SubscriptionIndexCollection }
export interface SubscriptionIndexMigrationReport {
  mode: "dry-run" | "apply";
  dropped: string[];
  created: string[];
  existing: string[];
  obsolete: string[];
  conflicts: string[];
  effectiveDuplicateTenantCount: number;
  businessDocumentsMutated: 0;
}

type SubscriptionIndex = Awaited<ReturnType<SubscriptionIndexCollection["indexes"]>>[number];

async function listIndexes(collection: SubscriptionIndexCollection): Promise<SubscriptionIndex[]> {
  try {
    return await collection.indexes();
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 26) return [];
    throw error;
  }
}

export async function migrateSubscriptionHistoryIndex(db: SubscriptionIndexMigrationDatabase, apply = false): Promise<SubscriptionIndexMigrationReport> {
  const report: SubscriptionIndexMigrationReport = {
    mode: apply ? "apply" : "dry-run",
    dropped: [], created: [], existing: [], obsolete: [], conflicts: [],
    effectiveDuplicateTenantCount: 0, businessDocumentsMutated: 0,
  };
  const collection = db.collection("subscriptions");
  const indexes = await listIndexes(collection);
  const target = indexes.find((index) => index.name === EFFECTIVE_SUBSCRIPTION_INDEX_NAME);
  const invariant = await inspectSubscriptionIndexInvariant(collection);

  report.effectiveDuplicateTenantCount = invariant.effectiveDuplicateTenantCount;
  if (report.effectiveDuplicateTenantCount > 0) report.conflicts.push("EFFECTIVE_SUBSCRIPTION_DUPLICATES");
  if (target && !isExactEffectiveSubscriptionIndex(target)) report.conflicts.push("TARGET_INDEX_DEFINITION_MISMATCH");

  report.obsolete = invariant.obsoleteUniqueIndexes;

  if (isExactEffectiveSubscriptionIndex(target)) report.existing.push(EFFECTIVE_SUBSCRIPTION_INDEX_NAME);
  else if (!target) report.created.push(EFFECTIVE_SUBSCRIPTION_INDEX_NAME);

  if (report.conflicts.length) throw new Error("SUBSCRIPTION_INDEX_MIGRATION_CONFLICT");
  if (!apply) return report;

  // Install and verify the narrower uniqueness protection before removing any
  // unrestricted tenant-unique index. No subscription documents are updated.
  if (!isExactEffectiveSubscriptionIndex(target)) {
    await collection.createIndex(EFFECTIVE_SUBSCRIPTION_INDEX_KEY, {
      name: EFFECTIVE_SUBSCRIPTION_INDEX_NAME,
      unique: true,
      partialFilterExpression: EFFECTIVE_SUBSCRIPTION_INDEX_FILTER,
    });
  }
  let verified = await listIndexes(collection);
  if (!isExactEffectiveSubscriptionIndex(verified.find((index) => index.name === EFFECTIVE_SUBSCRIPTION_INDEX_NAME))) {
    throw new Error("SUBSCRIPTION_INDEX_MIGRATION_TARGET_NOT_VERIFIED");
  }

  for (const name of report.obsolete) {
    await collection.dropIndex(name);
    report.dropped.push(name);
  }
  verified = await listIndexes(collection);
  const remainingObsolete = verified.filter(isTenantUniqueIndex).filter((index) => index.name !== EFFECTIVE_SUBSCRIPTION_INDEX_NAME);
  if (!isExactEffectiveSubscriptionIndex(verified.find((index) => index.name === EFFECTIVE_SUBSCRIPTION_INDEX_NAME)) || remainingObsolete.length > 0) {
    throw new Error("SUBSCRIPTION_INDEX_MIGRATION_POSTCONDITION_FAILED");
  }
  return report;
}
