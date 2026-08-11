/**
 * Audit log formatting utilities.
 *
 * Provides human-readable labels for audit event resource types,
 * actions, and change descriptions. Used by both the tenant and
 * platform audit log pages.
 *
 * Every function takes the translation helpers as an *optional* trailing
 * argument. Called without them the output is byte-identical to the
 * pre-i18n behaviour, which keeps non-localized callers and the existing
 * unit tests working unchanged.
 */

import { codeLabel } from "@/lib/i18n/code-label";

/** The `t` / `tPlural` pair, as supplied by `useI18n()`. */
export interface AuditI18n {
  t: (key: string, params?: Record<string, string>) => string;
  tPlural: (key: string, count: number, params?: Record<string, string>) => string;
}

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
 *
 * Falls back to the raw value when unmapped — deliberately *not* humanized,
 * because an unmapped type is a backend model name rather than prose, and
 * showing it verbatim makes the mismatch obvious.
 */
export function resourceLabel(
  resourceType: string,
  t?: (key: string) => string,
): string {
  if (t) {
    const key = `audit.resource.${resourceType.toLowerCase()}`;
    const translated = t(key);
    if (translated !== key) return translated;
  }
  return RESOURCE_LABELS[resourceType] ?? resourceType;
}

// ── Action labels ────────────────────────────────────────────────────────────

/**
 * Render a raw action string (e.g. "USER_UPDATED") as a human-readable label
 * (e.g. "User Updated").
 *
 * The backend defines ~200 actions and only the common ones are translated;
 * `codeLabel` degrades the rest to the same humanized English this function
 * has always produced.
 */
export function actionLabel(
  action: string,
  t?: (key: string) => string,
): string {
  if (t) return codeLabel(t, "audit.action", action);

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
  i18n?: AuditI18n,
): string | null {
  if (!changes || Object.keys(changes).length === 0) return null;

  // Legacy AUDIT_QUERIED events — render as a summary, not raw JSON
  if (action === "AUDIT_QUERIED") {
    const c = changes as AuditChanges;
    const op = c.operation;
    const count = typeof c.count === "number" ? c.count : undefined;
    if (op === "list" && count !== undefined) {
      return i18n
        ? i18n.tPlural("audit.changes.listed", count)
        : `Listed ${count} audit record${count === 1 ? "" : "s"}`;
    }
    if (op === "detail") {
      return i18n ? i18n.t("audit.changes.viewedDetail") : "Viewed audit record detail";
    }
    if (i18n) {
      return i18n.t("audit.changes.query", {
        operation: op ?? i18n.t("audit.changes.unknownOperation"),
      });
    }
    return `Audit query (${op ?? "unknown"})`;
  }

  // AUDIT_EXPORTED events
  if (action === "AUDIT_EXPORTED") {
    const c = changes as AuditChanges;
    const count = typeof c.count === "number" ? c.count : undefined;
    if (count === undefined) {
      return i18n ? i18n.t("audit.changes.exportedAll") : "Exported audit logs";
    }
    return i18n
      ? i18n.tPlural("audit.changes.exported", count)
      : `Exported ${count} audit record${count === 1 ? "" : "s"}`;
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
