import { describe, expect, it } from "vitest";
import {
  PLATFORM_SIDEBAR_LINKS,
  TENANT_SIDEBAR_LINKS,
  filterNavigationLinks,
} from "@/constants/routes";
import { Permission, type PermissionValue } from "@/types/api/permissions.types";

function withPermissions(...held: PermissionValue[]) {
  const permissions = new Set(held);
  return (permission: PermissionValue) => permissions.has(permission);
}

describe("permission-driven navigation", () => {
  it("shows no links before effective permissions are ready", () => {
    expect(
      filterNavigationLinks(
        TENANT_SIDEBAR_LINKS,
        "loading",
        withPermissions(Permission.USERS_READ),
      ),
    ).toEqual([]);
  });

  it("platform links require held permissions", () => {
    const analyticsOnly = filterNavigationLinks(
      PLATFORM_SIDEBAR_LINKS,
      "ready",
      withPermissions(Permission.ANALYTICS_READ),
    );
    expect(analyticsOnly.map((link) => link.href)).toEqual([
      "/super-admin/usage",
      "/super-admin/analytics",
    ]);
    const billingOnly = filterNavigationLinks(
      PLATFORM_SIDEBAR_LINKS,
      "ready",
      withPermissions(Permission.BILLING_READ),
    );
    expect(billingOnly.map((link) => link.href)).toEqual([
      "/super-admin/packages",
      "/super-admin/subscriptions",
      "/super-admin/payments",
      "/super-admin/refunds",
    ]);
  });

  it("platform links are labeled correctly", () => {
    const links = filterNavigationLinks(
      PLATFORM_SIDEBAR_LINKS,
      "ready",
      withPermissions(...Object.values(Permission)),
    );
    expect(links.map((link) => link.href)).toEqual([
      "/super-admin",
      "/super-admin/companies",
      "/super-admin/users",
      "/super-admin/packages",
      "/super-admin/subscriptions",
      "/super-admin/payments",
      "/super-admin/refunds",
      "/super-admin/entitlement",
      "/super-admin/system-health",
      "/super-admin/ai-configuration",
      "/super-admin/usage",
      "/super-admin/analytics",
      "/super-admin/audit",
      "/super-admin/settings",
    ]);
  });

  it("shows only tenant links backed by held permissions", () => {
    const links = filterNavigationLinks(
      TENANT_SIDEBAR_LINKS,
      "ready",
      withPermissions(
        Permission.ANALYTICS_READ,
        Permission.DOCUMENTS_READ,
        Permission.AUDIT_READ,
      ),
    );
    expect(links.map((link) => link.href)).toEqual([
      "/dashboard",
      "/dashboard/documents",
      "/dashboard/audit",
      "/dashboard/analytics",
    ]);
    expect(links.every((link) => link.context === "tenant")).toBe(true);
  });

  it("hides the System Overview link without analytics permission", () => {
    const links = filterNavigationLinks(
      TENANT_SIDEBAR_LINKS,
      "ready",
      withPermissions(Permission.DOCUMENTS_READ, Permission.AUDIT_READ),
    );
    expect(links.map((link) => link.href)).not.toContain("/dashboard");
  });

  it("shows analytics navigation to Employees with effective analytics access", () => {
    const links = filterNavigationLinks(
      TENANT_SIDEBAR_LINKS,
      "ready",
      withPermissions(Permission.ANALYTICS_READ, Permission.DOCUMENTS_READ),
      "EMPLOYEE",
    );
    expect(links.map((link) => link.href)).toEqual([
      "/dashboard",
      "/dashboard/documents",
      "/dashboard/analytics",
    ]);
  });

  it("hides analytics navigation from Employees without effective analytics access", () => {
    const links = filterNavigationLinks(
      TENANT_SIDEBAR_LINKS,
      "ready",
      withPermissions(Permission.DOCUMENTS_READ),
      "EMPLOYEE",
    );
    expect(links.map((link) => link.href)).toEqual(["/dashboard/documents"]);
  });

  it("keeps the System Overview link for company admins with analytics access", () => {
    const links = filterNavigationLinks(
      TENANT_SIDEBAR_LINKS,
      "ready",
      withPermissions(Permission.ANALYTICS_READ, Permission.DOCUMENTS_READ),
      "COMPANY_ADMIN",
    );
    expect(links.map((link) => link.href)).toContain("/dashboard");
  });

  it("keeps platform and tenant destinations isolated", () => {
    expect(
      PLATFORM_SIDEBAR_LINKS.every(
        (link) =>
          link.context === "platform" && !link.href.startsWith("/dashboard"),
      ),
    ).toBe(true);
    expect(
      TENANT_SIDEBAR_LINKS.every(
        (link) =>
          link.context === "tenant" && !link.href.startsWith("/super-admin"),
      ),
    ).toBe(true);
  });

  it("advertises analytics pages for tenant navigation", () => {
    const destinations = TENANT_SIDEBAR_LINKS.map((link) => link.href);
    expect(destinations).not.toContain("/chat");
    expect(destinations).toContain("/dashboard/analytics");
    expect(destinations).toContain("/dashboard/knowledge-gaps");
  });
});
