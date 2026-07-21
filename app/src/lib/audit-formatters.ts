/**
 * Audit log formatting utilities.
 *
 * Provides human-readable labels for audit event resource types,
 * actions, and change descriptions. Used by both the tenant and
 * platform audit log pages.
 */

// ── Resource type labels ─────────────────────────────────────────────────────

const RESOURCE_LABELS: Record<string, string> = {
  User: "Users",
  Role: "Roles",
  Document: "Documents",
  DocumentQuality: "Document Quality",
  OcrPageResult: "OCR Results",
  Package: "Packages",
  Subscription: "Subscriptions",
  PlatformSetting: "Platform Settings",
  Tenant: "Companies",
  Session: "Sessions",
  System: "System",
  Permission: "Permissions",
  EmailMessage: "Emails",
  PaymentEvent: "Payments",
};

/**
 * Map a raw resourceType value to a human-readable label.
 * Falls back to the raw value if no mapping exists.
 */
export function resourceLabel(resourceType: string): string {
  return RESOURCE_LABELS[resourceType] ?? resourceType;
}

// ── Action labels ────────────────────────────────────────────────────────────

/**
 * Render a raw action string (e.g. "USER_UPDATED") as a human-readable label
 * (e.g. "User Updated").
 */
export function actionLabel(action: string): string {
  return action
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

// ── Change descriptions ──────────────────────────────────────────────────────

interface AuditChanges {
  operation?: string;
  count?: number;
  filters?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Produce a short human-readable summary of the changes field for an audit entry.
 * Returns null when the changes object represents a read/query operation rather
 * than a meaningful data mutation.
 */
export function describeChanges(
  action: string,
  changes: Record<string, unknown> | undefined,
): string | null {
  if (!changes || Object.keys(changes).length === 0) return null;

  // Legacy AUDIT_QUERIED events — render as a summary, not raw JSON
  if (action === "AUDIT_QUERIED") {
    const c = changes as AuditChanges;
    const op = c.operation;
    const count = typeof c.count === "number" ? c.count : undefined;
    if (op === "list" && count !== undefined) {
      return `Listed ${count} audit record${count === 1 ? "" : "s"}`;
    }
    if (op === "detail") return "Viewed audit record detail";
    return `Audit query (${op ?? "unknown"})`;
  }

  // AUDIT_EXPORTED events
  if (action === "AUDIT_EXPORTED") {
    const c = changes as AuditChanges;
    const count = typeof c.count === "number" ? c.count : undefined;
    return count !== undefined
      ? `Exported ${count} audit record${count === 1 ? "" : "s"}`
      : "Exported audit logs";
  }

  // Standard mutation events — show changed fields
  const keys = Object.keys(changes).filter(
    (k) => k !== "operation" && k !== "count" && k !== "filters",
  );
  if (keys.length === 0) return null;
  return keys
    .slice(0, 3)
    .map((k) => {
      const val = changes[k];
      if (val && typeof val === "object" && "before" in val && "after" in val) {
        return `${k}: ${(val as { before: unknown }).before} → ${(val as { after: unknown }).after}`;
      }
      return k;
    })
    .join(", ");
}
