import type {
  PlatformSubscriptionRecord,
  SubscriptionProvisionInput,
  SubscriptionStatus,
  SubscriptionUpdateInput,
} from "@/types/api/super-admin.types";

export function buildProvisionInput(
  packageId: string,
  status: "trialing" | "active",
  reason: string,
): SubscriptionProvisionInput {
  return { packageId, status, expectedVersion: 0, reason: reason.trim() };
}

export function buildUpdateInput(
  existing: PlatformSubscriptionRecord,
  target: { packageId?: string; status?: string },
  reason: string,
): SubscriptionUpdateInput {
  const currentPackageId = existing.packageId._id;
  const currentStatus = existing.status.toLowerCase();
  const packageId = target.packageId && target.packageId !== currentPackageId
    ? target.packageId
    : undefined;
  const status = target.status && target.status.toLowerCase() !== currentStatus
    ? target.status.toLowerCase() as SubscriptionStatus
    : undefined;
  return {
    ...(packageId ? { packageId } : {}),
    ...(status ? { status } : {}),
    expectedVersion: existing.version,
    reason: reason.trim(),
  };
}

export function validateSubscriptionReason(reason: string): string | null {
  const value = reason.trim();
  if (value.length < 10) return "Reason must contain at least 10 characters.";
  if (value.length > 1000) return "Reason must contain at most 1000 characters.";
  return null;
}
