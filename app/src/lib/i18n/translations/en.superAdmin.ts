/**
 * English translations — platform / super-admin area.
 *
 * Companies, packages, subscriptions, payments, refunds, jobs, system
 * health, retrieval debug, AI configuration, and platform settings.
 *
 * Keys added here must have a matching entry in `ar.superAdmin.ts` — the
 * parity test in `__tests__/i18n.test.ts` enforces it.
 */

import type { TranslationDictionary } from "../i18n.types";

const enSuperAdmin: TranslationDictionary = {
  "superAdmin.title": "Platform Overview",
  "superAdmin.description": "Monitor companies, usage, processing, and operational activity across DocuMind AI.",
  "superAdmin.companies": "Total Companies",
  "superAdmin.activeCompanies": "Active Companies",
  "superAdmin.users": "Platform Users",
  "superAdmin.documents": "Documents",
  "superAdmin.queries": "Queries",
  "superAdmin.estimatedCost": "Estimated Cost",
  "superAdmin.failedJobs": "Failed Jobs",
  "superAdmin.storage": "Storage",
  "superAdmin.statusDistribution": "Status Distribution",
  "superAdmin.auditLogTitle": "Platform Audit Log",
  "superAdmin.auditLogDesc": "Inspect administrative actions across the platform.",
  "superAdmin.processingOverviewTitle": "Processing Overview",
  "superAdmin.processingOverviewDesc": "Monitor active and completed background processing tasks.",
  "superAdmin.refundReviewsTitle": "Refund Reviews",
  "superAdmin.refundReviewsDesc": "Review and process customer refund requests.",

  /* ── Shared platform UI ────────────────────────────────── */
  "superAdmin.loadError": "Unable to load platform data. Please try again.",
  "superAdmin.unknownCompany": "Unknown",

  /* ── Shared table headers ──────────────────────────────── */
  "superAdmin.tableUser": "User",
  "superAdmin.tableCompany": "Company",
  "superAdmin.tableRole": "Role",
  "superAdmin.tableStatus": "Status",
  "superAdmin.tableVerified": "Verified",
  "superAdmin.tableCreated": "Created",
  "superAdmin.tableUpdated": "Updated",
  "superAdmin.tableDocument": "Document",
  "superAdmin.verifiedYes": "Yes",
  "superAdmin.verifiedNo": "No",

  /* ── System Health ─────────────────────────────────────── */
  "superAdmin.systemHealthTitle": "System Health",
  "superAdmin.systemHealthDesc": "Review live readiness signals for core DocuMind AI services.",
  "superAdmin.serviceStatus.healthy": "Healthy",
  "superAdmin.serviceStatus.degraded": "Degraded",
  "superAdmin.serviceStatus.unavailable": "Unavailable",
  "superAdmin.serviceStatus.connected": "Connected",

  /* ── Platform Users ────────────────────────────────────── */
  "superAdmin.platformUsersTitle": "Platform Users",
  "superAdmin.platformUsersDesc": "Review users across companies without crossing tenant-scoped mutation boundaries.",
  "superAdmin.userRole.employee": "Employee",
  "superAdmin.userRole.company_admin": "Company Admin",
  "superAdmin.userRole.super_admin": "Super Admin",
  "superAdmin.userStatus.active": "Active",
  "superAdmin.userStatus.suspended": "Suspended",
  "superAdmin.userStatus.disabled": "Disabled",
  "superAdmin.userStatus.pending_email_verification": "Pending Verification",

  /* ── Processing Jobs ───────────────────────────────────── */
  "superAdmin.jobsTitle": "Processing Jobs",
  "superAdmin.jobsDesc": "Monitor document ingestion and processing activity across companies.",

  /* ── Usage & Costs ─────────────────────────────────────── */
  "superAdmin.usageTitle": "Usage & Costs",
  "superAdmin.usageDesc": "Track query volume, storage consumption, and estimated AI cost across tenants.",
  "superAdmin.usageQueries": "Queries",
  "superAdmin.usageEstimatedCost": "Estimated cost",
  "superAdmin.usageStorage": "Storage",
  "superAdmin.usageDailyVolume": "Daily query volume",
  "superAdmin.usageDailyVolumeChart": "Daily query volume chart",
  "superAdmin.usageQueriesTooltip": "{{count}} queries",

  /* ── Subscriptions ─────────────────────────────────────── */
  "superAdmin.subsTitle": "Subscriptions",
  "superAdmin.subsShortDesc": "Platform subscription operations.",
  "superAdmin.subsDesc": "Provision local subscriptions, assign immutable package versions, and apply legal administrative transitions.",
  "superAdmin.subsNoPermission": "You do not have permission to view subscriptions.",
  "superAdmin.subsOperation": "Subscription operation",
  "superAdmin.subsSelectCompany": "Select company",
  "superAdmin.subsTenantOption": "{{name}} — {{state}}",
  "superAdmin.subsSubscriptionExists": "subscription exists",
  "superAdmin.subsNoSubscriptionShort": "no subscription",
  "superAdmin.subsActivePackage": "Active package",
  "superAdmin.subsSelectPackage": "Select package",
  "superAdmin.subsLoadDetailError": "Unable to load subscription details.",
  "superAdmin.subsCurrentLabel": "Current:",
  "superAdmin.subsCurrentSummary": "{{package}} v{{version}} · {{status}} · revision {{revision}}",
  "superAdmin.subsProviderOwnershipLabel": "Provider ownership:",
  "superAdmin.subsProviderManagedNote": "Provider-managed (local override blocked)",
  "superAdmin.subsManualLocal": "Manual/local",
  "superAdmin.subsPeriodLabel": "Period:",
  "superAdmin.subsPeriodRange": "{{start}} to {{end}}",
  "superAdmin.subsTrialEndLabel": "Trial end:",
  "superAdmin.subsCancellationLabel": "Cancellation:",
  "superAdmin.subsLegalTargetStatus": "Legal target status",
  "superAdmin.subsDoNotChangeStatus": "Do not change status",
  "superAdmin.subsSyncFromStripe": "Sync from Stripe",
  "superAdmin.subsSynchronizing": "Synchronizing…",
  "superAdmin.subsSyncSuccess": "Subscription synchronized from Stripe.",
  "superAdmin.subsSyncFailed": "Stripe synchronization failed.",
  "superAdmin.subsChangePackage": "Change Package",
  "superAdmin.subsChangeStatus": "Change Status",
  "superAdmin.subsNoSubscriptionForCompany": "This company has no subscription.",
  "superAdmin.subsProvision": "Provision Subscription",
  "superAdmin.subsSearchCompanies": "Search companies",
  "superAdmin.subsAllStatuses": "All statuses",
  "superAdmin.subsNone": "No subscriptions have been provisioned.",
  "superAdmin.subsNoMatch": "No subscriptions match these filters.",
  "superAdmin.subsTablePackage": "Package",
  "superAdmin.subsTableVersion": "Version",
  "superAdmin.subsTableOwnership": "Ownership",
  "superAdmin.subsTableRevision": "Revision",
  "superAdmin.subsOwnershipProvider": "Provider",
  "superAdmin.subsOwnershipLocal": "Local",
  "superAdmin.subsPrevious": "Previous",
  "superAdmin.subsNext": "Next",
  "superAdmin.subsPageOf": "Page {{page}} of {{total}}",
  "superAdmin.subsStatus.trialing": "Trialing",
  "superAdmin.subsStatus.incomplete": "Incomplete",
  "superAdmin.subsStatus.active": "Active",
  "superAdmin.subsStatus.past_due": "Past Due",
  "superAdmin.subsStatus.paused": "Paused",
  "superAdmin.subsStatus.cancel_at_period_end": "Cancels At Period End",
  "superAdmin.subsStatus.canceled": "Canceled",
  "superAdmin.subsStatus.expired": "Expired",
  "superAdmin.subsStatus.unpaid": "Unpaid",
};

export default enSuperAdmin;
