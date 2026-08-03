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

  it("hides the System Overview link for standard employees even with analytics access", () => {
    const links = filterNavigationLinks(
      TENANT_SIDEBAR_LINKS,
      "ready",
      withPermissions(Permission.ANALYTICS_READ, Permission.DOCUMENTS_READ),
      "EMPLOYEE",
    );
    expect(links.map((link) => link.href)).toEqual(["/dashboard/documents", "/dashboard/analytics"]);
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
