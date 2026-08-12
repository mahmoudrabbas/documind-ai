import { describe, expect, it } from "vitest";
import {
  PLATFORM_NAV_GROUPS,
  PLATFORM_NAV_ITEMS,
} from "@/constants/platform-navigation";

const EXPECTED_GROUP_MEMBERSHIP: Record<string, readonly string[]> = {
  overview: ["/super-admin"],
  customers: ["/super-admin/companies", "/super-admin/users"],
  billing: [
    "/super-admin/packages",
    "/super-admin/subscriptions",
    "/super-admin/payments",
    "/super-admin/refunds",
    "/super-admin/entitlement",
  ],
  operations: [
    "/super-admin/jobs",
    "/super-admin/processing-overview",
    "/super-admin/system-health",
  ],
  intelligence: [
    "/super-admin/ai-configuration",
    "/super-admin/retrieval-debug",
    "/super-admin/usage",
    "/super-admin/analytics",
  ],
  governance: ["/super-admin/audit", "/super-admin/settings"],
};

describe("platform navigation configuration", () => {
  it("defines six groups in navigation order", () => {
    expect(PLATFORM_NAV_GROUPS.map((group) => group.id)).toEqual([
      "overview",
      "customers",
      "billing",
      "operations",
      "intelligence",
      "governance",
    ]);
  });

  it("flattens to seventeen nav items", () => {
    expect(PLATFORM_NAV_ITEMS).toHaveLength(17);
  });

  it("places every flat item in exactly one group", () => {
    const hrefOccurrences = new Map<string, number>();
    for (const group of PLATFORM_NAV_GROUPS) {
      for (const item of group.items) {
        hrefOccurrences.set(
          item.href,
          (hrefOccurrences.get(item.href) ?? 0) + 1,
        );
      }
    }
    for (const item of PLATFORM_NAV_ITEMS) {
      expect(hrefOccurrences.get(item.href)).toBe(1);
    }
  });

  it("groups items by expected membership", () => {
    for (const group of PLATFORM_NAV_GROUPS) {
      expect(group.items.map((item) => item.href)).toEqual(
        EXPECTED_GROUP_MEMBERSHIP[group.id],
      );
    }
  });

  it("gives every item a label, href, icon, and required permission", () => {
    for (const item of PLATFORM_NAV_ITEMS) {
      expect(item.label.length).toBeGreaterThan(0);
      expect(item.href.length).toBeGreaterThan(0);
      expect(item.icon.length).toBeGreaterThan(0);
      expect(item.requiredPermissions.length).toBeGreaterThan(0);
    }
  });

  it("keeps the overview group expanded by default", () => {
    const overview = PLATFORM_NAV_GROUPS.find(
      (group) => group.id === "overview",
    );
    expect(overview?.defaultOpen).toBe(true);
  });
});
