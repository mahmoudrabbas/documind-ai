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
  "superAdmin.description":
    "Monitor companies, usage, processing, and operational activity across DocuMind AI.",
  "superAdmin.companies": "Total Companies",
  "superAdmin.activeCompanies": "Active Companies",
  "superAdmin.users": "Platform Users",
  "superAdmin.documents": "Documents",
  "superAdmin.queries": "Queries",
  "superAdmin.estimatedCost": "Estimated Cost",
  "superAdmin.failedJobs": "Failed Jobs",
  "superAdmin.storage": "Storage",
  "superAdmin.recentActivity": "Recent administrative activity",
  "superAdmin.noRecentActivity": "No administrative activity yet.",
  "superAdmin.statusDistribution": "Status Distribution",
  "superAdmin.auditLogTitle": "Platform Audit Log",
  "superAdmin.auditLogDesc":
    "Inspect administrative actions across the platform.",
  "superAdmin.refundReviewsTitle": "Refund Reviews",
  "superAdmin.refundReviewsDesc":
    "Review and process customer refund requests.",

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
  "superAdmin.tableTenant": "Tenant",
  "superAdmin.tableFailedStage": "Failed Stage",
  "superAdmin.tableError": "Error",
  "superAdmin.tableRetries": "Retries",
  "superAdmin.tableFailedAt": "Failed At",
  "superAdmin.tableActions": "Actions",
  "superAdmin.documentVersion": "v{{version}}",
  "superAdmin.verifiedYes": "Yes",
  "superAdmin.verifiedNo": "No",

  /* ── System Health ─────────────────────────────────────── */
  "superAdmin.systemHealthTitle": "System Health",
  "superAdmin.systemHealthDesc":
    "Review live readiness signals for core DocuMind AI services.",
  "superAdmin.systemHealthSummary.healthy":
    "All {{count}} critical services operational.",
  "superAdmin.systemHealthSummary.degraded":
    "{{healthyCount}} of {{totalCount}} critical services operational.",
  "superAdmin.systemHealthSummary.down":
    "Critical platform services unavailable.",
  "superAdmin.systemHealthLatency": "Latency",
  "superAdmin.systemHealthUptime": "Uptime",
  "superAdmin.systemHealthCheckedAt": "Checked",
  "superAdmin.systemHealthLastChecked": "Last checked",
  "superAdmin.systemHealthStatus": "Status",
  "superAdmin.systemHealthSummaryTitle": "Service summary",
  "superAdmin.systemHealthServicesTitle": "Critical services",
  "superAdmin.systemHealthServiceSignal": "Live readiness signal",
  "superAdmin.systemHealthTotalServices": "Total services",
  "superAdmin.systemHealthHealthy": "Healthy",
  "superAdmin.systemHealthDegraded": "Degraded",
  "superAdmin.systemHealthUnavailable": "Unavailable",
  "superAdmin.systemHealthViewDetails": "View details",
  "superAdmin.systemHealthLiveDetails": "Live readiness details",
  "superAdmin.systemHealthOverview": "Overview",
  "superAdmin.systemHealthHealthChecks": "Health checks",
  "superAdmin.systemHealthRuntimeDetails": "Runtime details",
  "superAdmin.systemHealthReady": "Ready",
  "superAdmin.systemHealthNotReady": "Not ready",
  "superAdmin.systemHealthYes": "Yes",
  "superAdmin.systemHealthNo": "No",
  "superAdmin.systemHealthWorkerReason.timeout":
    "Worker health check timed out.",
  "superAdmin.systemHealthWorkerReason.unreachable":
    "Unable to reach background worker.",
  "superAdmin.systemHealthWorkerReason.not_ready":
    "Background worker is not ready.",
  "superAdmin.serviceStatus.healthy": "Healthy",
  "superAdmin.serviceStatus.degraded": "Degraded",
  "superAdmin.serviceStatus.unavailable": "Unavailable",
  "superAdmin.serviceStatus.down": "Down",
  "superAdmin.serviceStatus.connected": "Connected",

  /* ── Platform Users ────────────────────────────────────── */
  "superAdmin.platformUsersTitle": "Platform Users",
  "superAdmin.platformUsersDesc":
    "Review users across companies without crossing tenant-scoped mutation boundaries.",
  "superAdmin.userRole.employee": "Employee",
  "superAdmin.userRole.company_admin": "Company Admin",
  "superAdmin.userRole.super_admin": "Super Admin",
  "superAdmin.userStatus.active": "Active",
  "superAdmin.userStatus.suspended": "Suspended",
  "superAdmin.userStatus.disabled": "Disabled",
  "superAdmin.userStatus.pending_email_verification": "Pending Verification",

  /* ── Usage & Costs ─────────────────────────────────────── */
  "superAdmin.usageTitle": "Usage & Costs",
  "superAdmin.usageDesc":
    "Track query volume, storage consumption, and estimated AI cost across tenants.",
  "superAdmin.usageQueries": "Queries",
  "superAdmin.usageEstimatedCost": "Estimated cost",
  "superAdmin.usageStorage": "Storage",
  "superAdmin.usageDailyVolume": "Daily query volume",
  "superAdmin.usageDailyVolumeChart": "Daily query volume chart",
  "superAdmin.usageQueriesTooltip": "{{count}} queries",

  /* ── Help Center ──────────────────────────────────────── */
  "superAdmin.help.badge": "Super Admin",
  "superAdmin.help.title": "Help Center",
  "superAdmin.help.description":
    "Operational guidance for platform administration, configuration, and support.",
  "superAdmin.help.gettingStarted.title": "Getting Started",
  "superAdmin.help.gettingStarted.summary":
    "Understand the platform shell and the first tasks that keep it running.",
  "superAdmin.help.gettingStarted.point1":
    "Start from the Overview page to review companies, platform activity, and operational signals.",
  "superAdmin.help.gettingStarted.point2":
    "Use the sidebar to move between customers, billing, operations, analytics, and governance.",
  "superAdmin.help.gettingStarted.point3":
    "Keep the platform pages open while changing settings so you can verify the effect of each update.",
  "superAdmin.help.customers.title": "Customers / Companies",
  "superAdmin.help.customers.summary":
    "Where to inspect tenant records and account-level details.",
  "superAdmin.help.customers.point1":
    "Open Companies to review tenant status, account metadata, and platform-level visibility.",
  "superAdmin.help.customers.point2":
    "Use Platform Users to inspect accounts across tenants without changing tenant-scoped permissions.",
  "superAdmin.help.customers.point3":
    "Keep tenant-scoped changes inside their own workflows; the platform shell is for oversight.",
  "superAdmin.help.billing.title": "Billing & Plans",
  "superAdmin.help.billing.summary":
    "Manage packages, subscriptions, payments, refunds, and quota overrides.",
  "superAdmin.help.billing.point1":
    "Use Packages to manage versioned commercial plans and their entitlements.",
  "superAdmin.help.billing.point2":
    "Use Subscriptions, Payment Diagnostics, and Refund Reviews to follow the billing lifecycle.",
  "superAdmin.help.billing.point3":
    "Apply Quota Overrides only when you need to adjust platform limits deliberately.",
  "superAdmin.help.systemHealth.title": "System Health",
  "superAdmin.help.systemHealth.summary":
    "Read the live state of API, MongoDB, Redis, and background workers.",
  "superAdmin.help.systemHealth.point1":
    "Healthy means the service probe succeeded; degraded or unavailable means a real dependency failed.",
  "superAdmin.help.systemHealth.point2":
    "Refresh the page if you are validating a recovery, restart, or connectivity change.",
  "superAdmin.help.systemHealth.point3":
    "Use the worker signal to confirm that the queue consumer is alive, not just configured.",
  "superAdmin.help.aiConfiguration.title": "AI Configuration",
  "superAdmin.help.aiConfiguration.summary":
    "Review the effective runtime defaults used by AI providers and generation calls.",
  "superAdmin.help.aiConfiguration.point1":
    "Provider, chat model, embedding model, temperature, and output-token limits are validated before they are applied.",
  "superAdmin.help.aiConfiguration.point2":
    "Embedding changes should be treated carefully because incompatible vectors require reprocessing.",
  "superAdmin.help.aiConfiguration.point3":
    "Save only values that the configured provider actually supports.",
  "superAdmin.help.analytics.title": "Usage / Analytics",
  "superAdmin.help.analytics.summary":
    "Track platform usage, costs, and cross-tenant trends.",
  "superAdmin.help.analytics.point1":
    "Usage & Costs summarizes operational volume and estimated spend.",
  "superAdmin.help.analytics.point2":
    "AI Analytics Deep Dive is where you inspect cross-tenant performance patterns.",
  "superAdmin.help.analytics.point3":
    "Use these views for investigation and planning, not for tenant-level editing.",
  "superAdmin.help.security.title": "Security & Audit",
  "superAdmin.help.security.summary":
    "Audit platform changes and confirm that control remains scoped.",
  "superAdmin.help.security.point1":
    "Security & Audit records administrative activity and high-value operational changes.",
  "superAdmin.help.security.point2":
    "Use audit data to verify who changed platform settings and when.",
  "superAdmin.help.security.point3":
    "Keep tenant isolation intact: platform oversight does not grant tenant mutation access.",
  "superAdmin.help.settings.title": "Global Settings",
  "superAdmin.help.settings.summary":
    "Adjust platform-wide defaults that affect the whole product.",
  "superAdmin.help.settings.point1":
    "Global Settings covers support contacts, maintenance mode, registrations, and retention defaults.",
  "superAdmin.help.settings.point2":
    "Treat platform-wide edits as production changes and confirm the impact before saving.",
  "superAdmin.help.settings.point3":
    "Use the page only for values that are truly global to DocuMind AI.",
  "superAdmin.help.troubleshooting.title": "Troubleshooting",
  "superAdmin.help.troubleshooting.summary":
    "Common checks when platform pages or services look unhealthy.",
  "superAdmin.help.troubleshooting.point1":
    "If a service turns unavailable, confirm the API, Redis, MongoDB, and worker processes are actually up.",
  "superAdmin.help.troubleshooting.point2":
    "If AI settings appear unchanged, reload the page and verify that the saved values were accepted.",
  "superAdmin.help.troubleshooting.point3":
    "If a route disappears, verify whether it was intentionally removed from the navigation.",

  /* ── Subscriptions ─────────────────────────────────────── */
  "superAdmin.subsTitle": "Subscriptions",
  "superAdmin.subsShortDesc": "Platform subscription operations.",
  "superAdmin.subsDesc":
    "Provision local subscriptions, assign immutable package versions, and apply legal administrative transitions.",
  "superAdmin.subsNoPermission":
    "You do not have permission to view subscriptions.",
  "superAdmin.subsOperation": "Subscription operation",
  "superAdmin.subsSelectCompany": "Select company",
  "superAdmin.subsTenantOption": "{{name}} — {{state}}",
  "superAdmin.subsSubscriptionExists": "subscription exists",
  "superAdmin.subsNoSubscriptionShort": "no subscription",
  "superAdmin.subsActivePackage": "Active package",
  "superAdmin.subsSelectPackage": "Select package",
  "superAdmin.subsLoadDetailError": "Unable to load subscription details.",
  "superAdmin.subsCurrentLabel": "Current:",
  "superAdmin.subsCurrentSummary":
    "{{package}} v{{version}} · {{status}} · revision {{revision}}",
  "superAdmin.subsProviderOwnershipLabel": "Provider ownership:",
  "superAdmin.subsProviderManagedNote":
    "Provider-managed (local override blocked)",
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
  "superAdmin.subsNoSubscriptionForCompany":
    "This company has no subscription.",
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

  /* Platform Analytics */
  "superAdmin.analytics.title": "Platform Analytics & Cross-Tenant Insights",
  "superAdmin.analytics.description":
    "Global system telemetry, operational cost analysis, and cross-tenant quality monitoring.",
  "superAdmin.analytics.loadError": "Failed to load platform analytics",
  "superAdmin.analytics.platformQueries": "Platform Queries",
  "superAdmin.analytics.allTenantsCombined": "All tenants combined",
  "superAdmin.analytics.platformTokens": "Platform Tokens",
  "superAdmin.analytics.globalTokenConsumption": "Global token consumption",
  "superAdmin.analytics.providerCost": "Provider Cost",
  "superAdmin.analytics.reconciled": "Reconciled",
  "superAdmin.analytics.avgLatency": "Avg Latency",
  "superAdmin.analytics.systemWideSla": "System-wide SLA",
  "superAdmin.analytics.quotaDrift": "Quota Drift",
  "superAdmin.analytics.entitlementDiscrepancies": "Entitlement discrepancies",
  "superAdmin.analytics.globalTraffic": "Global Platform Traffic",

  /* Payment Diagnostics */
  "superAdmin.payments.title": "Payment Diagnostics",
  "superAdmin.payments.desc":
    "Monitor webhook events, reprocess failures, and reconcile subscription state.",
  "superAdmin.payments.reprocessed": "Event {{eventId}} reprocessed.",
  "superAdmin.payments.reprocessFailed": "Failed to reprocess event.",
  "superAdmin.payments.reconcileComplete":
    "Reconciliation complete. Subscription mismatches found: {{mismatches}}. Refund transitions completed: {{transitions}}.",
  "superAdmin.payments.reconcileMigrationRequired":
    "Subscription index migration is required before refund transitions can be repaired.",
  "superAdmin.payments.reconcileFailed": "Reconciliation failed.",
  "superAdmin.payments.reconciling": "Reconciling…",
  "superAdmin.payments.runReconciliation": "Run reconciliation",
  "superAdmin.payments.reconcileResultsTitle": "Reconciliation results",
  "superAdmin.payments.reconcileSubscriptionsLine":
    "Subscriptions checked: {{examined}}; mismatches: {{mismatches}}",
  "superAdmin.payments.reconcileIndexLine":
    "Subscription index: {{status}}; effective duplicate tenants: {{duplicates}}",
  "superAdmin.payments.reconcileRefundsLine":
    "Refund settlements examined: {{examined}}; eligible repairs: {{eligible}}; transitions completed: {{completed}}; provider cancellations retryable: {{retryable}}",
  "superAdmin.payments.reconcileInvoicesLine":
    "Invoices examined: {{examined}}; created: {{created}}; updated: {{updated}}; failed: {{failed}}",
  "superAdmin.payments.invoiceFailure":
    "{{classification}}: {{count}} ({{code}})",
  "superAdmin.payments.invoiceFailureRetryable":
    "{{classification}}: {{count}} ({{code}}) — retry pending",
  "superAdmin.payments.mismatchTenantLabel": "Tenant:",
  "superAdmin.payments.mismatchStatusLabel": "Status:",
  "superAdmin.payments.mismatchIssuesLabel": "Issues:",
  "superAdmin.payments.tableEventId": "Event ID",
  "superAdmin.payments.tableType": "Type",
  "superAdmin.payments.tableErrors": "Errors",
  "superAdmin.payments.tableProcessed": "Processed",
  "superAdmin.payments.tableActions": "Actions",
  "superAdmin.payments.reprocessButton": "Reprocess",
  "superAdmin.payments.eventStatus.received": "Received",
  "superAdmin.payments.eventStatus.verified": "Verified",
  "superAdmin.payments.eventStatus.processed": "Processed",
  "superAdmin.payments.eventStatus.failed": "Failed",
  "superAdmin.payments.none": "No payment events found.",
  "superAdmin.indexStatus.ready": "Ready",
  "superAdmin.indexStatus.migration_required": "Migration Required",

  /* ── Packages ──────────────────────────────────────────── */
  "superAdmin.packages.title": "Packages",
  "superAdmin.packages.desc":
    "Create versioned SaaS packages and manage platform limits.",
  "superAdmin.packages.new": "New package",
  "superAdmin.packages.noPermission":
    "You do not have permission to view packages.",
  "superAdmin.packages.none": "No packages have been created yet.",
  "superAdmin.packages.manage": "Manage",
  "superAdmin.packages.actions": "Actions",
  "superAdmin.packages.monthly": "Monthly",
  "superAdmin.packages.annual": "Annual",
  "superAdmin.packages.trial": "Trial",
  "superAdmin.packages.employees": "Employees",
  "superAdmin.packages.queriesPerMonthShort": "Queries/mo",
  "superAdmin.packages.visibility": "Visibility",
  "superAdmin.packages.noTrial": "No trial",

  /* Package detail */
  "superAdmin.packages.detailTitle": "Package Details",
  "superAdmin.packages.detailDesc":
    "Update this package to create a new immutable version snapshot.",
  "superAdmin.packages.commercialDetails": "Commercial details",
  "superAdmin.packages.pricing": "Pricing",
  "superAdmin.packages.monthlyPrice": "Monthly price",
  "superAdmin.packages.annualPrice": "Annual price",
  "superAdmin.packages.notSet": "Not set",
  "superAdmin.packages.currency": "Currency",
  "superAdmin.packages.trialDaysLabel": "Trial days",
  "superAdmin.packages.entitlements": "Entitlements",
  "superAdmin.packages.admins": "Admins",
  "superAdmin.packages.megabytes": "{{value}} MB",
  "superAdmin.packages.maxFileSize": "Max file size",
  "superAdmin.packages.queriesPerMonth": "Queries / month",
  "superAdmin.packages.tokensPerMonth": "Tokens / month",
  "superAdmin.packages.ocrPagesPerMonth": "OCR pages / month",
  "superAdmin.packages.features": "Features",
  "superAdmin.packages.supportedModels": "Supported models",
  "superAdmin.packages.analyticsLevel": "Analytics level",
  "superAdmin.packages.retention": "Retention",
  "superAdmin.packages.supportLevel": "Support level",
  "superAdmin.packages.versionHistory": "Version history",
  "superAdmin.packages.models": "Models",
  "superAdmin.packages.analytics": "Analytics",
  "superAdmin.packages.support": "Support",
  "superAdmin.packages.versionLabel": "v{{version}}",
  "superAdmin.packages.versionCurrent": "v{{version}} (current)",
  "superAdmin.packages.versionSummary.zero":
    "{{count}} versions — each snapshot is immutable once created.",
  "superAdmin.packages.versionSummary.one":
    "{{count}} version — each snapshot is immutable once created.",
  "superAdmin.packages.versionSummary.two":
    "{{count}} versions — each snapshot is immutable once created.",
  "superAdmin.packages.versionSummary.few":
    "{{count}} versions — each snapshot is immutable once created.",
  "superAdmin.packages.versionSummary.many":
    "{{count}} versions — each snapshot is immutable once created.",
  "superAdmin.packages.versionSummary.other":
    "{{count}} versions — each snapshot is immutable once created.",
  "superAdmin.packages.daysCount.zero": "{{count}} days",
  "superAdmin.packages.daysCount.one": "{{count}} day",
  "superAdmin.packages.daysCount.two": "{{count}} days",
  "superAdmin.packages.daysCount.few": "{{count}} days",
  "superAdmin.packages.daysCount.many": "{{count}} days",
  "superAdmin.packages.daysCount.other": "{{count}} days",
  "superAdmin.packages.daysCompact.zero": "{{count}}d",
  "superAdmin.packages.daysCompact.one": "{{count}}d",
  "superAdmin.packages.daysCompact.two": "{{count}}d",
  "superAdmin.packages.daysCompact.few": "{{count}}d",
  "superAdmin.packages.daysCompact.many": "{{count}}d",
  "superAdmin.packages.daysCompact.other": "{{count}}d",

  /* Package lifecycle dialog */
  "superAdmin.packages.archive": "Archive package",
  "superAdmin.packages.activate": "Activate package",
  "superAdmin.packages.closeDialog": "Close {{title}}",
  "superAdmin.packages.dialogSubtitle": "{{name}} · {{code}} · v{{version}}",
  "superAdmin.packages.loadingImpact": "Loading impact…",
  "superAdmin.packages.impactError": "Unable to load package impact.",
  "superAdmin.packages.subscriptionsUsing": "Subscriptions using package:",
  "superAdmin.packages.landingVisibility": "Landing visibility:",
  "superAdmin.packages.affectedState": "{{state}}: {{count}}",
  "superAdmin.packages.blockedReason": "Blocked: {{reason}}",
  "superAdmin.packages.reason": "Reason",
  "superAdmin.packages.reasonHelp":
    "At least 3 characters; recorded in the audit trail.",
  "superAdmin.packages.versionConflict":
    "This package changed in another session. Current data is being reloaded.",
  "superAdmin.packages.transitionFailed": "Package transition failed.",
  "superAdmin.packages.working": "Working…",
  "superAdmin.packages.landingImpact.removed": "Removed",
  "superAdmin.packages.landingImpact.restored": "Restored",
  "superAdmin.packages.landingImpact.unchanged": "Unchanged",

  /* Package enum labels — codes stay English, only labels translate */
  "superAdmin.packageState.active": "Active",
  "superAdmin.packageState.inactive": "Inactive",
  "superAdmin.packageVisibility.public": "Public",
  "superAdmin.packageVisibility.internal": "Internal",
  "superAdmin.analyticsLevel.basic": "Basic",
  "superAdmin.analyticsLevel.advanced": "Advanced",
  "superAdmin.analyticsLevel.enterprise": "Enterprise",
  "superAdmin.supportLevel.community": "Community",
  "superAdmin.supportLevel.standard": "Standard",
  "superAdmin.supportLevel.priority": "Priority",
  "superAdmin.supportLevel.dedicated": "Dedicated",

  /* ── Company detail ────────────────────────────────────── */
  "superAdmin.companies.backLink": "Companies",
  "superAdmin.companies.viewAction": "View",
  "superAdmin.companies.plan": "Plan",
  "superAdmin.companies.overview": "Company Overview",
  "superAdmin.companies.people": "People",
  "superAdmin.companies.usage": "Usage",
  "superAdmin.companies.record": "Record",
  "superAdmin.companies.users": "Users",
  "superAdmin.companies.companyAdmins": "Company Admins",
  "superAdmin.companies.usersValue": "{{active}} active / {{total}} total",
  "superAdmin.companies.subscription": "Subscription",
  "superAdmin.companies.statusLabel": "Status:",
  "superAdmin.companies.providerLabel": "Provider:",
  "superAdmin.companies.periodStartLabel": "Period start:",
  "superAdmin.companies.periodEndLabel": "Period end:",
  "superAdmin.companies.cancelAtPeriodEndLabel": "Cancel at period end:",
  "superAdmin.companies.nameLabel": "Name:",
  "superAdmin.companies.codeLabel": "Code:",
  "superAdmin.companies.versionLabel": "Version:",
  "superAdmin.companies.maxEmployeesLabel": "Max employees:",
  "superAdmin.companies.maxAdminsLabel": "Max admins:",
  "superAdmin.companies.maxDocumentsLabel": "Max documents:",
  "superAdmin.companies.storageLabel": "Storage:",
  "superAdmin.companies.queriesPerMonthLabel": "Queries/month:",
  "superAdmin.companies.fileSizeLabel": "File size:",
  "superAdmin.companies.recentActivity": "Recent Activity",
  "superAdmin.companies.byActor": "by {{email}}",
  "superAdmin.companies.noSubscriptionOrPackage":
    "No subscription or package configured for this tenant.",
  "superAdmin.companies.allPlans": "All plans",

  /* Company lifecycle dialog */
  "superAdmin.companies.suspend": "Suspend company",
  "superAdmin.companies.reinstate": "Reinstate company",
  "superAdmin.companies.suspendTitle": "Suspend company",
  "superAdmin.companies.reinstateTitle": "Reinstate company",
  "superAdmin.companies.suspendDescription":
    "Suspending this company restricts access for all users. Company users may lose access to their DocuMind AI workspace.",
  "superAdmin.companies.reinstateDescription":
    "Reactivating this company restores access for active company users.",
  "superAdmin.companies.closeDialog": "Close {{title}}",
  "superAdmin.companies.currentStatusLabel": "Current status:",
  "superAdmin.companies.previewError":
    "Unable to load preview. Please try again.",
  "superAdmin.companies.operationFailed": "Operation failed.",
  "superAdmin.companies.usersAffectedLabel": "Users affected:",
  "superAdmin.companies.adminsAffectedLabel": "Admins affected:",
  "superAdmin.companies.documentsLabel": "Documents:",
  "superAdmin.companies.subscriptionLabel": "Subscription:",
  "superAdmin.companies.noSubscriptionValue": "none",
  "superAdmin.companies.reasonPlaceholder":
    "Enter a reason (minimum 3 characters)...",
  "superAdmin.companies.reasonTooLong":
    "Reason must be 500 characters or fewer",
  "superAdmin.companies.reasonValid": "Reason is valid",
  "superAdmin.companies.suspendSuccess": "Company suspended successfully.",
  "superAdmin.companies.reinstateSuccess": "Company reinstated successfully.",
  "superAdmin.companies.charactersNeeded.zero":
    "{{count}} more characters needed",
  "superAdmin.companies.charactersNeeded.one":
    "{{count}} more character needed",
  "superAdmin.companies.charactersNeeded.two":
    "{{count}} more characters needed",
  "superAdmin.companies.charactersNeeded.few":
    "{{count}} more characters needed",
  "superAdmin.companies.charactersNeeded.many":
    "{{count}} more characters needed",
  "superAdmin.companies.charactersNeeded.other":
    "{{count}} more characters needed",

  /* ── Companies list (companies view) ─────────────────────── */
  "superAdmin.companies.loading": "Loading companies",
  "superAdmin.companies.loadingCount": "Loading company count…",
  "superAdmin.companies.count.zero": "{{count}} companies",
  "superAdmin.companies.count.one": "{{count}} company",
  "superAdmin.companies.count.two": "{{count}} companies",
  "superAdmin.companies.count.few": "{{count}} companies",
  "superAdmin.companies.count.many": "{{count}} companies",
  "superAdmin.companies.count.other": "{{count}} companies",
  "superAdmin.companies.searchLabel": "Search companies",
  "superAdmin.companies.filtersLabel": "Company filters",
  "superAdmin.companies.noMatch": "No companies match these filters",
  "superAdmin.companies.noMatchHint": "Try clearing or changing the filters.",
  "superAdmin.companies.noneYet": "No companies yet",
  "superAdmin.companies.noneYetHint":
    "Companies will appear here when available.",
  "superAdmin.companies.loadError":
    "Unable to load companies. Please try again.",
  "superAdmin.companies.loadingError":
    "Unable to load plan options. Please try again.",
  "superAdmin.companies.noPermission":
    "You do not have permission to manage companies.",

  /* Tenant + audit enum labels — codes stay English */
  "superAdmin.tenantStatus.active": "Active",
  "superAdmin.tenantStatus.trial": "Trial",
  "superAdmin.tenantStatus.pending": "Pending",
  "superAdmin.tenantStatus.pending_verification": "Pending Verification",
  "superAdmin.tenantStatus.suspended": "Suspended",
  "superAdmin.auditOutcome.success": "Success",
  "superAdmin.auditOutcome.failure": "Failure",
  "superAdmin.auditOutcome.denied": "Denied",
  "superAdmin.subsProvider.stripe": "Stripe",
  "superAdmin.subsProvider.manual": "Manual",
  "superAdmin.subsProvider.none": "None",
  "superAdmin.tenantPlan.free": "Free",
  "superAdmin.tenantPlan.trial": "Trial",
  "superAdmin.tenantPlan.pro": "Pro",

  /* ── Standalone platform shell + tenant detail ─────────── */
  /* "DocuMind AI" is the product name and stays untranslated. */
  "superAdmin.platformBrand": "DocuMind AI Platform",
  "superAdmin.platformTenants.back": "Back to tenants",
  "superAdmin.platformTenants.loading": "Loading tenant",
  "superAdmin.platformTenants.eyebrow": "Tenant details",
  "superAdmin.platformTenants.questions": "Questions",
  "superAdmin.platformTenants.notFound": "Tenant not found.",
  "superAdmin.platformTenants.invalidId": "Invalid tenant ID.",
  "superAdmin.platformTenants.loadError": "Unable to load this tenant.",

  /* ── Package form ──────────────────────────────────────── */
  "superAdmin.packageForm.noPermission":
    "You do not have permission to create or version packages.",
  "superAdmin.packageForm.versionBumpTitle": "Version bump",
  "superAdmin.packageForm.versionBumpBody":
    "Editing will create a new version. Existing subscriptions retain the current snapshot.",
  "superAdmin.packageForm.basicInfo": "Basic Information",
  "superAdmin.packageForm.name": "Name",
  "superAdmin.packageForm.code": "Code",
  "superAdmin.packageForm.description": "Description",
  "superAdmin.packageForm.monthlyPriceMinor": "Monthly price (minor units)",
  "superAdmin.packageForm.annualPriceMinor": "Annual price (minor units)",
  "superAdmin.packageForm.trialDays": "Trial (days)",
  "superAdmin.packageForm.storageMb": "Storage (MB)",
  "superAdmin.packageForm.maxFileSizeMb": "Max file size (MB)",
  "superAdmin.packageForm.retentionDays": "Retention (days)",
  "superAdmin.packageForm.modelsHint":
    "Comma-separated. Suggestions: {{models}}",
  "superAdmin.packageForm.visibilityPublicHelp":
    "— visible to all companies during provisioning.",
  "superAdmin.packageForm.visibilityInternalHelp":
    "— only the super admin can assign it.",
  "superAdmin.packageForm.versionConflict":
    "This package changed in another session. Current data has been reloaded; review it before saving again.",
  "superAdmin.packageForm.saveError":
    "Unable to save this package. Check the values and try again.",
  "superAdmin.packageForm.saving": "Saving…",
  "superAdmin.packageForm.updatePackage": "Update package",
  "superAdmin.packageForm.savePackage": "Save package",

  /* ── Subscription operation dialog ─────────────────────── */
  "superAdmin.subsOperation.confirmTitle": "Confirm Subscription Change",
  "superAdmin.subsOperation.closeDialog": "Close dialog",
  "superAdmin.subsOperation.loadingPreview": "Loading impact preview…",
  "superAdmin.subsOperation.previewError":
    "Unable to load subscription impact.",
  "superAdmin.subsOperation.retryPreview": "Retry preview",
  "superAdmin.subsOperation.modeLabel": "Mode:",
  "superAdmin.subsOperation.noSubscription": "No subscription",
  "superAdmin.subsOperation.targetPackageLabel": "Target package:",
  "superAdmin.subsOperation.targetPackageValue": "{{name}} v{{version}}",
  "superAdmin.subsOperation.unchanged": "Unchanged",
  "superAdmin.subsOperation.reasonLabel": "Administrative reason",
  "superAdmin.subsOperation.applying": "Applying…",
  "superAdmin.subsOperation.operationFailed":
    "Unable to complete the subscription operation.",
  "superAdmin.operationMode.local-only": "Local only",
  "superAdmin.operationMode.provider-managed": "Provider-managed",

  "superAdmin.retrievalMethod.hybrid": "Hybrid",
  "superAdmin.retrievalMethod.vector": "Vector",
  "superAdmin.retrievalMethod.keyword": "Keyword",
  "superAdmin.sufficiencyLevel.sufficient": "Sufficient",
  "superAdmin.sufficiencyLevel.weak": "Weak",
  "superAdmin.sufficiencyLevel.conflicting": "Conflicting",
  "superAdmin.sufficiencyLevel.no_evidence": "No Evidence",

  /* ── Page headers for settings / AI config / new package ── */
  "superAdmin.globalSettings.title": "Global Settings",
  "superAdmin.globalSettings.description":
    "Configure registration, support, maintenance, trials, and retention defaults.",
  "superAdmin.aiConfiguration.title": "AI Configuration",
  "superAdmin.aiConfiguration.description":
    "Manage platform-wide model defaults without exposing provider secrets to the browser.",
  "superAdmin.packageForm.newTitle": "New Package",
  "superAdmin.packageForm.newDescription":
    "Define pricing and usage limits for a new package.",

  /* Platform email diagnostics. "SMTP" is a protocol name and stays as-is. */
  "superAdmin.platformEmails.title": "Email Infrastructure Diagnostics",
  "superAdmin.platformEmails.description":
    "Monitor the global email queue and test provider connectivity.",
  "superAdmin.platformEmails.smtpTitle": "SMTP Connection",
  "superAdmin.platformEmails.smtpDescription":
    "Send a test email to verify that the worker and SMTP configuration are functioning correctly.",
  "superAdmin.platformEmails.sendTest": "Send Test Email",
  "superAdmin.platformEmails.notImplemented": "Not implemented yet.",

  /* ── Companies list (tenants) ──────────────────────────── */
  "superAdmin.tenants.eyebrow": "Super Admin",
  "superAdmin.tenants.title": "Companies",
  "superAdmin.tenants.description":
    "Search, review, and manage organizations across DocuMind AI.",
  "superAdmin.tenants.loadingCount": "Loading tenant count…",
  "superAdmin.tenants.count.zero": "{{count}} tenants",
  "superAdmin.tenants.count.one": "{{count}} tenant",
  "superAdmin.tenants.count.two": "{{count}} tenants",
  "superAdmin.tenants.count.few": "{{count}} tenants",
  "superAdmin.tenants.count.many": "{{count}} tenants",
  "superAdmin.tenants.count.other": "{{count}} tenants",
  "superAdmin.tenants.filtersLabel": "Tenant filters",
  "superAdmin.tenants.searchLabel": "Search tenants",
  "superAdmin.tenants.searchPlaceholder": "Name or slug",
  "superAdmin.tenants.allStatuses": "All statuses",
  "superAdmin.tenants.planLegacy": "Plan (legacy)",
  "superAdmin.tenants.allPlans": "All plans",
  "superAdmin.tenants.clearFilters": "Clear filters",
  "superAdmin.tenants.loading": "Loading tenants",
  "superAdmin.tenants.noPermission":
    "You do not have permission to manage tenants.",
  "superAdmin.tenants.loadError": "Unable to load tenants. Please try again.",
  "superAdmin.tenants.noMatch": "No tenants match these filters",
  "superAdmin.tenants.noMatchHint": "Try clearing or changing the filters.",
  "superAdmin.tenants.noneYet": "No tenants yet",
  "superAdmin.tenants.noneYetHint": "Tenants will appear here when available.",
  "superAdmin.tenants.colEffectivePlan": "Effective Plan",
  "superAdmin.tenants.colPeriodStart": "Period Start",
  "superAdmin.tenants.colPeriodEnd": "Period End",
  "superAdmin.tenants.deprecated": "Deprecated",
  "superAdmin.tenants.legacySuffix": "(old)",
  "superAdmin.tenants.open": "Open",
  "superAdmin.tenants.manageTenant": "Manage {{name}}",
  "superAdmin.tenants.paginationLabel": "Tenant pagination",
  "superAdmin.tenants.rowsPerPage": "Rows per page",
  "superAdmin.tenants.statusChangeNote":
    "Status changes take effect immediately.",
  "superAdmin.tenants.subscriptionManagedNote":
    "Subscription changes are made on the Subscriptions page.",
  "superAdmin.tenants.subscriptionsLink": "Go to Subscriptions",
  "superAdmin.tenants.noSubscriptionNote":
    "No active subscription. Assign one on the Subscriptions page.",
  "superAdmin.tenants.confirmSuspend": "Confirm suspend",
  "superAdmin.tenants.confirmActivate": "Confirm activate",
  "superAdmin.tenants.updateSuccess": "Tenant updated successfully.",
  "superAdmin.tenants.updateError":
    "The tenant could not be updated. Please verify the requested change and try again.",

  /* ── Platform settings + AI configuration form ─────────── */
  "superAdmin.platformSettings.supportEmail": "Support Email",
  "superAdmin.platformSettings.maintenanceMode": "Maintenance Mode",
  "superAdmin.platformSettings.allowRegistrations": "Allow Registrations",
  "superAdmin.platformSettings.defaultTrialDays": "Default Trial Days",
  "superAdmin.platformSettings.dataRetentionDays": "Data Retention Days",
  "superAdmin.platformSettings.aiProvider": "Provider",
  "superAdmin.platformSettings.aiChatModel": "Chat Model",
  "superAdmin.platformSettings.aiEmbeddingModel": "Embedding Model",
  "superAdmin.platformSettings.aiMaxOutputTokens": "Max Output Tokens",
  "superAdmin.platformSettings.aiTemperature": "Temperature",
  "superAdmin.platformSettings.wholeNumber":
    "“{{field}}” must be a whole number.",
  "superAdmin.platformSettings.saveSuccess": "Settings saved successfully.",
  "superAdmin.platformSettings.saveError": "Unable to save settings.",
  "superAdmin.platformSettings.saving": "Saving…",
  "superAdmin.platformSettings.saveSettings": "Save settings",
};

export default enSuperAdmin;
