import type { TenantLifecyclePreview } from "@/types/api/platform.types";

export type TenantLifecycleTargetStatus = "active" | "suspended";

export function lifecyclePreviewRequestKey(
  tenantId: string,
  targetStatus: TenantLifecycleTargetStatus,
): string {
  return `${tenantId}:${targetStatus}`;
}

export function createLifecyclePreviewRequestTracker() {
  let activeKey: string | null = null;
  let completedKey: string | null = null;

  return {
    start(key: string): boolean {
      if (activeKey === key || completedKey === key) return false;
      activeKey = key;
      return true;
    },
    complete(key: string): void {
      if (activeKey === key) {
        activeKey = null;
        completedKey = key;
      }
    },
    cancel(key: string): void {
      if (activeKey === key) activeKey = null;
    },
    reset(key: string): void {
      if (activeKey === key) activeKey = null;
      if (completedKey === key) completedKey = null;
    },
  };
}

export function canConfirmTenantLifecycle(
  preview: TenantLifecyclePreview | null,
  reason: string,
  submitting: boolean,
): boolean {
  const trimmedReason = reason.trim();
  return Boolean(
    preview?.transitionAllowed &&
      !preview.alreadyInTargetState &&
      !submitting &&
      trimmedReason.length >= 3 &&
      trimmedReason.length <= 500,
  );
}

export function completeTenantLifecycleTransition(
  reload: () => void,
  close: () => void,
): void {
  reload();
  close();
}
