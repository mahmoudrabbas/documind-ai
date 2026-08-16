/**
 * Frontend mirror of the backend Guide Target Registry
 * (`api/src/modules/copilot/guide/guideTargets.ts`). This is the client-side
 * source of truth for which `data-guide-id` anchors exist and which routes they
 * live on. The parity test asserts that every `data-guide-id` used in the app
 * is present here, and every guide flow step target is resolvable.
 *
 * The backend registry is authoritative for server-side validation; this mirror
 * must stay in sync (keep ids and routes identical).
 */

import type { GuideTargetEntry } from "./copilot-types";

export const GUIDE_TARGETS: readonly GuideTargetEntry[] = [
  {
    targetId: "nav-documents",
    route: "/dashboard/documents",
    description: "Documents navigation link in sidebar",
    requiredPermissions: ["documents:read"],
  },
  {
    targetId: "nav-users",
    route: "/dashboard/users",
    description: "Users navigation link in sidebar",
    requiredPermissions: ["users:read"],
  },
  {
    targetId: "nav-settings",
    route: "/dashboard/settings",
    description: "Settings navigation link in sidebar",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "nav-chat",
    route: "/dashboard/chat",
    description: "Chat navigation link in sidebar",
    requiredPermissions: ["chat:read"],
  },
  {
    targetId: "nav-billing",
    route: "/dashboard/settings/billing",
    description: "Billing navigation link in sidebar",
    requiredPermissions: ["billing:read"],
  },
  {
    targetId: "nav-overview",
    route: "/dashboard",
    description: "Overview (dashboard) navigation link in sidebar",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "nav-roles",
    route: "/dashboard/roles",
    description: "Roles navigation link in sidebar",
    requiredPermissions: ["roles:read"],
  },
  {
    targetId: "nav-company-usage",
    route: "/company/usage",
    description: "Usage & Limits navigation link in sidebar",
    requiredPermissions: ["billing:read"],
  },
  {
    targetId: "nav-document-taxonomy",
    route: "/dashboard/settings/document-taxonomy",
    description: "Document Taxonomy navigation link in sidebar",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "nav-audit",
    route: "/dashboard/audit",
    description: "Audit Log navigation link in sidebar",
    requiredPermissions: ["audit:read"],
  },
  {
    targetId: "nav-emails",
    route: "/dashboard/emails",
    description: "Email Log navigation link in sidebar",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "nav-knowledge-gaps",
    route: "/dashboard/knowledge-gaps",
    description: "Knowledge Gaps navigation link in sidebar",
    requiredPermissions: ["knowledge-gaps:read"],
  },
  {
    targetId: "nav-analytics",
    route: "/dashboard/analytics",
    description: "Analytics & Insights navigation link in sidebar",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "nav-processing-failed",
    route: "/dashboard/processing-failed",
    description: "Failed Processing navigation link in sidebar",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "nav-sa-overview",
    route: "/super-admin",
    description: "Platform Overview navigation link in sidebar",
    requiredPermissions: ["audit:read"],
  },
  {
    targetId: "nav-sa-companies",
    route: "/super-admin/companies",
    description: "Platform Companies navigation link in sidebar",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "nav-sa-packages",
    route: "/super-admin/packages",
    description: "Platform Packages navigation link in sidebar",
    requiredPermissions: ["billing:read"],
  },
  {
    targetId: "nav-sa-subscriptions",
    route: "/super-admin/subscriptions",
    description: "Platform Subscriptions navigation link in sidebar",
    requiredPermissions: ["billing:read"],
  },
  {
    targetId: "nav-sa-users",
    route: "/super-admin/users",
    description: "Platform Users navigation link in sidebar",
    requiredPermissions: ["users:read"],
  },
  {
    targetId: "nav-sa-usage",
    route: "/super-admin/usage",
    description: "Platform Usage & Costs navigation link in sidebar",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "nav-sa-jobs",
    route: "/super-admin/jobs",
    description: "Platform Processing Jobs navigation link in sidebar",
    requiredPermissions: ["documents:read"],
  },
  {
    targetId: "nav-sa-processing-overview",
    route: "/super-admin/processing-overview",
    description: "Platform Processing Overview navigation link in sidebar",
    requiredPermissions: ["documents:read"],
  },
  {
    targetId: "nav-sa-system-health",
    route: "/super-admin/system-health",
    description: "Platform System Health navigation link in sidebar",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "nav-sa-retrieval-debug",
    route: "/super-admin/retrieval-debug",
    description: "Platform Retrieval Debug navigation link in sidebar",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "nav-sa-ai-configuration",
    route: "/super-admin/ai-configuration",
    description: "Platform AI Configuration navigation link in sidebar",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "nav-sa-audit",
    route: "/super-admin/audit",
    description: "Platform Security & Audit navigation link in sidebar",
    requiredPermissions: ["audit:read"],
  },
  {
    targetId: "nav-sa-settings",
    route: "/super-admin/settings",
    description: "Platform Global Settings navigation link in sidebar",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "nav-sa-payments",
    route: "/super-admin/payments",
    description: "Platform Payment Diagnostics navigation link in sidebar",
    requiredPermissions: ["billing:read"],
  },
  {
    targetId: "nav-sa-refunds",
    route: "/super-admin/refunds",
    description: "Platform Refund Reviews navigation link in sidebar",
    requiredPermissions: ["billing:read"],
  },
  {
    targetId: "nav-sa-entitlement",
    route: "/super-admin/entitlement",
    description: "Platform Quota Overrides navigation link in sidebar",
    requiredPermissions: ["billing:manage"],
  },
  {
    targetId: "nav-sa-analytics",
    route: "/super-admin/analytics",
    description: "Platform AI Analytics navigation link in sidebar",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "section-content",
    route: "/dashboard",
    description: "Shared content region rendered by the dashboard shell (all sections)",
    requiredPermissions: [],
  },
  {
    targetId: "page-heading-overview",
    route: "/dashboard",
    description: "Overview page heading",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "page-heading-documents",
    route: "/dashboard/documents",
    description: "Documents page heading",
    requiredPermissions: ["documents:read"],
  },
  {
    targetId: "page-heading-users",
    route: "/dashboard/users",
    description: "Users page heading",
    requiredPermissions: ["users:read"],
  },
  {
    targetId: "page-heading-roles",
    route: "/dashboard/roles",
    description: "Roles page heading",
    requiredPermissions: ["roles:read"],
  },
  {
    targetId: "page-heading-billing",
    route: "/dashboard/settings/billing",
    description: "Billing page heading",
    requiredPermissions: ["billing:read"],
  },
  {
    targetId: "page-heading-usage",
    route: "/company/usage",
    description: "Usage & Limits page heading",
    requiredPermissions: ["billing:read"],
  },
  {
    targetId: "page-heading-settings",
    route: "/dashboard/settings",
    description: "Settings page heading",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "page-heading-document-taxonomy",
    route: "/dashboard/settings/document-taxonomy",
    description: "Document Taxonomy page heading",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "page-heading-audit",
    route: "/dashboard/audit",
    description: "Audit Log page heading",
    requiredPermissions: ["audit:read"],
  },
  {
    targetId: "page-heading-emails",
    route: "/dashboard/emails",
    description: "Email Log page heading",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "page-heading-knowledge-gaps",
    route: "/dashboard/knowledge-gaps",
    description: "Knowledge Gaps page heading",
    requiredPermissions: ["knowledge-gaps:read"],
  },
  {
    targetId: "page-heading-chat",
    route: "/dashboard/chat",
    description: "Chat page heading",
    requiredPermissions: ["chat:read"],
  },
  {
    targetId: "page-heading-analytics",
    route: "/dashboard/analytics",
    description: "Analytics & Insights page heading",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "page-heading-processing-failed",
    route: "/dashboard/processing-failed",
    description: "Failed Processing page heading",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "documents-upload-button",
    route: "/dashboard/documents",
    description: "Upload document button on Documents page",
    requiredPermissions: ["documents:create"],
  },
  {
    targetId: "documents-dropzone",
    route: "/dashboard/documents",
    description: "File dropzone area for document upload",
    requiredPermissions: ["documents:create"],
  },
  {
    targetId: "documents-title-input",
    route: "/dashboard/documents",
    description: "Document title input field",
    requiredPermissions: ["documents:create"],
  },
  {
    targetId: "documents-description-input",
    route: "/dashboard/documents",
    description: "Document description textarea",
    requiredPermissions: ["documents:create"],
  },
  {
    targetId: "documents-tags-input",
    route: "/dashboard/documents",
    description: "Document tags input field",
    requiredPermissions: ["documents:create"],
  },
  {
    targetId: "documents-upload-submit",
    route: "/dashboard/documents",
    description: "Submit upload button",
    requiredPermissions: ["documents:create"],
  },
  {
    targetId: "documents-search-input",
    route: "/dashboard/documents",
    description: "Search documents input field",
    requiredPermissions: ["documents:read"],
  },
  {
    targetId: "documents-search-button",
    route: "/dashboard/documents",
    description: "Search submit button",
    requiredPermissions: ["documents:read"],
  },
  {
    targetId: "documents-table-row-menu",
    route: "/dashboard/documents",
    description: "Row action menu (delete, archive, etc.)",
    requiredPermissions: ["documents:read"],
  },
  {
    targetId: "documents-view-button",
    route: "/dashboard/documents",
    description: "View/open document button on a table row",
    requiredPermissions: ["documents:read"],
  },
  {
    targetId: "documents-archived-filter",
    route: "/dashboard/documents",
    description: "Show archived documents toggle on Documents page",
    requiredPermissions: ["documents:archive"],
  },
  {
    targetId: "documents-drawer-archive",
    route: "/dashboard/documents",
    description: "Archive button in the document detail drawer",
    requiredPermissions: ["documents:archive"],
  },
  {
    targetId: "documents-drawer-restore",
    route: "/dashboard/documents",
    description: "Restore button in the document detail drawer",
    requiredPermissions: ["documents:archive"],
  },
  {
    targetId: "documents-drawer-replace",
    route: "/dashboard/documents",
    description: "Replace file button in the document detail drawer",
    requiredPermissions: ["documents:update"],
  },
  {
    targetId: "documents-drawer-replace-file",
    route: "/dashboard/documents",
    description: "File picker in the replace form of the document detail drawer",
    requiredPermissions: ["documents:update"],
  },
  {
    targetId: "documents-drawer-replace-submit",
    route: "/dashboard/documents",
    description: "Submit button of the replace form in the document detail drawer",
    requiredPermissions: ["documents:update"],
  },
  {
    targetId: "taxonomy-create-button",
    route: "/dashboard/settings/document-taxonomy",
    description: "Create taxonomy record button on the Taxonomy page",
    requiredPermissions: ["company-settings:update"],
  },
  {
    targetId: "users-resend-button",
    route: "/dashboard/users",
    description: "Resend invitation button in the users table",
    requiredPermissions: ["users:create"],
  },
  {
    targetId: "users-revoke-button",
    route: "/dashboard/users",
    description: "Revoke invitation button in the users table",
    requiredPermissions: ["users:delete"],
  },
  {
    targetId: "users-delete-button",
    route: "/dashboard/users",
    description: "Delete user button in the users table",
    requiredPermissions: ["users:delete"],
  },
  {
    targetId: "roles-create-button",
    route: "/dashboard/roles",
    description: "Create Role button on the Roles page",
    requiredPermissions: ["roles:create"],
  },
  {
    targetId: "roles-create-name",
    route: "/dashboard/roles",
    description: "Role name input in the create role form",
    requiredPermissions: ["roles:create"],
  },
  {
    targetId: "roles-create-submit",
    route: "/dashboard/roles",
    description: "Submit button of the create role form",
    requiredPermissions: ["roles:create"],
  },
  {
    targetId: "settings-profile-save",
    route: "/dashboard/settings",
    description: "Save changes button in the company settings page",
    requiredPermissions: ["company-settings:update"],
  },
  {
    targetId: "users-invite-button",
    route: "/dashboard/users",
    description: "Invite user button on Users page",
    requiredPermissions: ["users:create"],
  },
  {
    targetId: "users-invite-form-name",
    route: "/dashboard/users",
    description: "Invitee name input field",
    requiredPermissions: ["users:create"],
  },
  {
    targetId: "users-invite-form-email",
    route: "/dashboard/users",
    description: "Invitee email input field",
    requiredPermissions: ["users:create"],
  },
  {
    targetId: "users-invite-form-role",
    route: "/dashboard/users",
    description: "Invitee role select field",
    requiredPermissions: ["users:create"],
  },
  {
    targetId: "users-invite-form-submit",
    route: "/dashboard/users",
    description: "Submit invitation button",
    requiredPermissions: ["users:create"],
  },
  {
    targetId: "users-edit-button",
    route: "/dashboard/users",
    description: "Edit user button",
    requiredPermissions: ["users:update"],
  },
  {
    targetId: "users-invite-form-department",
    route: "/dashboard/users",
    description: "Invitee department select field",
    requiredPermissions: ["users:create"],
  },
  {
    targetId: "chat-message-input",
    route: "/dashboard/chat",
    description: "Chat message textarea",
    requiredPermissions: ["chat:read"],
  },
  {
    targetId: "chat-send-button",
    route: "/dashboard/chat",
    description: "Send message button",
    requiredPermissions: ["chat:read"],
  },
  {
    targetId: "settings-profile-section",
    route: "/dashboard/settings",
    description: "Company profile settings section",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "settings-billing-tab",
    route: "/dashboard/settings/billing",
    description: "Billing tab in settings",
    requiredPermissions: ["billing:read"],
  },
  {
    targetId: "overview-metrics",
    route: "/dashboard",
    description: "Usage metric cards on the overview page",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "overview-subscription",
    route: "/dashboard",
    description: "Subscription widget on the overview page",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "overview-summary",
    route: "/dashboard",
    description: "Live tenant summary stats on the overview page",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "overview-activity",
    route: "/dashboard",
    description: "Recent activity feed on the overview page",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "overview-gaps",
    route: "/dashboard",
    description: "AI knowledge gaps insight banner on the overview page",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "overview-refresh",
    route: "/dashboard",
    description: "Refresh dashboard button on the overview page",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "documents-table",
    route: "/dashboard/documents",
    description: "Documents table",
    requiredPermissions: ["documents:read"],
  },
  {
    targetId: "documents-pagination",
    route: "/dashboard/documents",
    description: "Documents table pagination controls",
    requiredPermissions: ["documents:read"],
  },
  {
    targetId: "documents-upload-progress",
    route: "/dashboard/documents",
    description: "Upload progress bar",
    requiredPermissions: ["documents:create"],
  },
  {
    targetId: "documents-duplicate-warning",
    route: "/dashboard/documents",
    description: "Duplicate file warning on the upload panel",
    requiredPermissions: ["documents:create"],
  },
  {
    targetId: "documents-drawer",
    route: "/dashboard/documents",
    description: "Document detail drawer",
    requiredPermissions: ["documents:read"],
  },
  {
    targetId: "documents-drawer-processing",
    route: "/dashboard/documents",
    description: "Processing progress section in the document detail drawer",
    requiredPermissions: ["documents:read"],
  },
  {
    targetId: "documents-drawer-versions",
    route: "/dashboard/documents",
    description: "Version history section in the document detail drawer",
    requiredPermissions: ["documents:read"],
  },
  {
    targetId: "documents-drawer-download",
    route: "/dashboard/documents",
    description: "Download button in the document detail drawer",
    requiredPermissions: ["documents:read"],
  },
  {
    targetId: "users-search-input",
    route: "/dashboard/users",
    description: "Search users input in the directory",
    requiredPermissions: ["users:read"],
  },
  {
    targetId: "users-role-filter",
    route: "/dashboard/users",
    description: "Role filter dropdown in the directory",
    requiredPermissions: ["users:read"],
  },
  {
    targetId: "users-import-button",
    route: "/dashboard/users",
    description: "Bulk import users link",
    requiredPermissions: ["users:read"],
  },
  {
    targetId: "users-pagination",
    route: "/dashboard/users",
    description: "Users table pagination controls",
    requiredPermissions: ["users:read"],
  },
  {
    targetId: "roles-filter-bar",
    route: "/dashboard/roles",
    description: "Role search and filter bar",
    requiredPermissions: ["roles:read"],
  },
  {
    targetId: "roles-table",
    route: "/dashboard/roles",
    description: "Roles table",
    requiredPermissions: ["roles:read"],
  },
  {
    targetId: "roles-permissions-editor",
    route: "/dashboard/roles",
    description: "Permission editor in the create role form",
    requiredPermissions: ["roles:create"],
  },
  {
    targetId: "billing-change-plan",
    route: "/dashboard/settings/billing",
    description: "Change plan button on the subscription panel",
    requiredPermissions: ["billing:read"],
  },
  {
    targetId: "billing-choose-plan",
    route: "/dashboard/settings/billing",
    description: "Choose plan CTA on the billing page",
    requiredPermissions: ["billing:read"],
  },
  {
    targetId: "billing-invoices",
    route: "/dashboard/settings/billing",
    description: "Invoice history panel on the billing page",
    requiredPermissions: ["billing:read"],
  },
  {
    targetId: "billing-refunds",
    route: "/dashboard/settings/billing",
    description: "Refund history panel on the billing page",
    requiredPermissions: ["billing:read"],
  },
  {
    targetId: "usage-quota-grid",
    route: "/company/usage",
    description: "Quota usage cards grid",
    requiredPermissions: ["billing:read"],
  },
  {
    targetId: "settings-language",
    route: "/dashboard/settings",
    description: "Default language select in company settings",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "settings-ai-preferences",
    route: "/dashboard/settings",
    description: "AI runtime preferences panel in company settings",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "settings-discard",
    route: "/dashboard/settings",
    description: "Discard changes button in company settings",
    requiredPermissions: ["company-settings:update"],
  },
  {
    targetId: "settings-session-security",
    route: "/dashboard/settings",
    description: "Session security panel on the settings page",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "settings-taxonomy-link",
    route: "/dashboard/settings",
    description: "Open document taxonomy link on the settings page",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "taxonomy-tabs",
    route: "/dashboard/settings/document-taxonomy",
    description: "Taxonomy kind tabs (categories, departments, classifications)",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "taxonomy-table",
    route: "/dashboard/settings/document-taxonomy",
    description: "Taxonomy records table",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "audit-table",
    route: "/dashboard/audit",
    description: "Audit log table",
    requiredPermissions: ["audit:read"],
  },
  {
    targetId: "emails-table",
    route: "/dashboard/emails",
    description: "Email delivery log table",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "emails-details-button",
    route: "/dashboard/emails",
    description: "Email details button in the delivery log",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "emails-resend-button",
    route: "/dashboard/emails",
    description: "Resend email button in the delivery log",
    requiredPermissions: ["company-settings:update"],
  },
  {
    targetId: "chat-new-conversation",
    route: "/dashboard/chat",
    description: "New conversation button in the chat sidebar",
    requiredPermissions: ["chat:read"],
  },
  {
    targetId: "chat-suggestions",
    route: "/dashboard/chat",
    description: "Suggested question chips on the chat empty state",
    requiredPermissions: ["chat:read"],
  },
  {
    targetId: "chat-sources",
    route: "/dashboard/chat",
    description: "Source citations attached to assistant answers",
    requiredPermissions: ["chat:read"],
  },
  {
    targetId: "chat-feedback",
    route: "/dashboard/chat",
    description: "Answer feedback widget in chat",
    requiredPermissions: ["chat:read"],
  },
  {
    targetId: "chat-image-attach",
    route: "/dashboard/chat",
    description: "Attach image button in the chat composer",
    requiredPermissions: ["chat:read"],
  },
  {
    targetId: "chat-voice-input",
    route: "/dashboard/chat",
    description: "Voice input button in the chat composer",
    requiredPermissions: ["chat:read"],
  },
  {
    targetId: "knowledge-gaps-metrics",
    route: "/dashboard/knowledge-gaps",
    description: "Knowledge gaps metric cards",
    requiredPermissions: ["knowledge-gaps:read"],
  },
  {
    targetId: "knowledge-gaps-filter",
    route: "/dashboard/knowledge-gaps",
    description: "Knowledge gaps search and filter bar",
    requiredPermissions: ["knowledge-gaps:read"],
  },
  {
    targetId: "knowledge-gaps-table",
    route: "/dashboard/knowledge-gaps",
    description: "Knowledge gaps table",
    requiredPermissions: ["knowledge-gaps:read"],
  },
  {
    targetId: "knowledge-gaps-detail-link",
    route: "/dashboard/knowledge-gaps",
    description: "View detail link on a knowledge gap row",
    requiredPermissions: ["knowledge-gaps:read"],
  },
  {
    targetId: "analytics-export",
    route: "/dashboard/analytics",
    description: "Export analytics button",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "analytics-filter-bar",
    route: "/dashboard/analytics",
    description: "Analytics date range and model filter bar",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "analytics-charts",
    route: "/dashboard/analytics",
    description: "Time series and cost breakdown charts",
    requiredPermissions: ["analytics:read"],
  },
  {
    targetId: "processing-failed-table",
    route: "/dashboard/processing-failed",
    description: "Failed processing jobs table",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "processing-failed-retry",
    route: "/dashboard/processing-failed",
    description: "Retry button on a failed processing job",
    requiredPermissions: ["company-settings:read"],
  },
  {
    targetId: "processing-failed-reprocess",
    route: "/dashboard/processing-failed",
    description: "Reprocess button on a failed processing job",
    requiredPermissions: ["company-settings:read"],
  },
] as const;

