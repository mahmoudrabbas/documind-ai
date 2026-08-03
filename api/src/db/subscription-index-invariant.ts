export const EFFECTIVE_SUBSCRIPTION_STATUSES = [
  "TRIALING",
  "INCOMPLETE",
  "ACTIVE",
  "PAST_DUE",
  "PAUSED",
  "CANCEL_AT_PERIOD_END",
] as const;

export const EFFECTIVE_SUBSCRIPTION_INDEX_NAME = "uq_tenant_effective_subscription";
export const EFFECTIVE_SUBSCRIPTION_INDEX_KEY = { tenantId: 1 } as const;
export const EFFECTIVE_SUBSCRIPTION_INDEX_FILTER = {
  status: { $in: [...EFFECTIVE_SUBSCRIPTION_STATUSES] },
};

export interface SubscriptionIndexDescription {
  name?: string;
  key?: Record<string, unknown>;
  unique?: boolean;
  partialFilterExpression?: Record<string, unknown>;
}

export interface SubscriptionIndexInvariantCollection {
  indexes(): Promise<SubscriptionIndexDescription[]>;
  aggregate(pipeline: Record<string, unknown>[]): { toArray(): Promise<Array<{ count?: number }>> };
}

export interface SubscriptionIndexInvariantReport {
  valid: boolean;
  targetExists: boolean;
  targetValid: boolean;
  obsoleteUniqueIndexes: string[];
  effectiveDuplicateTenantCount: number;
  issues: Array<
    | "TARGET_INDEX_MISSING"
    | "TARGET_INDEX_DEFINITION_MISMATCH"
    | "OBSOLETE_TENANT_UNIQUE_INDEX"
    | "EFFECTIVE_SUBSCRIPTION_DUPLICATES"
  >;
}

export function sameIndexDocument(left: unknown, right: unknown): boolean {
  return JSON.stringify(left ?? null) === JSON.stringify(right ?? null);
}

export function isTenantUniqueIndex(index: SubscriptionIndexDescription): boolean {
  return index.unique === true && sameIndexDocument(index.key, EFFECTIVE_SUBSCRIPTION_INDEX_KEY);
}

export function isExactEffectiveSubscriptionIndex(index: SubscriptionIndexDescription | undefined): boolean {
  return Boolean(
    index
    && index.name === EFFECTIVE_SUBSCRIPTION_INDEX_NAME
    && isTenantUniqueIndex(index)
    && sameIndexDocument(index.partialFilterExpression, EFFECTIVE_SUBSCRIPTION_INDEX_FILTER),
  );
}

export async function inspectSubscriptionIndexInvariant(
  collection: SubscriptionIndexInvariantCollection,
): Promise<SubscriptionIndexInvariantReport> {
  let indexes: SubscriptionIndexDescription[] = [];
  try {
    indexes = await collection.indexes();
  } catch (error) {
    if (!(error && typeof error === "object" && "code" in error && (error as { code?: unknown }).code === 26)) throw error;
  }

  const target = indexes.find((index) => index.name === EFFECTIVE_SUBSCRIPTION_INDEX_NAME);
  const targetValid = isExactEffectiveSubscriptionIndex(target);
  const obsoleteUniqueIndexes = indexes
    .filter(isTenantUniqueIndex)
    .filter((index) => index.name !== EFFECTIVE_SUBSCRIPTION_INDEX_NAME)
    .map((index) => index.name)
    .filter((name): name is string => Boolean(name));
  const conflicts = await collection.aggregate([
    { $match: { status: { $in: [...EFFECTIVE_SUBSCRIPTION_STATUSES] } } },
    { $group: { _id: "$tenantId", count: { $sum: 1 } } },
    { $match: { count: { $gt: 1 } } },
    { $count: "count" },
  ]).toArray();
  const effectiveDuplicateTenantCount = Number(conflicts[0]?.count ?? 0);
  const issues: SubscriptionIndexInvariantReport["issues"] = [];
  if (!target) issues.push("TARGET_INDEX_MISSING");
  else if (!targetValid) issues.push("TARGET_INDEX_DEFINITION_MISMATCH");
  if (obsoleteUniqueIndexes.length > 0) issues.push("OBSOLETE_TENANT_UNIQUE_INDEX");
  if (effectiveDuplicateTenantCount > 0) issues.push("EFFECTIVE_SUBSCRIPTION_DUPLICATES");
  return {
    valid: issues.length === 0,
    targetExists: Boolean(target),
    targetValid,
    obsoleteUniqueIndexes,
    effectiveDuplicateTenantCount,
    issues,
  };
}
