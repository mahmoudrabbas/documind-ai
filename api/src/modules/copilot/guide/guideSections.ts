import { Permission } from "../../permissions/permissions.catalog.js";
import { normalizeText } from "./guideIntent.js";

/**
 * Catalog of every navigable section in the platform (mirrors the tenant and
 * platform sidebar links in `app/src/constants/routes.ts`). The guide agent
 * matches "show me <section>" utterances against `aliases`/labels and builds a
 * generic navigation guide from `navTargetId` + `route`.
 *
 * `navTargetId` values must exist in the guide target registry
 * (`guideTargets.ts`) — the parity test enforces this. `context` mirrors
 * `getAppContext`: `platform` sections are only navigable by platform (SUPER
 * ADMIN) actors.
 */
export type GuideSectionContext = "tenant" | "platform";

export interface GuideSection {
  sectionId: string;
  route: string;
  navTargetId: string;
  /**
   * Optional per-page confirmation anchor. When set, the navigation guide's
   * second step spotlights this element on the destination page (a meaningful,
   * small target). When absent, the guide falls back to the sidebar nav link so
   * the confirmation step always stays visible.
   */
  pageTargetId?: string;
  context: GuideSectionContext;
  labelEn: string;
  labelAr: string;
  aliases: readonly string[];
  requiredPermissions: readonly string[];
}

