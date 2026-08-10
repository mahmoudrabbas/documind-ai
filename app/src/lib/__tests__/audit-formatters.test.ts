import { describe, it, expect } from "vitest";
import {
  actionLabel,
  resourceLabel,
  describeChanges,
} from "../audit-formatters";
import { t as translate, tPlural as pluralize } from "../i18n/i18n.utils";
import dictionaries from "../i18n/translations";

describe("actionLabel", () => {
  it("converts SCREAMING_SNAKE to Title Case", () => {
    expect(actionLabel("USER_UPDATED")).toBe("User Updated");
  });

  it("converts AUDIT_QUERIED to Audit Queried", () => {
    expect(actionLabel("AUDIT_QUERIED")).toBe("Audit Queried");
  });

  it("converts single-word actions", () => {
    expect(actionLabel("SYSTEM_STARTUP")).toBe("System Startup");
  });

  it("handles DOCUMENT_UPLOADED", () => {
    expect(actionLabel("DOCUMENT_UPLOADED")).toBe("Document Uploaded");
  });

  it("handles PAYMENT_EVENT_RECEIVED", () => {
    expect(actionLabel("PAYMENT_EVENT_RECEIVED")).toBe("Payment Event Received");
  });
});

describe("resourceLabel", () => {
  it("maps known resource types to human-readable labels", () => {
    expect(resourceLabel("User")).toBe("Users");
    expect(resourceLabel("Role")).toBe("Roles");
    expect(resourceLabel("Document")).toBe("Documents");
    expect(resourceLabel("Package")).toBe("Packages");
    expect(resourceLabel("Subscription")).toBe("Subscriptions");
    expect(resourceLabel("Tenant")).toBe("Companies");
    expect(resourceLabel("Session")).toBe("Sessions");
    expect(resourceLabel("System")).toBe("System");
    expect(resourceLabel("Permission")).toBe("Permissions");
  });

  it("returns raw value for unknown resource types", () => {
    expect(resourceLabel("CustomThing")).toBe("CustomThing");
    expect(resourceLabel("audit_logs")).toBe("audit_logs");
  });
});

describe("describeChanges", () => {
  it("returns null for undefined changes", () => {
    expect(describeChanges("USER_UPDATED", undefined)).toBeNull();
  });

  it("returns null for empty changes", () => {
    expect(describeChanges("USER_UPDATED", {})).toBeNull();
  });

  it("renders AUDIT_QUERIED list events as summary", () => {
    const result = describeChanges("AUDIT_QUERIED", {
      operation: "list",
      count: 100,
      filters: {},
    });
    expect(result).toBe("Listed 100 audit records");
  });

  it("renders AUDIT_QUERIED singular", () => {
    const result = describeChanges("AUDIT_QUERIED", {
      operation: "list",
      count: 1,
      filters: {},
    });
    expect(result).toBe("Listed 1 audit record");
  });

  it("renders AUDIT_QUERIED detail events", () => {
    const result = describeChanges("AUDIT_QUERIED", {
      operation: "detail",
      count: 1,
    });
    expect(result).toBe("Viewed audit record detail");
  });

  it("renders AUDIT_EXPORTED events", () => {
    const result = describeChanges("AUDIT_EXPORTED", {
      count: 50,
      filters: { dateFrom: "2025-01-01" },
    });
    expect(result).toBe("Exported 50 audit records");
  });

  it("renders mutation events with before/after changes", () => {
    const result = describeChanges("USER_UPDATED", {
      status: { before: "active", after: "disabled" },
    });
    expect(result).toBe("status: active → disabled");
  });

  it("renders mutation events with simple field changes", () => {
    const result = describeChanges("DOCUMENT_DELETED", {
      deletedAt: "2025-01-01",
    });
    expect(result).toBe("deletedAt");
  });

  it("limits display to 3 fields", () => {
    const result = describeChanges("USER_UPDATED", {
      field1: "a",
      field2: "b",
      field3: "c",
      field4: "d",
    });
    expect(result).toBe("field1, field2, field3");
  });

  it("returns null when changes only contain operation/count/filters", () => {
    const result = describeChanges("SOME_ACTION", {
      operation: "list",
      count: 5,
      filters: { action: "USER_UPDATED" },
    });
    expect(result).toBeNull();
  });
});

