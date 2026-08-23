import { describe, it, expect } from "vitest";
import { Permission, type PermissionValue } from "@/types/api/permissions.types";
import {
  NAV_ACTION_TOOLS,
  NAV_GUIDE_FLOWS,
  navActionToolsFor,
  navGuideFlowsFor,
  navQuickGuidesFor,
  permittedNavActionTools,
  permittedSectionQuickGuides,
} from "@/lib/copilot/nav-actions";
import { ACTION_CATALOG } from "@/lib/copilot/action-catalog";

describe("nav-action tools registry", () => {
  it("maps each sidebar section to the matching action quick guides", () => {
    expect(navActionToolsFor("/dashboard/documents")).toEqual([
      "document.search",
      "document.get",
      "document.updateMetadata",
      "document.archive",
      "document.restore",
      "document.softDelete",
      "document.permanentDelete",
    ]);
    expect(navActionToolsFor("/dashboard/users")).toEqual([
      "user.invite",
      "user.resendInvitation",
      "user.revokeInvitation",
      "user.delete",
    ]);
    expect(navActionToolsFor("/dashboard/settings")).toEqual([]);
  });

  it("maps sections backed by guide flows to their flow chips", () => {
    expect(navGuideFlowsFor("/dashboard/roles")).toEqual(["roles.create"]);
    expect(navGuideFlowsFor("/dashboard/settings/document-taxonomy")).toEqual([
      "taxonomy.manage",
    ]);
    expect(navGuideFlowsFor("/dashboard/settings/billing")).toEqual([
      "billing.open",
    ]);
    expect(navGuideFlowsFor("/company/usage")).toEqual(["usage.view"]);
    expect(navGuideFlowsFor("/dashboard/settings")).toEqual(["settings.open"]);
  });

  it("sections without matching quick guides get no action button", () => {
    for (const href of [
      "/dashboard",
      "/dashboard/audit",
      "/dashboard/emails",
      "/dashboard/chat",
      "/dashboard/knowledge-gaps",
      "/dashboard/analytics",
      "/super-admin/companies",
    ]) {
      expect(navQuickGuidesFor(href), href).toBeNull();
    }
  });

  it("every mapped tool exists in the action catalog", () => {
    const catalogToolNames = new Set(ACTION_CATALOG.map((entry) => entry.toolName));
    for (const toolNames of Object.values(NAV_ACTION_TOOLS)) {
      for (const toolName of toolNames) {
        expect(catalogToolNames.has(toolName), toolName).toBe(true);
      }
    }
  });

  it("every mapped flow exists in the navigation flow registry", () => {
    const knownFlows = [
      "settings.open",
      "roles.create",
      "taxonomy.manage",
      "billing.open",
      "usage.view",
    ];
    for (const flowIds of Object.values(NAV_GUIDE_FLOWS)) {
      for (const flowId of flowIds) {
        expect(knownFlows, flowId).toContain(flowId);
      }
    }
  });
});

describe("permittedNavActionTools", () => {
  const denyAll: (permission: PermissionValue) => boolean = () => false;
  const allowAll: (permission: PermissionValue) => boolean = () => true;

  it("returns null for sections with no action tools", () => {
    expect(permittedNavActionTools("/dashboard", allowAll)).toBeNull();
    expect(permittedNavActionTools("/dashboard/settings/billing", allowAll)).toBeNull();
  });

  it("returns null when no mapped tool is permitted", () => {
    expect(permittedNavActionTools("/dashboard/documents", denyAll)).toBeNull();
    expect(permittedNavActionTools("/dashboard/settings", denyAll)).toBeNull();
  });

  it("filters the section tools through the permission gate", () => {
    const can = (permission: PermissionValue) =>
      permission === Permission.DOCUMENTS_READ;
    expect(permittedNavActionTools("/dashboard/documents", can)).toEqual([
      "document.search",
      "document.get",
    ]);
  });

  it("returns the full permitted section list", () => {
    expect(permittedNavActionTools("/dashboard/users", allowAll)).toEqual([
      "user.invite",
      "user.resendInvitation",
      "user.revokeInvitation",
      "user.delete",
    ]);
  });
});

describe("permittedSectionQuickGuides", () => {
  const denyAll: (permission: PermissionValue) => boolean = () => false;
  const allowAll: (permission: PermissionValue) => boolean = () => true;

  it("combines tools and flows for sections that carry both", () => {
    expect(permittedSectionQuickGuides("/dashboard/settings", allowAll)).toEqual(
      { tools: [], flows: ["settings.open"] },
    );
    expect(permittedSectionQuickGuides("/dashboard/roles", allowAll)).toEqual({
      tools: [],
      flows: ["roles.create"],
    });
  });

  it("returns flows-only descriptors for flow-backed sections", () => {
    expect(
      permittedSectionQuickGuides(
        "/dashboard/settings/document-taxonomy",
        allowAll,
      ),
    ).toEqual({ tools: [], flows: ["taxonomy.manage"] });
    expect(
      permittedSectionQuickGuides("/dashboard/settings/billing", allowAll),
    ).toEqual({ tools: [], flows: ["billing.open"] });
    expect(permittedSectionQuickGuides("/company/usage", allowAll)).toEqual({
      tools: [],
      flows: ["usage.view"],
    });
  });

  it("gates flows through their required permission", () => {
    const canRoleCreate = (permission: PermissionValue) =>
      permission === Permission.ROLES_CREATE;
    expect(
      permittedSectionQuickGuides("/dashboard/roles", canRoleCreate),
    ).toEqual({ tools: [], flows: ["roles.create"] });
    // Taxonomy needs COMPANY_SETTINGS_READ — not granted here.
    expect(
      permittedSectionQuickGuides("/dashboard/roles", denyAll),
    ).toBeNull();
    expect(
      permittedSectionQuickGuides("/dashboard/settings/document-taxonomy", denyAll),
    ).toBeNull();
  });

  it("returns null when nothing is permitted", () => {
    expect(
      permittedSectionQuickGuides("/dashboard/documents", denyAll),
    ).toBeNull();
    expect(
      permittedSectionQuickGuides("/dashboard/settings", denyAll),
    ).toBeNull();
    expect(permittedSectionQuickGuides("/dashboard/roles", denyAll)).toBeNull();
  });
});