export const GUIDE_SECTIONS: readonly GuideSection[] = [
  // ── tenant ───────────────────────────────────────────────────────────────
  {
    sectionId: "overview",
    route: "/dashboard",
    navTargetId: "nav-overview",
    pageTargetId: "page-heading-overview",
    context: "tenant",
    labelEn: "Overview",
    labelAr: "نظرة عامة",
    aliases: ["overview", "dashboard", "home"],
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    sectionId: "documents",
    route: "/dashboard/documents",
    navTargetId: "nav-documents",
    pageTargetId: "page-heading-documents",
    context: "tenant",
    labelEn: "Documents",
    labelAr: "المستندات",
    aliases: ["documents", "docs", "files", "document library", "file manager"],
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    sectionId: "users",
    route: "/dashboard/users",
    navTargetId: "nav-users",
    pageTargetId: "page-heading-users",
    context: "tenant",
    labelEn: "Users",
    labelAr: "المستخدمون",
    aliases: ["users", "team", "members", "employees", "user management"],
    requiredPermissions: [Permission.USERS_READ],
  },
  {
    sectionId: "roles",
    route: "/dashboard/roles",
    navTargetId: "nav-roles",
    pageTargetId: "page-heading-roles",
    context: "tenant",
    labelEn: "Roles",
    labelAr: "الأدوار",
    aliases: ["roles", "role management", "access control", "permissions"],
    requiredPermissions: [Permission.ROLES_READ],
  },
  {
    sectionId: "billing",
    route: "/dashboard/settings/billing",
    navTargetId: "nav-billing",
    pageTargetId: "page-heading-billing",
    context: "tenant",
    labelEn: "Billing",
    labelAr: "الفوترة",
    aliases: ["billing", "invoices", "invoices page", "payment methods", "subscription", "plan"],
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    sectionId: "usage",
    route: "/company/usage",
    navTargetId: "nav-company-usage",
    pageTargetId: "page-heading-usage",
    context: "tenant",
    labelEn: "Usage & Limits",
    labelAr: "الاستخدام والحدود",
    aliases: ["usage", "usage and limits", "limits", "quota", "capacity", "company usage"],
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    sectionId: "settings",
    route: "/dashboard/settings",
    navTargetId: "nav-settings",
    pageTargetId: "page-heading-settings",
    context: "tenant",
    labelEn: "Settings",
    labelAr: "الإعدادات",
    aliases: ["settings", "preferences", "company settings", "profile"],
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    sectionId: "document-taxonomy",
    route: "/dashboard/settings/document-taxonomy",
    navTargetId: "nav-document-taxonomy",
    pageTargetId: "page-heading-document-taxonomy",
    context: "tenant",
    labelEn: "Document Taxonomy",
    labelAr: "تصنيف المستندات",
    aliases: ["taxonomy", "document taxonomy", "categories", "classification", "document categories"],
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    sectionId: "audit",
    route: "/dashboard/audit",
    navTargetId: "nav-audit",
    pageTargetId: "page-heading-audit",
    context: "tenant",
    labelEn: "Audit Log",
    labelAr: "سجل التدقيق",
    aliases: ["audit", "audit log", "audit logs", "activity log", "activity logs", "logs"],
    requiredPermissions: [Permission.AUDIT_READ],
  },
  {
    sectionId: "emails",
    route: "/dashboard/emails",
    navTargetId: "nav-emails",
    pageTargetId: "page-heading-emails",
    context: "tenant",
    labelEn: "Email Log",
    labelAr: "سجل البريد الإلكتروني",
    aliases: ["email", "emails", "email log", "email logs", "mail", "mail log", "mail logs", "outbound email"],
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    sectionId: "chat",
    route: "/dashboard/chat",
    navTargetId: "nav-chat",
    context: "tenant",
    labelEn: "Chat",
    labelAr: "المحادثة",
    aliases: ["chat", "assistant", "ai chat", "conversation"],
    requiredPermissions: [Permission.CHAT_READ],
  },
  {
    sectionId: "knowledge-gaps",
    route: "/dashboard/knowledge-gaps",
    navTargetId: "nav-knowledge-gaps",
    pageTargetId: "page-heading-knowledge-gaps",
    context: "tenant",
    labelEn: "Knowledge Gaps",
    labelAr: "فجوات المعرفة",
    aliases: ["knowledge gaps", "knowledge gaps page", "gaps", "missing knowledge"],
    requiredPermissions: [Permission.KNOWLEDGE_GAPS_READ],
  },
  {
    sectionId: "analytics",
    route: "/dashboard/analytics",
    navTargetId: "nav-analytics",
    pageTargetId: "page-heading-analytics",
    context: "tenant",
    labelEn: "Analytics & Insights",
    labelAr: "التحليلات والرؤى",
    aliases: ["analytics", "insights", "analytics and insights", "reports", "statistics"],
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    sectionId: "processing-failed",
    route: "/dashboard/processing-failed",
    navTargetId: "nav-processing-failed",
    pageTargetId: "page-heading-processing-failed",
    context: "tenant",
    labelEn: "Failed Processing",
    labelAr: "المعالجة الفاشلة",
    aliases: ["failed processing", "processing failed", "failed documents", "errors", "failed"],
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },

  // ── platform ─────────────────────────────────────────────────────────────
  {
    sectionId: "sa-overview",
    route: "/super-admin",
    navTargetId: "nav-sa-overview",
    context: "platform",
    labelEn: "Platform Overview",
    labelAr: "نظرة عامة على المنصة",
    aliases: ["platform overview", "platform home", "admin overview"],
    requiredPermissions: [Permission.AUDIT_READ],
  },
  {
    sectionId: "sa-companies",
    route: "/super-admin/companies",
    navTargetId: "nav-sa-companies",
    context: "platform",
    labelEn: "Companies",
    labelAr: "الشركات",
    aliases: ["companies", "company list", "tenants", "organizations"],
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    sectionId: "sa-packages",
    route: "/super-admin/packages",
    navTargetId: "nav-sa-packages",
    context: "platform",
    labelEn: "Packages",
    labelAr: "الباقات",
    aliases: ["packages", "plans", "pricing", "package management"],
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    sectionId: "sa-subscriptions",
    route: "/super-admin/subscriptions",
    navTargetId: "nav-sa-subscriptions",
    context: "platform",
    labelEn: "Subscriptions",
    labelAr: "الاشتراكات",
    aliases: ["subscriptions", "subscriptions page", "active subscriptions"],
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    sectionId: "sa-users",
    route: "/super-admin/users",
    navTargetId: "nav-sa-users",
    context: "platform",
    labelEn: "Platform Users",
    labelAr: "مستخدمو المنصة",
    aliases: ["platform users", "platform users page", "admin users"],
    requiredPermissions: [Permission.USERS_READ],
  },
  {
    sectionId: "sa-usage",
    route: "/super-admin/usage",
    navTargetId: "nav-sa-usage",
    context: "platform",
    labelEn: "Usage & Costs",
    labelAr: "الاستخدام والتكاليف",
    aliases: ["usage and costs", "platform usage", "costs", "cost analysis"],
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
  {
    sectionId: "sa-jobs",
    route: "/super-admin/jobs",
    navTargetId: "nav-sa-jobs",
    context: "platform",
    labelEn: "Processing Jobs",
    labelAr: "مهام المعالجة",
    aliases: ["processing jobs", "jobs", "job list", "processing tasks"],
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    sectionId: "sa-processing-overview",
    route: "/super-admin/processing-overview",
    navTargetId: "nav-sa-processing-overview",
    context: "platform",
    labelEn: "Processing Overview",
    labelAr: "نظرة عامة على المعالجة",
    aliases: ["processing overview", "pipeline overview", "processing"],
    requiredPermissions: [Permission.DOCUMENTS_READ],
  },
  {
    sectionId: "sa-system-health",
    route: "/super-admin/system-health",
    navTargetId: "nav-sa-system-health",
    context: "platform",
    labelEn: "System Health",
    labelAr: "صحة النظام",
    aliases: ["system health", "health", "status", "system status"],
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    sectionId: "sa-retrieval-debug",
    route: "/super-admin/retrieval-debug",
    navTargetId: "nav-sa-retrieval-debug",
    context: "platform",
    labelEn: "Retrieval Debug",
    labelAr: "تصحيح الاسترجاع",
    aliases: ["retrieval debug", "retrieval", "debug", "search debug"],
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    sectionId: "sa-ai-configuration",
    route: "/super-admin/ai-configuration",
    navTargetId: "nav-sa-ai-configuration",
    context: "platform",
    labelEn: "AI Configuration",
    labelAr: "إعدادات الذكاء الاصطناعي",
    aliases: ["ai configuration", "ai config", "model configuration", "llm settings"],
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    sectionId: "sa-audit",
    route: "/super-admin/audit",
    navTargetId: "nav-sa-audit",
    context: "platform",
    labelEn: "Security & Audit",
    labelAr: "الأمان والتدقيق",
    aliases: ["security and audit", "platform audit", "security", "platform security"],
    requiredPermissions: [Permission.AUDIT_READ],
  },
  {
    sectionId: "sa-settings",
    route: "/super-admin/settings",
    navTargetId: "nav-sa-settings",
    context: "platform",
    labelEn: "Global Settings",
    labelAr: "الإعدادات العامة",
    aliases: ["global settings", "platform settings", "admin settings"],
    requiredPermissions: [Permission.COMPANY_SETTINGS_READ],
  },
  {
    sectionId: "sa-payments",
    route: "/super-admin/payments",
    navTargetId: "nav-sa-payments",
    context: "platform",
    labelEn: "Payment Diagnostics",
    labelAr: "تشخيص الدفع",
    aliases: ["payment diagnostics", "payments diagnostics", "payment logs", "payments"],
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    sectionId: "sa-refunds",
    route: "/super-admin/refunds",
    navTargetId: "nav-sa-refunds",
    context: "platform",
    labelEn: "Refund Reviews",
    labelAr: "مراجعة المبالغ المستردة",
    aliases: ["refunds", "refund reviews", "refund management"],
    requiredPermissions: [Permission.BILLING_READ],
  },
  {
    sectionId: "sa-entitlement",
    route: "/super-admin/entitlement",
    navTargetId: "nav-sa-entitlement",
    context: "platform",
    labelEn: "Quota Overrides",
    labelAr: "تجاوز الحصص",
    aliases: ["quota overrides", "quota", "overrides", "entitlement"],
    requiredPermissions: [Permission.BILLING_MANAGE],
  },
  {
    sectionId: "sa-analytics",
    route: "/super-admin/analytics",
    navTargetId: "nav-sa-analytics",
    context: "platform",
    labelEn: "AI Analytics",
    labelAr: "تحليلات الذكاء الاصطناعي",
    aliases: ["ai analytics", "ai analytics deep dive", "analytics deep dive", "deep dive"],
    requiredPermissions: [Permission.ANALYTICS_READ],
  },
] as const;

export function createGuideSectionRegistry(): Map<string, GuideSection> {
  const map = new Map<string, GuideSection>();
  for (const section of GUIDE_SECTIONS) {
    if (map.has(section.sectionId)) {
      throw new Error(`Duplicate guide section id: ${section.sectionId}`);
    }
    map.set(section.sectionId, section);
  }
  return map;
}

export function getGuideSection(sectionId: string): GuideSection | undefined {
  return createGuideSectionRegistry().get(sectionId);
}

/**
 * Match a free-form utterance against section labels/aliases. Matching is
 * token-aware so "show me the email logs" resolves `emails` but a bare "log"
 * does not over-match every section. Returns null when nothing matches.
 */
export function matchSectionToUtterance(
  utterance: string,
  context: GuideSectionContext,
  locale: "en" | "ar" = "en",
): GuideSection | null {
  const lower = normalizeText(utterance);
  let best: GuideSection | null = null;
  let bestScore = 0;

  for (const section of GUIDE_SECTIONS) {
    if (section.context !== context) continue;
    const label = locale === "ar" ? section.labelAr : section.labelEn;
    const needles = [normalizeText(label), ...section.aliases.map(normalizeText)];
    let score = 0;
    for (const needle of needles) {
      if (needle.length > 0 && lower.includes(needle)) {
        score = Math.max(score, needle.length);
      }
    }
    if (score > bestScore) {
      best = section;
      bestScore = score;
    }
  }

  return best;
}
