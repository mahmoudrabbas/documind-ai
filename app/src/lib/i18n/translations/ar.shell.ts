/**
 * Arabic translations — application shell.
 *
 * Mirrors `en.shell.ts` key-for-key.
 */

import type { TranslationDictionary } from "../i18n.types";

const arShell: TranslationDictionary = {
  /* ── Tenant navigation ─────────────────────────────────────────── */
  "nav.overview": "نظرة عامة",
  "nav.users": "المستخدمون",
  "nav.roles": "الأدوار",
  "nav.billing": "الفوترة",
  "nav.usageLimits": "الاستخدام والحدود",
  "nav.documentTaxonomy": "تصنيف المستندات",
  "nav.auditLog": "سجل التدقيق",
  "nav.emailLog": "سجل البريد الإلكتروني",
  "nav.knowledgeGaps": "فجوات المعرفة",
  "nav.analyticsInsights": "التحليلات والرؤى",
  "nav.failedProcessing": "المعالجة الفاشلة",

  /* ── Platform navigation ───────────────────────────────────────── */
  "nav.companies": "الشركات",
  "nav.packages": "الباقات",
  "nav.subscriptions": "الاشتراكات",
  "nav.platformUsers": "مستخدمو المنصة",
  "nav.usageCosts": "الاستخدام والتكاليف",
  "nav.processingJobs": "مهام المعالجة",
  "nav.processingOverview": "نظرة عامة على المعالجة",
  "nav.systemHealth": "حالة النظام",
  "nav.retrievalDebug": "تصحيح الاسترجاع",
  "nav.aiConfiguration": "إعدادات الذكاء الاصطناعي",
  "nav.securityAudit": "الأمان والتدقيق",
  "nav.globalSettings": "الإعدادات العامة",
  "nav.paymentDiagnostics": "تشخيص المدفوعات",
  "nav.refundReviews": "مراجعات الاسترداد",
  "nav.quotaOverrides": "تجاوزات الحصص",
  "nav.aiAnalyticsDeepDive": "تحليلات الذكاء الاصطناعي المتعمقة",

  /* ── Shell chrome ──────────────────────────────────────────────── */
  "shell.openNavigation": "فتح القائمة",
  "shell.closeNavigation": "إغلاق القائمة",
  "shell.primaryNavigation": "القائمة الرئيسية",
  "shell.searchPlaceholder": "ابحث في قاعدة المعرفة...",
  "shell.settings": "الإعدادات",
  "shell.helpCenter": "مركز المساعدة",
  "shell.logout": "تسجيل الخروج",
  "shell.loggingOut": "جارٍ تسجيل الخروج…",
  "shell.enterpriseKnowledge": "معرفة المؤسسة",
  "shell.companyLogo": "شعار الشركة",
  "shell.defaultUserName": "مستخدم مسؤول",
  "shell.roleCompanyAdmin": "مسؤول الشركة",
  "shell.roleUser": "مستخدم",

  /* ── Shared component defaults ─────────────────────────────────── */
  "shell.progress": "التقدم",
  "shell.dragAndDropFile": "اسحب ملفك وأفلته هنا، أو",
  "shell.dropFileHere": "أفلت ملفك هنا",
  "shell.browseFiles": "تصفح الملفات",
  "shell.fileRequirements": "PDF أو DOCX أو TXT أو MD — بحد أقصى 50 ميجابايت",
  "shell.selectedFile": "الملف المحدد",
};

export default arShell;
