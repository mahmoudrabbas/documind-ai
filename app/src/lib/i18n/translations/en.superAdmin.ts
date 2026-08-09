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
};

export default enSuperAdmin;
