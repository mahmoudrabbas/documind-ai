/**
 * English translations — tenant dashboard pages.
 *
 * Overview, users, roles, audit, emails, notifications, knowledge gaps,
 * analytics, and failed-processing screens.
 *
 * Keys added here must have a matching entry in `ar.dashboard.ts` — the
 * parity test in `__tests__/i18n.test.ts` enforces it.
 */

import type { TranslationDictionary } from "../i18n.types";

const enDashboard: TranslationDictionary = {
  /* ── Emails ────────────────────────────────────────────── */
  "dashboard.emails.title": "Email Delivery Log",
  "dashboard.emails.description": "Monitor outgoing emails sent from your organization.",
  "dashboard.emails.refresh": "Refresh",
  "dashboard.emails.recipient": "Recipient",
  "dashboard.emails.subject": "Subject",
  "dashboard.emails.template": "Template",
  "dashboard.emails.status": "Status",
  "dashboard.emails.date": "Date",
  "dashboard.emails.actions": "Actions",
  "dashboard.emails.details": "Details",
  "dashboard.emails.resend": "Resend",
  "dashboard.emails.noEmails": "No emails found.",
  "dashboard.emails.rateLimitedTitle": "Rate limited. Try again after the cooldown.",

  /* ── Email States ──────────────────────────────────────── */
  "dashboard.emailState.sent": "Sent",
  "dashboard.emailState.delivered": "Delivered",
  "dashboard.emailState.failed": "Failed",
  "dashboard.emailState.pending": "Pending",
  "dashboard.emailState.bounced": "Bounced",
  "dashboard.emailState.permanent_failure": "Permanent Failure",
  "dashboard.emailState.temporary_failure": "Temporary Failure",
  "dashboard.emailState.cancelled": "Cancelled",
  "dashboard.emailState.suppressed": "Suppressed",
  "dashboard.emailState.processing": "Processing",
  "dashboard.emailState.queued": "Queued",

  /* ── Users ─────────────────────────────────────────────── */
  "dashboard.users.title": "User Directory",
  "dashboard.users.description": "Manage user accounts, roles, and status for your company.",
  "dashboard.users.inviteUser": "Invite User",
  "dashboard.users.importUsers": "Import Users",
  "dashboard.users.searchPlaceholder": "Search users by name or email…",
  "dashboard.users.name": "Name",
  "dashboard.users.email": "Email",
  "dashboard.users.role": "Role",
  "dashboard.users.status": "Status",
  "dashboard.users.verified": "Verified",
  "dashboard.users.created": "Created",
  "dashboard.users.actions": "Actions",
  "dashboard.users.yes": "Yes",
  "dashboard.users.no": "No",
  "dashboard.users.loadingDirectory": "Loading directory…",
  "dashboard.users.noUsers": "No users found.",
  "dashboard.userStatus.active": "Active",
  "dashboard.userStatus.pending_email_verification": "Pending verification",
  "dashboard.userStatus.disabled": "Disabled",
  "dashboard.userRole.employee": "Employee",
  "dashboard.userRole.company_admin": "Company Admin",

  /* ── Roles ─────────────────────────────────────────────── */
  "dashboard.roles.title": "Custom Roles",
  "dashboard.roles.description": "Define tenant roles using the authoritative permission catalog and delegated scopes.",
  "dashboard.roles.createRole": "Create Role",
  "dashboard.roles.cancel": "Cancel",
  "dashboard.roles.employee": "Employee",
  "dashboard.roles.companyAdmin": "Company Admin",
  "dashboard.roles.allStatuses": "All statuses",
  "dashboard.roles.active": "Active",
  "dashboard.roles.archived": "Archived",
  "dashboard.roles.searchPlaceholder": "Search roles by name…",
  "dashboard.roles.noRoles": "No roles found.",

  /* ── Knowledge Gaps ────────────────────────────────────── */
  "dashboard.knowledgeGaps.title": "Knowledge Gaps",
  "dashboard.knowledgeGaps.description": "Track unanswered questions and identify topics needing documentation.",
  "dashboard.knowledgeGaps.totalGaps": "Total Gaps",
  "dashboard.knowledgeGaps.openAssigned": "Open / Assigned",
  "dashboard.knowledgeGaps.resolved": "Resolved",
  "dashboard.knowledgeGaps.resolutionRate": "Resolution Rate",
  "dashboard.knowledgeGaps.allStatuses": "All Statuses",
  "dashboard.knowledgeGaps.allSeverities": "All Severities",
  "dashboard.knowledgeGaps.searchPlaceholder": "Search gaps…",
  "dashboard.knowledgeGaps.noGapsFound": "No knowledge gaps found",
  "dashboard.knowledgeGaps.emptyStateDesc": "Unanswered or negatively-rated questions will automatically appear here as gap candidates.",
  "dashboard.gapStatus.open": "Open",
  "dashboard.gapStatus.triaged": "Triaged",
  "dashboard.gapStatus.assigned": "Assigned",
  "dashboard.gapStatus.resolved": "Resolved",
  "dashboard.gapStatus.dismissed": "Dismissed",
  "dashboard.gapStatus.reopened": "Reopened",
  "dashboard.gapSeverity.low": "Low",
  "dashboard.gapSeverity.medium": "Medium",
  "dashboard.gapSeverity.high": "High",
  "dashboard.gapSeverity.critical": "Critical",
  "dashboard.gapSource.refusal": "Refusal",
  "dashboard.gapSource.weak_answer": "Weak answer",
  "dashboard.gapSource.conflict": "Conflict",
  "dashboard.gapSource.negative_feedback": "Negative feedback",
  "dashboard.gapSource.manual": "Added manually",
  "dashboard.gapCategory.inaccurate": "Inaccurate",
  "dashboard.gapCategory.incomplete": "Incomplete",
  "dashboard.gapCategory.irrelevant": "Irrelevant",
  "dashboard.gapCategory.harmful": "Harmful",
  "dashboard.gapCategory.other": "Other",
  "dashboard.gapCategory.unspecified": "Unspecified",
  "dashboard.gapOutcome.refused": "Refused",
  "dashboard.gapOutcome.weak": "Weak",
  "dashboard.gapOutcome.conflict": "Conflict",
  "dashboard.gapOutcome.negative_feedback": "Negative feedback",

  /* ── Processing Failed ─────────────────────────────────── */
  "dashboard.processingFailed.title": "Failed Document Processing",
  "dashboard.processingFailed.description": "Review and retry failed document processing runs across your workspace.",
  "dashboard.processingFailed.noFailedDocs": "No failed document processing runs found.",

  /* ── Analytics ─────────────────────────────────────────── */
  "dashboard.analytics.title": "Analytics & Insights",
  "dashboard.analytics.description": "Monitor system usage, processing performance, and cost breakdowns.",
  "dashboard.analytics.export": "Export Data",
};

export default enDashboard;
