import { describe, it, expect } from "vitest";
import {
  getGuideTarget,
  GUIDE_TARGET_IDS,
  GUIDE_TARGETS,
  guideTargetSelector,
  isKnownGuideTarget,
} from "@/lib/copilot/guide-targets";

describe("guide-targets registry", () => {
  it("has unique ids with stable naming", () => {
    const ids = GUIDE_TARGETS.map((entry) => entry.targetId);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) {
      expect(id).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    }
  });

  it("every entry carries a route and description", () => {
    for (const entry of GUIDE_TARGETS) {
      expect(entry.route).toBeTruthy();
      expect(entry.description).toBeTruthy();
    }
  });

  it("resolves known ids and rejects unknown ids", () => {
    expect(isKnownGuideTarget("documents-upload-button")).toBe(true);
    expect(isKnownGuideTarget("not-a-real-target")).toBe(false);
    expect(getGuideTarget("nav-chat")?.route).toBe("/dashboard/chat");
    expect(getGuideTarget("nope")).toBeUndefined();
  });

  it("builds a selector only for registered ids", () => {
    expect(guideTargetSelector("documents-dropzone")).toBe(
      '[data-guide-id="documents-dropzone"]',
    );
    expect(guideTargetSelector("made-up")).toBeNull();
  });

  it("mirrors the backend registry ids (guideTargets.ts)", () => {
    const expected = [
      "nav-documents",
      "nav-users",
      "nav-settings",
      "nav-chat",
      "nav-billing",
      "nav-overview",
      "nav-roles",
      "nav-company-usage",
      "nav-document-taxonomy",
      "nav-audit",
      "nav-emails",
      "nav-knowledge-gaps",
      "nav-analytics",
      "nav-processing-failed",
      "nav-sa-overview",
      "nav-sa-companies",
      "nav-sa-packages",
      "nav-sa-subscriptions",
      "nav-sa-users",
      "nav-sa-usage",
      "nav-sa-jobs",
      "nav-sa-processing-overview",
      "nav-sa-system-health",
      "nav-sa-retrieval-debug",
      "nav-sa-ai-configuration",
      "nav-sa-audit",
      "nav-sa-settings",
      "nav-sa-payments",
      "nav-sa-refunds",
      "nav-sa-entitlement",
      "nav-sa-analytics",
      "section-content",
      "page-heading-overview",
      "page-heading-documents",
      "page-heading-users",
      "page-heading-roles",
      "page-heading-billing",
      "page-heading-usage",
      "page-heading-settings",
      "page-heading-document-taxonomy",
      "page-heading-audit",
      "page-heading-emails",
      "page-heading-knowledge-gaps",
      "page-heading-analytics",
      "page-heading-processing-failed",
      "page-heading-chat",
      "analytics-charts",
      "analytics-export",
      "analytics-filter-bar",
      "audit-table",
      "billing-change-plan",
      "billing-choose-plan",
      "billing-invoices",
      "billing-refunds",
      "chat-feedback",
      "chat-image-attach",
      "chat-new-conversation",
      "chat-sources",
      "chat-suggestions",
      "chat-voice-input",
      "documents-drawer",
      "documents-drawer-download",
      "documents-drawer-processing",
      "documents-drawer-versions",
      "documents-duplicate-warning",
      "documents-pagination",
      "documents-table",
      "documents-upload-button",
      "documents-upload-progress",
      "emails-details-button",
      "emails-resend-button",
      "emails-table",
      "knowledge-gaps-detail-link",
      "knowledge-gaps-filter",
      "knowledge-gaps-metrics",
      "knowledge-gaps-table",
      "overview-activity",
      "overview-gaps",
      "overview-metrics",
      "overview-refresh",
      "overview-subscription",
      "overview-summary",
      "processing-failed-reprocess",
      "processing-failed-retry",
      "processing-failed-table",
      "roles-filter-bar",
      "roles-permissions-editor",
      "roles-table",
      "settings-ai-preferences",
      "settings-discard",
      "settings-language",
      "settings-session-security",
      "settings-taxonomy-link",
      "taxonomy-table",
      "taxonomy-tabs",
      "usage-quota-grid",
      "users-import-button",
      "users-pagination",
      "users-role-filter",
      "users-search-input",
      "documents-dropzone",
      "documents-title-input",
      "documents-description-input",
      "documents-tags-input",
      "documents-upload-submit",
      "documents-search-input",
      "documents-search-button",
      "documents-table-row-menu",
      "documents-view-button",
      "documents-archived-filter",
      "documents-drawer-archive",
      "documents-drawer-restore",
      "documents-drawer-replace",
      "documents-drawer-replace-file",
      "documents-drawer-replace-submit",
      "taxonomy-create-button",
      "users-invite-button",
      "users-invite-form-name",
      "users-invite-form-email",
      "users-invite-form-role",
      "users-invite-form-submit",
      "users-resend-button",
      "users-revoke-button",
      "users-delete-button",
      "roles-create-button",
      "roles-create-name",
      "roles-create-submit",
      "chat-message-input",
      "chat-send-button",
      "settings-profile-section",
      "settings-profile-save",
      "settings-billing-tab",
    ];
    expect([...GUIDE_TARGET_IDS].sort()).toEqual([...expected].sort());
  });
});
