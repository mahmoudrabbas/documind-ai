import { Permission } from "../../permissions/permissions.catalog.js";
import type { GuideTargetRegistry, GuideTargetRegistryEntry } from "./guide.contracts.js";

export const GUIDE_TARGETS: readonly GuideTargetRegistryEntry[] = [
  {
    targetId: "nav-documents",
    route: "/dashboard/documents",
    description: "Documents navigation link in sidebar",
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    targetId: "nav-users",
    route: "/dashboard/users",
    description: "Users navigation link in sidebar",
    requiredPermissions: [Permission.USERS_READ],
  },
  {
    targetId: "nav-settings",
    route: "/dashboard/settings",
    description: "Settings navigation link in sidebar",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "nav-chat",
    route: "/dashboard/chat",
    description: "Chat navigation link in sidebar",
    requiredPermissions: [Permission.CHAT_READ],
  },
  {
    targetId: "nav-billing",
    route: "/dashboard/settings/billing",
    description: "Billing navigation link in sidebar",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    targetId: "nav-overview",
    route: "/dashboard",
    description: "Overview (dashboard) navigation link in sidebar",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    targetId: "nav-roles",
    route: "/dashboard/roles",
    description: "Roles navigation link in sidebar",
    requiredPermissions: [Permission.ROLES_READ],
  },
  {
    targetId: "nav-company-usage",
    route: "/company/usage",
    description: "Usage & Limits navigation link in sidebar",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    targetId: "nav-document-taxonomy",
    route: "/dashboard/settings/document-taxonomy",
    description: "Document Taxonomy navigation link in sidebar",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "nav-audit",
    route: "/dashboard/audit",
    description: "Audit Log navigation link in sidebar",
    requiredPermissions: [Permission.AUDIT_READ],
  },
  {
    targetId: "nav-emails",
    route: "/dashboard/emails",
    description: "Email Log navigation link in sidebar",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "nav-knowledge-gaps",
    route: "/dashboard/knowledge-gaps",
    description: "Knowledge Gaps navigation link in sidebar",
    requiredPermissions: [Permission.KNOWLEDGE_GAPS_READ],
  },
  {
    targetId: "nav-analytics",
    route: "/dashboard/analytics",
    description: "Analytics & Insights navigation link in sidebar",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    targetId: "nav-processing-failed",
    route: "/dashboard/processing-failed",
    description: "Failed Processing navigation link in sidebar",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "nav-sa-overview",
    route: "/super-admin",
    description: "Platform Overview navigation link in sidebar",
    requiredPermissions: [Permission.AUDIT_READ],
  },
  {
    targetId: "nav-sa-companies",
    route: "/super-admin/companies",
    description: "Platform Companies navigation link in sidebar",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "nav-sa-packages",
    route: "/super-admin/packages",
    description: "Platform Packages navigation link in sidebar",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    targetId: "nav-sa-subscriptions",
    route: "/super-admin/subscriptions",
    description: "Platform Subscriptions navigation link in sidebar",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    targetId: "nav-sa-users",
    route: "/super-admin/users",
    description: "Platform Users navigation link in sidebar",
    requiredPermissions: [Permission.USERS_READ],
  },
  {
    targetId: "nav-sa-usage",
    route: "/super-admin/usage",
    description: "Platform Usage & Costs navigation link in sidebar",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    targetId: "nav-sa-system-health",
    route: "/super-admin/system-health",
    description: "Platform System Health navigation link in sidebar",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "nav-sa-ai-configuration",
    route: "/super-admin/ai-configuration",
    description: "Platform AI Configuration navigation link in sidebar",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "nav-sa-audit",
    route: "/super-admin/audit",
    description: "Platform Security & Audit navigation link in sidebar",
    requiredPermissions: [Permission.AUDIT_READ],
  },
  {
    targetId: "nav-sa-settings",
    route: "/super-admin/settings",
    description: "Platform Global Settings navigation link in sidebar",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "nav-sa-payments",
    route: "/super-admin/payments",
    description: "Platform Payment Diagnostics navigation link in sidebar",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    targetId: "nav-sa-refunds",
    route: "/super-admin/refunds",
    description: "Platform Refund Reviews navigation link in sidebar",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    targetId: "nav-sa-entitlement",
    route: "/super-admin/entitlement",
    description: "Platform Quota Overrides navigation link in sidebar",
    requiredPermissions: [Permission.BILLING_MANAGE],
  },
  {
    targetId: "nav-sa-analytics",
    route: "/super-admin/analytics",
    description: "Platform AI Analytics navigation link in sidebar",
    requiredPermissions: [Permission.ANALYTICS_READ],
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
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    targetId: "page-heading-documents",
    route: "/dashboard/documents",
    description: "Documents page heading",
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    targetId: "page-heading-users",
    route: "/dashboard/users",
    description: "Users page heading",
    requiredPermissions: [Permission.USERS_READ],
  },
  {
    targetId: "page-heading-roles",
    route: "/dashboard/roles",
    description: "Roles page heading",
    requiredPermissions: [Permission.ROLES_READ],
  },
  {
    targetId: "page-heading-billing",
    route: "/dashboard/settings/billing",
    description: "Billing page heading",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    targetId: "page-heading-usage",
    route: "/company/usage",
    description: "Usage & Limits page heading",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    targetId: "page-heading-settings",
    route: "/dashboard/settings",
    description: "Settings page heading",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "page-heading-document-taxonomy",
    route: "/dashboard/settings/document-taxonomy",
    description: "Document Taxonomy page heading",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "page-heading-audit",
    route: "/dashboard/audit",
    description: "Audit Log page heading",
    requiredPermissions: [Permission.AUDIT_READ],
  },
  {
    targetId: "page-heading-emails",
    route: "/dashboard/emails",
    description: "Email Log page heading",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "page-heading-knowledge-gaps",
    route: "/dashboard/knowledge-gaps",
    description: "Knowledge Gaps page heading",
    requiredPermissions: [Permission.KNOWLEDGE_GAPS_READ],
  },
  {
    targetId: "page-heading-chat",
    route: "/dashboard/chat",
    description: "Chat page heading",
    requiredPermissions: [Permission.CHAT_READ],
  },
  {
    targetId: "page-heading-analytics",
    route: "/dashboard/analytics",
    description: "Analytics & Insights page heading",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    targetId: "page-heading-processing-failed",
    route: "/dashboard/processing-failed",
    description: "Failed Processing page heading",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "documents-upload-button",
    route: "/dashboard/documents",
    description: "Upload document button on Documents page",
    requiredPermissions: [Permission.DOCUMENTS_CREATE],
  },
  {
    targetId: "documents-dropzone",
    route: "/dashboard/documents",
    description: "File dropzone area for document upload",
    requiredPermissions: [Permission.DOCUMENTS_CREATE],
  },
  {
    targetId: "documents-title-input",
    route: "/dashboard/documents",
    description: "Document title input field",
    requiredPermissions: [Permission.DOCUMENTS_CREATE],
  },
  {
    targetId: "documents-description-input",
    route: "/dashboard/documents",
    description: "Document description textarea",
    requiredPermissions: [Permission.DOCUMENTS_CREATE],
  },
  {
    targetId: "documents-tags-input",
    route: "/dashboard/documents",
    description: "Document tags input field",
    requiredPermissions: [Permission.DOCUMENTS_CREATE],
  },
  {
    targetId: "documents-upload-submit",
    route: "/dashboard/documents",
    description: "Submit upload button",
    requiredPermissions: [Permission.DOCUMENTS_CREATE],
  },
  {
    targetId: "documents-search-input",
    route: "/dashboard/documents",
    description: "Search documents input field",
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    targetId: "documents-search-button",
    route: "/dashboard/documents",
    description: "Search submit button",
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    targetId: "documents-table-row-menu",
    route: "/dashboard/documents",
    description: "Row action menu (delete, archive, etc.)",
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    targetId: "documents-view-button",
    route: "/dashboard/documents",
    description: "View/open document button on a table row",
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    targetId: "documents-archived-filter",
    route: "/dashboard/documents",
    description: "Show archived documents toggle on Documents page",
    requiredPermissions: [Permission.DOCUMENTS_ARCHIVE],
  },
  {
    targetId: "documents-drawer-archive",
    route: "/dashboard/documents",
    description: "Archive button in the document detail drawer",
    requiredPermissions: [Permission.DOCUMENTS_ARCHIVE],
  },
  {
    targetId: "documents-drawer-restore",
    route: "/dashboard/documents",
    description: "Restore button in the document detail drawer",
    requiredPermissions: [Permission.DOCUMENTS_ARCHIVE],
  },
  {
    targetId: "documents-drawer-replace",
    route: "/dashboard/documents",
    description: "Replace file button in the document detail drawer",
    requiredPermissions: [Permission.DOCUMENTS_UPDATE],
  },
  {
    targetId: "documents-drawer-replace-file",
    route: "/dashboard/documents",
    description: "File picker in the replace form of the document detail drawer",
    requiredPermissions: [Permission.DOCUMENTS_UPDATE],
  },
  {
    targetId: "documents-drawer-replace-submit",
    route: "/dashboard/documents",
    description: "Submit button of the replace form in the document detail drawer",
    requiredPermissions: [Permission.DOCUMENTS_UPDATE],
  },
  {
    targetId: "taxonomy-create-button",
    route: "/dashboard/settings/document-taxonomy",
    description: "Create taxonomy record button on the Taxonomy page",
    requiredPermissions: [Permission.COMPANY_SETTINGS_UPDATE],
  },
  {
    targetId: "users-resend-button",
    route: "/dashboard/users",
    description: "Resend invitation button in the users table",
    requiredPermissions: [Permission.USERS_CREATE],
  },
  {
    targetId: "users-revoke-button",
    route: "/dashboard/users",
    description: "Revoke invitation button in the users table",
    requiredPermissions: [Permission.USERS_DELETE],
  },
  {
    targetId: "users-delete-button",
    route: "/dashboard/users",
    description: "Delete user button in the users table",
    requiredPermissions: [Permission.USERS_DELETE],
  },
  {
    targetId: "roles-create-button",
    route: "/dashboard/roles",
    description: "Create Role button on the Roles page",
    requiredPermissions: [Permission.ROLES_CREATE],
  },
  {
    targetId: "roles-create-name",
    route: "/dashboard/roles",
    description: "Role name input in the create role form",
    requiredPermissions: [Permission.ROLES_CREATE],
  },
  {
    targetId: "roles-create-submit",
    route: "/dashboard/roles",
    description: "Submit button of the create role form",
    requiredPermissions: [Permission.ROLES_CREATE],
  },
  {
    targetId: "settings-profile-save",
    route: "/dashboard/settings",
    description: "Save changes button in the company settings page",
    requiredPermissions: [Permission.COMPANY_SETTINGS_UPDATE],
  },
  {
    targetId: "users-invite-button",
    route: "/dashboard/users",
    description: "Invite user button on Users page",
    requiredPermissions: [Permission.USERS_CREATE],
  },
  {
    targetId: "users-invite-form-name",
    route: "/dashboard/users",
    description: "Invitee name input field",
    requiredPermissions: [Permission.USERS_CREATE],
  },
  {
    targetId: "users-invite-form-email",
    route: "/dashboard/users",
    description: "Invitee email input field",
    requiredPermissions: [Permission.USERS_CREATE],
  },
  {
    targetId: "users-invite-form-role",
    route: "/dashboard/users",
    description: "Invitee role select field",
    requiredPermissions: [Permission.USERS_CREATE],
  },
  {
    targetId: "users-invite-form-submit",
    route: "/dashboard/users",
    description: "Submit invitation button",
    requiredPermissions: [Permission.USERS_CREATE],
  },
  {
    targetId: "chat-message-input",
    route: "/dashboard/chat",
    description: "Chat message textarea",
    requiredPermissions: [Permission.CHAT_READ],
  },
  {
    targetId: "chat-send-button",
    route: "/dashboard/chat",
    description: "Send message button",
    requiredPermissions: [Permission.CHAT_READ],
  },
  {
    targetId: "settings-profile-section",
    route: "/dashboard/settings",
    description: "Company profile settings section",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "settings-billing-tab",
    route: "/dashboard/settings/billing",
    description: "Billing tab in settings",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    targetId: "overview-metrics",
    route: "/dashboard",
    description: "Usage metric cards on the overview page",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    targetId: "overview-subscription",
    route: "/dashboard",
    description: "Subscription widget on the overview page",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    targetId: "overview-summary",
    route: "/dashboard",
    description: "Live tenant summary stats on the overview page",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    targetId: "overview-activity",
    route: "/dashboard",
    description: "Recent activity feed on the overview page",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    targetId: "overview-gaps",
    route: "/dashboard",
    description: "AI knowledge gaps insight banner on the overview page",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    targetId: "overview-refresh",
    route: "/dashboard",
    description: "Refresh dashboard button on the overview page",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    targetId: "documents-table",
    route: "/dashboard/documents",
    description: "Documents table",
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    targetId: "documents-pagination",
    route: "/dashboard/documents",
    description: "Documents table pagination controls",
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    targetId: "documents-upload-progress",
    route: "/dashboard/documents",
    description: "Upload progress bar",
    requiredPermissions: [Permission.DOCUMENTS_CREATE],
  },
  {
    targetId: "documents-duplicate-warning",
    route: "/dashboard/documents",
    description: "Duplicate file warning on the upload panel",
    requiredPermissions: [Permission.DOCUMENTS_CREATE],
  },
  {
    targetId: "documents-drawer",
    route: "/dashboard/documents",
    description: "Document detail drawer",
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    targetId: "documents-drawer-processing",
    route: "/dashboard/documents",
    description: "Processing progress section in the document detail drawer",
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    targetId: "documents-drawer-versions",
    route: "/dashboard/documents",
    description: "Version history section in the document detail drawer",
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    targetId: "documents-drawer-download",
    route: "/dashboard/documents",
    description: "Download button in the document detail drawer",
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    targetId: "users-search-input",
    route: "/dashboard/users",
    description: "Search users input in the directory",
    requiredPermissions: [Permission.USERS_READ],
  },
  {
    targetId: "users-role-filter",
    route: "/dashboard/users",
    description: "Role filter dropdown in the directory",
    requiredPermissions: [Permission.USERS_READ],
  },
  {
    targetId: "users-import-button",
    route: "/dashboard/users",
    description: "Bulk import users link",
    requiredPermissions: [Permission.USERS_READ],
  },
  {
    targetId: "users-pagination",
    route: "/dashboard/users",
    description: "Users table pagination controls",
    requiredPermissions: [Permission.USERS_READ],
  },
  {
    targetId: "roles-filter-bar",
    route: "/dashboard/roles",
    description: "Role search and filter bar",
    requiredPermissions: [Permission.ROLES_READ],
  },
  {
    targetId: "roles-table",
    route: "/dashboard/roles",
    description: "Roles table",
    requiredPermissions: [Permission.ROLES_READ],
  },
  {
    targetId: "roles-permissions-editor",
    route: "/dashboard/roles",
    description: "Permission editor in the create role form",
    requiredPermissions: [Permission.ROLES_CREATE],
  },
  {
    targetId: "billing-change-plan",
    route: "/dashboard/settings/billing",
    description: "Change plan button on the subscription panel",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    targetId: "billing-choose-plan",
    route: "/dashboard/settings/billing",
    description: "Choose plan CTA on the billing page",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    targetId: "billing-invoices",
    route: "/dashboard/settings/billing",
    description: "Invoice history panel on the billing page",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    targetId: "billing-refunds",
    route: "/dashboard/settings/billing",
    description: "Refund history panel on the billing page",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    targetId: "usage-quota-grid",
    route: "/company/usage",
    description: "Quota usage cards grid",
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    targetId: "settings-language",
    route: "/dashboard/settings",
    description: "Default language select in company settings",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "settings-ai-preferences",
    route: "/dashboard/settings",
    description: "AI runtime preferences panel in company settings",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "settings-discard",
    route: "/dashboard/settings",
    description: "Discard changes button in company settings",
    requiredPermissions: [Permission.COMPANY_SETTINGS_UPDATE],
  },
  {
    targetId: "settings-session-security",
    route: "/dashboard/settings",
    description: "Session security panel on the settings page",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "settings-taxonomy-link",
    route: "/dashboard/settings",
    description: "Open document taxonomy link on the settings page",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "taxonomy-tabs",
    route: "/dashboard/settings/document-taxonomy",
    description: "Taxonomy kind tabs (categories, departments, classifications)",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "taxonomy-table",
    route: "/dashboard/settings/document-taxonomy",
    description: "Taxonomy records table",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "audit-table",
    route: "/dashboard/audit",
    description: "Audit log table",
    requiredPermissions: [Permission.AUDIT_READ],
  },
  {
    targetId: "emails-table",
    route: "/dashboard/emails",
    description: "Email delivery log table",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "emails-details-button",
    route: "/dashboard/emails",
    description: "Email details button in the delivery log",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "emails-resend-button",
    route: "/dashboard/emails",
    description: "Resend email button in the delivery log",
    requiredPermissions: [Permission.COMPANY_SETTINGS_UPDATE],
  },
  {
    targetId: "chat-new-conversation",
    route: "/dashboard/chat",
    description: "New conversation button in the chat sidebar",
    requiredPermissions: [Permission.CHAT_READ],
  },
  {
    targetId: "chat-suggestions",
    route: "/dashboard/chat",
    description: "Suggested question chips on the chat empty state",
    requiredPermissions: [Permission.CHAT_READ],
  },
  {
    targetId: "chat-sources",
    route: "/dashboard/chat",
    description: "Source citations attached to assistant answers",
    requiredPermissions: [Permission.CHAT_READ],
  },
  {
    targetId: "chat-feedback",
    route: "/dashboard/chat",
    description: "Answer feedback widget in chat",
    requiredPermissions: [Permission.CHAT_READ],
  },
  {
    targetId: "chat-image-attach",
    route: "/dashboard/chat",
    description: "Attach image button in the chat composer",
    requiredPermissions: [Permission.CHAT_READ],
  },
  {
    targetId: "chat-voice-input",
    route: "/dashboard/chat",
    description: "Voice input button in the chat composer",
    requiredPermissions: [Permission.CHAT_READ],
  },
  {
    targetId: "knowledge-gaps-metrics",
    route: "/dashboard/knowledge-gaps",
    description: "Knowledge gaps metric cards",
    requiredPermissions: [Permission.KNOWLEDGE_GAPS_READ],
  },
  {
    targetId: "knowledge-gaps-filter",
    route: "/dashboard/knowledge-gaps",
    description: "Knowledge gaps search and filter bar",
    requiredPermissions: [Permission.KNOWLEDGE_GAPS_READ],
  },
  {
    targetId: "knowledge-gaps-table",
    route: "/dashboard/knowledge-gaps",
    description: "Knowledge gaps table",
    requiredPermissions: [Permission.KNOWLEDGE_GAPS_READ],
  },
  {
    targetId: "knowledge-gaps-detail-link",
    route: "/dashboard/knowledge-gaps",
    description: "View detail link on a knowledge gap row",
    requiredPermissions: [Permission.KNOWLEDGE_GAPS_READ],
  },
  {
    targetId: "analytics-export",
    route: "/dashboard/analytics",
    description: "Export analytics button",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    targetId: "analytics-filter-bar",
    route: "/dashboard/analytics",
    description: "Analytics date range and model filter bar",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    targetId: "analytics-charts",
    route: "/dashboard/analytics",
    description: "Time series and cost breakdown charts",
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    targetId: "processing-failed-table",
    route: "/dashboard/processing-failed",
    description: "Failed processing jobs table",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "processing-failed-retry",
    route: "/dashboard/processing-failed",
    description: "Retry button on a failed processing job",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    targetId: "processing-failed-reprocess",
    route: "/dashboard/processing-failed",
    description: "Reprocess button on a failed processing job",
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
] as const;

export function createGuideTargetRegistry(): GuideTargetRegistry {
  const map = new Map<string, GuideTargetRegistryEntry>();
  for (const target of GUIDE_TARGETS) {
    if (map.has(target.targetId)) {
      throw new Error(`Duplicate guide target id: ${target.targetId}`);
    }
    map.set(target.targetId, target);
  }
  return map;
}

export function validateGuideTargetIds(targetIds: readonly string[]): { valid: string[]; invalid: string[] } {
  const registry = createGuideTargetRegistry();
  const valid: string[] = [];
  const invalid: string[] = [];
  for (const id of targetIds) {
    if (registry.has(id)) {
      valid.push(id);
    } else {
      invalid.push(id);
    }
  }
  return { valid, invalid };
}

export function getGuideTarget(targetId: string): GuideTargetRegistryEntry | undefined {
  return createGuideTargetRegistry().get(targetId);
}
