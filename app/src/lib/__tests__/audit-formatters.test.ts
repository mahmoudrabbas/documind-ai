import { describe, it, expect } from "vitest";
import {
  actionLabel,
  resourceLabel,
  describeChanges,
} from "../audit-formatters";

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
