import { describe, expect, it } from "vitest";
import { getDocumentsEmptyState } from "../documents/empty-state";

describe("getDocumentsEmptyState", () => {
  it("prefers a generic filtered result state when filters are active", () => {
    expect(getDocumentsEmptyState({
      hasActiveFilters: true,
      showArchived: false,
      canCreate: false,
      canManageAccess: false,
    })).toBe("filtered");
  });

  it("keeps archived-empty distinct from the active document list", () => {
    expect(getDocumentsEmptyState({
      hasActiveFilters: false,
      showArchived: true,
      canCreate: false,
      canManageAccess: false,
    })).toBe("archived");
  });

  it("uses a generic access-empty state only for an unfiltered restricted view", () => {
    expect(getDocumentsEmptyState({
      hasActiveFilters: false,
      showArchived: false,
      canCreate: false,
      canManageAccess: false,
    })).toBe("access");
  });

  it("uses the tenant-empty state when the actor can manage or create documents", () => {
    expect(getDocumentsEmptyState({
      hasActiveFilters: false,
      showArchived: false,
      canCreate: true,
      canManageAccess: false,
    })).toBe("tenant");
  });
});
