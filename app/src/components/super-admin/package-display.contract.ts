import type { PackageEntitlements } from "@/types/api/super-admin.types";

type LegacyPackageLimits = {
  users: number;
  documents: number;
  questionsPerMonth: number;
  storageMb: number;
};

type PackageEntitlementSource = {
  entitlements?: Partial<PackageEntitlements> | null;
  limits?: Partial<LegacyPackageLimits> | null;
};

export function resolvePackageEntitlement(
  source: PackageEntitlementSource,
  entitlement: keyof PackageEntitlements,
  legacyLimit?: keyof LegacyPackageLimits,
): number | undefined {
  const currentValue = source.entitlements?.[entitlement];
  if (currentValue !== undefined && currentValue !== null) return currentValue;
  return legacyLimit ? source.limits?.[legacyLimit] : undefined;
}