const GUIDE_TARGET_MAP: ReadonlyMap<string, GuideTargetEntry> = new Map(
  GUIDE_TARGETS.map((entry) => [entry.targetId, entry]),
);

export const GUIDE_TARGET_IDS: ReadonlySet<string> = new Set(
  GUIDE_TARGETS.map((entry) => entry.targetId),
);

export function isKnownGuideTarget(targetId: string): boolean {
  return GUIDE_TARGET_IDS.has(targetId);
}

export function getGuideTarget(targetId: string): GuideTargetEntry | undefined {
  return GUIDE_TARGET_MAP.get(targetId);
}

/**
 * Map a backend `GuideSession` step target to a concrete DOM selector. Only
 * registered ids resolve; unknown ids return null (the overlay renders nothing
 * and logs a dev warning, per guider.md §10).
 */
export function guideTargetSelector(targetId: string): string | null {
  return isKnownGuideTarget(targetId) ? `[data-guide-id="${targetId}"]` : null;
}

/** Route a nav entry's registry id back to its href (for anchor matching). */
export function getGuideTargetRoute(targetId: string): string | undefined {
  return GUIDE_TARGET_MAP.get(targetId)?.route;
}

const NAV_TARGET_BY_ROUTE: ReadonlyMap<string, string> = new Map(
  GUIDE_TARGETS.filter((entry) => entry.targetId.startsWith("nav-")).map(
    (entry) => [entry.route, entry.targetId],
  ),
);

/**
 * Resolve a sidebar nav href (e.g. `/dashboard/documents`) to its registered
 * `data-guide-id`. Returns undefined for links with no guide anchor.
 */
export function getNavGuideTargetId(href: string): string | undefined {
  return NAV_TARGET_BY_ROUTE.get(href);
}
