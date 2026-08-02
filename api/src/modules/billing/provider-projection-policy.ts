export interface ProviderProjectionGuardInput {
  currentlyAppliedObservedAt: Date | null;
  incomingObservedAt: Date;
  currentFingerprint: string | null;
  incomingFingerprint: string;
  readCurrentProviderState: boolean;
}

/** Event IDs and event creation times are diagnostic only. A current provider read is authoritative. */
export function shouldApplyProviderProjection(input: ProviderProjectionGuardInput): boolean {
  if (!input.readCurrentProviderState) return false;
  if (!input.currentlyAppliedObservedAt) return true;
  if (input.incomingObservedAt.getTime() >= input.currentlyAppliedObservedAt.getTime()) return true;
  return input.currentFingerprint === input.incomingFingerprint;
}

export function providerStateFingerprint(value: Record<string, unknown>): string {
  return JSON.stringify(Object.fromEntries(Object.entries(value).filter(([key]) => !["sourceId", "sourceTimestamp", "lastProviderEventId", "lastProviderEventTimestamp"].includes(key)).sort(([a], [b]) => a.localeCompare(b))));
}