/**
 * The i18n-aware paths. Everything above calls these functions without the
 * optional translation helpers and must keep producing the original English —
 * that is what makes this addition safe for non-localized callers.
 */
describe("audit formatters with translations", () => {
  const tFor = (locale: "en" | "ar") =>
    (key: string, params?: Record<string, string>) =>
      translate(dictionaries[locale], key, params);

  const i18nFor = (locale: "en" | "ar") => ({
    t: tFor(locale),
    tPlural: (key: string, count: number, params?: Record<string, string>) =>
      pluralize(dictionaries[locale], locale, key, count, params),
  });

  describe("actionLabel", () => {
    it("translates a mapped action", () => {
      expect(actionLabel("USER_UPDATED", tFor("ar"))).toBe("تم تحديث المستخدم");
      expect(actionLabel("DOCUMENT_UPLOADED", tFor("ar"))).toBe("تم رفع مستند");
    });

    it("falls back to humanized English for an unmapped action", () => {
      /* Only the common actions are translated; the backend defines ~200. */
      expect(actionLabel("BILLING_REFUND_RETRY_SCHEDULED", tFor("ar"))).toBe(
        "Billing Refund Retry Scheduled",
      );
    });

    it("never leaks a raw dotted key", () => {
      for (const action of ["USER_UPDATED", "SOME_UNMAPPED_ACTION"]) {
        for (const locale of ["en", "ar"] as const) {
          expect(actionLabel(action, tFor(locale))).not.toContain("audit.action");
        }
      }
    });
  });

  describe("resourceLabel", () => {
    it("translates a mapped resource type", () => {
      expect(resourceLabel("Document", tFor("ar"))).toBe("المستندات");
    });

    it("keeps the raw value for an unmapped type rather than humanizing it", () => {
      expect(resourceLabel("CustomThing", tFor("ar"))).toBe("CustomThing");
    });
  });

  describe("describeChanges", () => {
    it("uses the Arabic dual form for a count of two", () => {
      /* `count === 1 ? x : y` cannot express this — Arabic has a distinct
         dual, which is the whole reason these go through tPlural. */
      const result = describeChanges(
        "AUDIT_QUERIED",
        { operation: "list", count: 2 },
        i18nFor("ar"),
      );
      expect(result).toBe("تم عرض سجلَّي تدقيق");
    });

    it("selects a different Arabic form for one, few, and many", () => {
      const forCount = (count: number) =>
        describeChanges("AUDIT_QUERIED", { operation: "list", count }, i18nFor("ar"));

      const forms = new Set([forCount(1), forCount(3), forCount(11)]);
      expect(forms.size).toBe(3);
    });

    it("still pluralizes English correctly through the dictionary", () => {
      const one = describeChanges(
        "AUDIT_QUERIED",
        { operation: "list", count: 1 },
        i18nFor("en"),
      );
      const many = describeChanges(
        "AUDIT_QUERIED",
        { operation: "list", count: 100 },
        i18nFor("en"),
      );
      expect(one).toBe("Listed 1 audit record");
      expect(many).toBe("Listed 100 audit records");
    });

    it("translates the export and detail summaries", () => {
      expect(
        describeChanges("AUDIT_EXPORTED", { count: 5 }, i18nFor("ar")),
      ).toBe("تم تصدير {{count}} سجلات تدقيق".replace("{{count}}", "5"));
      expect(
        describeChanges("AUDIT_QUERIED", { operation: "detail" }, i18nFor("ar")),
      ).toBe("تم عرض تفاصيل سجل التدقيق");
    });

    it("never leaves an uninterpolated placeholder on screen", () => {
      for (const locale of ["en", "ar"] as const) {
        for (const count of [0, 1, 2, 3, 11, 100]) {
          const listed = describeChanges(
            "AUDIT_QUERIED",
            { operation: "list", count },
            i18nFor(locale),
          );
          expect(listed).not.toContain("{{");
        }
      }
    });
  });
});
