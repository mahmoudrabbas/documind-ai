// ── Counter dimensions ─────────────────────────────────────────────────────────
//
// The 8 numeric fields from PackageEntitlement that use atomic counters for
// quota enforcement. Each maps 1:1 to a PackageEntitlement number field.
//
// See: api/src/modules/billing/billing.types.ts (PackageEntitlement)

export type CounterDimension =
  | "employees"
  | "admins"
  | "documents"
  | "storageMb"
  | "fileSizeMb"
  | "queriesPerMonth"
  | "tokensPerMonth"
  | "ocrPagesPerMonth";

// ── Capability keys ────────────────────────────────────────────────────────────
//
// Non-counter checks derived from EntitlementSnapshot metadata fields. These
// are boolean / enum gates rather than counted resources.

export type CapabilityKey = "allowedModels" | "retentionDays";

// ── All dimensions ─────────────────────────────────────────────────────────────

export type EntitlementDimension = CounterDimension | CapabilityKey;

// ── Check result ───────────────────────────────────────────────────────────────
//
// Returned by the guard layer when a pre-flight entitlement check runs. The
// caller decides whether to honour `warning` (e.g. degrade UX) or hard-block.

export interface CheckResult {
  allowed: boolean;
  current: number;
  limit: number;
  warning?: boolean;
}

// ── Consume result ─────────────────────────────────────────────────────────────
//
// Returned after atomically incrementing a counter dimension. `committed`
// is true only when the increment was actually persisted; callers that need
// at-least-once semantics check this flag before proceeding.

export interface ConsumeResult {
  committed: boolean;
  current: number;
  limit: number;
  remaining: number;
}

// ── Model check input ──────────────────────────────────────────────────────────

export interface ModelCheckInput {
  tenantId: string;
  modelName: string;
}

// ── Denial payload ─────────────────────────────────────────────────────────────
//
// Structured error payload returned to the API layer when an entitlement
// check fails. The HTTP handler maps this into the appropriate response body.

export interface DenialPayload {
  error: "ENTITLEMENT_EXCEEDED";
  code: string;
  message: string;
  context: {
    current: number;
    limit: number;
    dimension: CounterDimension | CapabilityKey;
    periodReset: string;
  };
}

// ── Fail mode ──────────────────────────────────────────────────────────────────
//
// Determines behaviour when a quota check fails:
//   - "fail-closed" → block the operation (hard denial)
//   - "fail-open"   → warn but allow the operation (soft / degraded)

export type FailMode = "fail-closed" | "fail-open";

// ── Capability fail-mode map ───────────────────────────────────────────────────
//
// Every guard point must be listed here with its intended fail mode. New
// guard points should be added as they are introduced.

export const CapabilityFailMode: Record<string, FailMode> = {
  "user-invite": "fail-closed",
  "document-upload": "fail-closed",
  "ocr-processing": "fail-closed",
  "ai-query": "fail-closed",
  "model-selection": "fail-closed",
  "analytics-export": "fail-closed",
  "retention-jobs": "fail-open",
};
