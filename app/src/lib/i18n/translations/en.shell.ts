/**
 * English translations — application shell.
 *
 * Navigation labels, the top bar, the sidebar drawer, and shared
 * design-system component defaults. Split out of `en.ts` so separate
 * feature areas can grow their own keys without editing one shared file.
 *
 * Keys added here must have a matching entry in `ar.shell.ts` — the
 * parity test in `__tests__/i18n.test.ts` enforces it.
 */

import type { TranslationDictionary } from "../i18n.types";

const enShell: TranslationDictionary = {
  /* ── Tenant navigation ─────────────────────────────────────────── */
  "nav.overview": "Overview",
  "nav.users": "Users",
  "nav.roles": "Roles",
  "nav.billing": "Billing",
  "nav.usageLimits": "Usage & Limits",
  "nav.documentTaxonomy": "Document Taxonomy",
  "nav.auditLog": "Audit Log",
  "nav.emailLog": "Email Log",
  "nav.knowledgeGaps": "Knowledge Gaps",
  "nav.analyticsInsights": "Analytics & Insights",
  "nav.failedProcessing": "Failed Processing",

  /* ── Platform navigation ───────────────────────────────────────── */
  "nav.companies": "Companies",
  "nav.packages": "Packages",
  "nav.subscriptions": "Subscriptions",
  "nav.platformUsers": "Platform Users",
  "nav.usageCosts": "Usage & Costs",
  "nav.processingJobs": "Processing Jobs",
  "nav.processingOverview": "Processing Overview",
  "nav.systemHealth": "System Health",
  "nav.retrievalDebug": "Retrieval Debug",
  "nav.aiConfiguration": "AI Configuration",
  "nav.securityAudit": "Security & Audit",
  "nav.globalSettings": "Global Settings",
  "nav.paymentDiagnostics": "Payment Diagnostics",
  "nav.refundReviews": "Refund Reviews",
  "nav.quotaOverrides": "Quota Overrides",
  "nav.aiAnalyticsDeepDive": "AI Analytics Deep Dive",

  /* ── Shell chrome ──────────────────────────────────────────────── */
  "shell.openNavigation": "Open navigation",
  "shell.closeNavigation": "Close navigation",
  "shell.primaryNavigation": "Primary navigation",
  "shell.searchPlaceholder": "Search knowledge base...",
  "shell.settings": "Settings",
  "shell.helpCenter": "Help Center",
  "shell.logout": "Logout",
  "shell.loggingOut": "Logging out…",
  "shell.enterpriseKnowledge": "Enterprise Knowledge",
  "shell.companyLogo": "Company logo",
  "shell.defaultUserName": "Admin User",
  "shell.roleCompanyAdmin": "Company Admin",
  "shell.roleUser": "User",

  /* ── Shared component defaults ─────────────────────────────────── */
  "shell.progress": "Progress",
  "shell.dragAndDropFile": "Drag and drop your file here, or",
  "shell.dropFileHere": "Drop your file here",
  "shell.browseFiles": "browse files",
  "shell.fileRequirements": "PDF, DOCX, TXT or MD — max 50 MB",
  "shell.selectedFile": "Selected file",
};

export default enShell;
