/**
 * Arabic translations — platform / super-admin area.
 *
 * Mirrors `en.superAdmin.ts` key-for-key.
 */

import type { TranslationDictionary } from "../i18n.types";

const arSuperAdmin: TranslationDictionary = {
  "superAdmin.title": "نظرة عامة على المنصة",
  "superAdmin.description": "مراقبة الشركات والاستخدام والمعالجة والنشاط التشغيلي عبر DocuMind AI.",
  "superAdmin.companies": "إجمالي الشركات",
  "superAdmin.activeCompanies": "الشركات النشطة",
  "superAdmin.users": "مستخدمو المنصة",
  "superAdmin.documents": "المستندات",
  "superAdmin.queries": "الاستعلامات",
  "superAdmin.estimatedCost": "التكلفة المقدرة",
  "superAdmin.failedJobs": "المهام الفاشلة",
  "superAdmin.storage": "التخزين",
  "superAdmin.statusDistribution": "توزيع الحالات",
  "superAdmin.auditLogTitle": "سجل تدقيق المنصة",
  "superAdmin.auditLogDesc": "فحص الإجراءات الإدارية عبر المنصة.",
  "superAdmin.processingOverviewTitle": "نظرة عامة على المعالجة",
  "superAdmin.processingOverviewDesc": "مراقبة مهام المعالجة الخلفية النشطة والمكتملة.",
  "superAdmin.refundReviewsTitle": "مراجعة الاسترداد",
  "superAdmin.refundReviewsDesc": "مراجعة ومعالجة طلبات استرداد الأموال للعملاء.",

  /* ── Shared platform UI ────────────────────────────────── */
  "superAdmin.loadError": "تعذر تحميل بيانات المنصة. يرجى المحاولة مرة أخرى.",
  "superAdmin.unknownCompany": "غير معروف",

  /* ── Shared table headers ──────────────────────────────── */
  "superAdmin.tableUser": "المستخدم",
  "superAdmin.tableCompany": "الشركة",
  "superAdmin.tableRole": "الدور",
  "superAdmin.tableStatus": "الحالة",
  "superAdmin.tableVerified": "موثّق",
  "superAdmin.tableCreated": "تاريخ الإنشاء",
  "superAdmin.tableUpdated": "آخر تحديث",
  "superAdmin.tableDocument": "المستند",
  "superAdmin.verifiedYes": "نعم",
  "superAdmin.verifiedNo": "لا",

  /* ── System Health ─────────────────────────────────────── */
  "superAdmin.systemHealthTitle": "حالة النظام",
  "superAdmin.systemHealthDesc": "مراجعة مؤشرات الجاهزية الحية للخدمات الأساسية في DocuMind AI.",
  "superAdmin.serviceStatus.healthy": "سليم",
  "superAdmin.serviceStatus.degraded": "متدهور",
  "superAdmin.serviceStatus.unavailable": "غير متاح",
  "superAdmin.serviceStatus.connected": "متصل",

  /* ── Platform Users ────────────────────────────────────── */
  "superAdmin.platformUsersTitle": "مستخدمو المنصة",
  "superAdmin.platformUsersDesc": "مراجعة المستخدمين عبر الشركات دون تجاوز حدود التعديل الخاصة بكل مستأجر.",
  "superAdmin.userRole.employee": "موظف",
  "superAdmin.userRole.company_admin": "مسؤول الشركة",
  "superAdmin.userRole.super_admin": "المسؤول العام",
  "superAdmin.userStatus.active": "نشط",
  "superAdmin.userStatus.suspended": "موقوف",
  "superAdmin.userStatus.disabled": "معطل",
  "superAdmin.userStatus.pending_email_verification": "في انتظار التحقق",

  /* ── Processing Jobs ───────────────────────────────────── */
  "superAdmin.jobsTitle": "مهام المعالجة",
  "superAdmin.jobsDesc": "مراقبة استيعاب المستندات ونشاط المعالجة عبر الشركات.",

  /* ── Usage & Costs ─────────────────────────────────────── */
  "superAdmin.usageTitle": "الاستخدام والتكاليف",
  "superAdmin.usageDesc": "تتبع حجم الاستعلامات واستهلاك التخزين والتكلفة التقديرية للذكاء الاصطناعي عبر المستأجرين.",
  "superAdmin.usageQueries": "الاستعلامات",
  "superAdmin.usageEstimatedCost": "التكلفة المقدرة",
  "superAdmin.usageStorage": "التخزين",
  "superAdmin.usageDailyVolume": "حجم الاستعلامات اليومي",
  "superAdmin.usageDailyVolumeChart": "مخطط حجم الاستعلامات اليومي",
  "superAdmin.usageQueriesTooltip": "{{count}} استعلام",

  /* ── Subscriptions ─────────────────────────────────────── */
  "superAdmin.subsTitle": "الاشتراكات",
  "superAdmin.subsShortDesc": "عمليات اشتراكات المنصة.",
  "superAdmin.subsDesc": "توفير الاشتراكات المحلية وتعيين إصدارات الباقات الثابتة وتطبيق التحولات الإدارية المسموح بها.",
  "superAdmin.subsNoPermission": "ليس لديك إذن لعرض الاشتراكات.",
  "superAdmin.subsOperation": "عملية الاشتراك",
  "superAdmin.subsSelectCompany": "اختر شركة",
  "superAdmin.subsTenantOption": "{{name}} — {{state}}",
  "superAdmin.subsSubscriptionExists": "يوجد اشتراك",
  "superAdmin.subsNoSubscriptionShort": "لا يوجد اشتراك",
  "superAdmin.subsActivePackage": "الباقة النشطة",
  "superAdmin.subsSelectPackage": "اختر باقة",
  "superAdmin.subsLoadDetailError": "تعذر تحميل تفاصيل الاشتراك.",
  "superAdmin.subsCurrentLabel": "الحالي:",
  "superAdmin.subsCurrentSummary": "{{package}} الإصدار {{version}} · {{status}} · المراجعة {{revision}}",
  "superAdmin.subsProviderOwnershipLabel": "ملكية المزوّد:",
  "superAdmin.subsProviderManagedNote": "مُدار من المزوّد (التجاوز المحلي محظور)",
  "superAdmin.subsManualLocal": "يدوي/محلي",
  "superAdmin.subsPeriodLabel": "الفترة:",
  "superAdmin.subsPeriodRange": "{{start}} إلى {{end}}",
  "superAdmin.subsTrialEndLabel": "نهاية الفترة التجريبية:",
  "superAdmin.subsCancellationLabel": "الإلغاء:",
  "superAdmin.subsLegalTargetStatus": "الحالة المستهدفة المسموح بها",
  "superAdmin.subsDoNotChangeStatus": "عدم تغيير الحالة",
  "superAdmin.subsSyncFromStripe": "المزامنة من Stripe",
  "superAdmin.subsSynchronizing": "جارٍ المزامنة…",
  "superAdmin.subsSyncSuccess": "تمت مزامنة الاشتراك من Stripe.",
  "superAdmin.subsSyncFailed": "فشلت المزامنة مع Stripe.",
  "superAdmin.subsChangePackage": "تغيير الباقة",
  "superAdmin.subsChangeStatus": "تغيير الحالة",
  "superAdmin.subsNoSubscriptionForCompany": "لا يوجد اشتراك لهذه الشركة.",
  "superAdmin.subsProvision": "توفير اشتراك",
  "superAdmin.subsSearchCompanies": "البحث عن الشركات",
  "superAdmin.subsAllStatuses": "جميع الحالات",
  "superAdmin.subsNone": "لم يتم توفير أي اشتراكات.",
  "superAdmin.subsNoMatch": "لا توجد اشتراكات مطابقة لهذه الفلاتر.",
  "superAdmin.subsTablePackage": "الباقة",
  "superAdmin.subsTableVersion": "الإصدار",
  "superAdmin.subsTableOwnership": "الملكية",
  "superAdmin.subsTableRevision": "المراجعة",
  "superAdmin.subsOwnershipProvider": "المزوّد",
  "superAdmin.subsOwnershipLocal": "محلي",
  "superAdmin.subsPrevious": "السابق",
  "superAdmin.subsNext": "التالي",
  "superAdmin.subsPageOf": "صفحة {{page}} من {{total}}",
  "superAdmin.subsStatus.trialing": "تجريبي",
  "superAdmin.subsStatus.incomplete": "غير مكتمل",
  "superAdmin.subsStatus.active": "نشط",
  "superAdmin.subsStatus.past_due": "متأخر السداد",
  "superAdmin.subsStatus.paused": "متوقف مؤقتًا",
  "superAdmin.subsStatus.cancel_at_period_end": "يُلغى في نهاية الفترة",
  "superAdmin.subsStatus.canceled": "ملغى",
  "superAdmin.subsStatus.expired": "منتهي الصلاحية",
  "superAdmin.subsStatus.unpaid": "غير مدفوع",
};

export default arSuperAdmin;
