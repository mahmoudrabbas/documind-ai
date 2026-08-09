/**
 * Arabic translations — tenant dashboard pages.
 *
 * Overview, users, roles, audit, emails, notifications, knowledge gaps,
 * analytics, and failed-processing screens.
 *
 * Keys added here must have a matching entry in `en.dashboard.ts` — the
 * parity test in `__tests__/i18n.test.ts` enforces it.
 */

import type { TranslationDictionary } from "../i18n.types";

const arDashboard: TranslationDictionary = {
  /* ── Emails ────────────────────────────────────────────── */
  "dashboard.emails.title": "سجل تسليم البريد الإلكتروني",
  "dashboard.emails.description": "مراقبة الرسائل الإلكترونية الصادرة من مؤسستك.",
  "dashboard.emails.refresh": "تحديث",
  "dashboard.emails.recipient": "المستلم",
  "dashboard.emails.subject": "الموضوع",
  "dashboard.emails.template": "القالب",
  "dashboard.emails.status": "الحالة",
  "dashboard.emails.date": "التاريخ",
  "dashboard.emails.actions": "الإجراءات",
  "dashboard.emails.details": "التفاصيل",
  "dashboard.emails.resend": "إعادة الإرسال",
  "dashboard.emails.noEmails": "لم يتم العثور على رسائل بريد إلكتروني.",
  "dashboard.emails.rateLimitedTitle": "تم تجاوز حد الطلبات. حاول مرة أخرى بعد فترة الانقضاء.",

  /* ── Email States ──────────────────────────────────────── */
  "dashboard.emailState.sent": "تم الإرسال",
  "dashboard.emailState.delivered": "تم التسليم",
  "dashboard.emailState.failed": "فشل الإرسال",
  "dashboard.emailState.pending": "قيد الانتظار",
  "dashboard.emailState.bounced": "مرتد",
  "dashboard.emailState.permanent_failure": "فشل دائم",
  "dashboard.emailState.temporary_failure": "فشل مؤقت",
  "dashboard.emailState.cancelled": "ملغى",
  "dashboard.emailState.suppressed": "محظور",
  "dashboard.emailState.processing": "قيد المعالجة",
  "dashboard.emailState.queued": "في قائمة الانتظار",

  /* ── Users ─────────────────────────────────────────────── */
  "dashboard.users.title": "دليل المستخدمين",
  "dashboard.users.description": "إدارة حسابات المستخدمين وأدوارهم وحالاتهم لشركتك.",
  "dashboard.users.inviteUser": "دعوة مستخدم",
  "dashboard.users.importUsers": "استيراد مستخدمين",
  "dashboard.users.searchPlaceholder": "البحث عن مستخدمين بالاسم أو البريد الإلكتروني…",
  "dashboard.users.name": "الاسم",
  "dashboard.users.email": "البريد الإلكتروني",
  "dashboard.users.role": "الدور",
  "dashboard.users.status": "الحالة",
  "dashboard.users.verified": "المصادقة",
  "dashboard.users.created": "تاريخ الإنشاء",
  "dashboard.users.actions": "الإجراءات",
  "dashboard.users.yes": "نعم",
  "dashboard.users.no": "لا",
  "dashboard.users.loadingDirectory": "جاري تحميل الدليل…",
  "dashboard.users.noUsers": "لم يتم العثور على مستخدمين.",
  "dashboard.userStatus.active": "نشط",
  "dashboard.userStatus.pending_email_verification": "في انتظار التحقق",
  "dashboard.userStatus.disabled": "معطل",
  "dashboard.userRole.employee": "موظف",
  "dashboard.userRole.company_admin": "مدير الشركة",

  /* ── Roles ─────────────────────────────────────────────── */
  "dashboard.roles.title": "الأدوار المخصصة",
  "dashboard.roles.description": "تحديد أدوار المستأجر باستخدام دليل الأذونات المعتمد والنطاقات المفوّضة.",
  "dashboard.roles.createRole": "إنشاء دور",
  "dashboard.roles.cancel": "إلغاء",
  "dashboard.roles.employee": "موظف",
  "dashboard.roles.companyAdmin": "مدير الشركة",
  "dashboard.roles.allStatuses": "جميع الحالات",
  "dashboard.roles.active": "نشط",
  "dashboard.roles.archived": "مؤرشف",
  "dashboard.roles.searchPlaceholder": "البحث عن أدوار بالاسم…",
  "dashboard.roles.noRoles": "لم يتم العثور على أدوار.",

  /* ── Knowledge Gaps ────────────────────────────────────── */
  "dashboard.knowledgeGaps.title": "فجوات المعرفة",
  "dashboard.knowledgeGaps.description": "متابعة الأسئلة غير المجاب عليها وتحديد الموضوعات التي تتطلب توثيقًا.",
  "dashboard.knowledgeGaps.totalGaps": "إجمالي الفجوات",
  "dashboard.knowledgeGaps.openAssigned": "مفتوحة / مسندة",
  "dashboard.knowledgeGaps.resolved": "تم حلها",
  "dashboard.knowledgeGaps.resolutionRate": "معدل الحل",
  "dashboard.knowledgeGaps.allStatuses": "جميع الحالات",
  "dashboard.knowledgeGaps.allSeverities": "جميع مستويات الأهمية",
  "dashboard.knowledgeGaps.searchPlaceholder": "البحث في الفجوات…",
  "dashboard.knowledgeGaps.noGapsFound": "لم يتم العثور على فجوات معرفية",
  "dashboard.knowledgeGaps.emptyStateDesc": "ستظهر الأسئلة غير المجاب عليها أو ذات التقييم السلبي هنا تلقائيًا كمرشحات للفجوات.",
  "dashboard.gapStatus.open": "مفتوحة",
  "dashboard.gapStatus.triaged": "تم تقييمها",
  "dashboard.gapStatus.assigned": "تم إسنادها",
  "dashboard.gapStatus.resolved": "تم حلها",
  "dashboard.gapStatus.dismissed": "تم تجاهلها",
  "dashboard.gapStatus.reopened": "أعيد فتحها",
  "dashboard.gapSeverity.low": "منخفضة",
  "dashboard.gapSeverity.medium": "متوسطة",
  "dashboard.gapSeverity.high": "عالية",
  "dashboard.gapSeverity.critical": "حرجة",
  "dashboard.gapSource.refusal": "رفض الإجابة",
  "dashboard.gapSource.weak_answer": "إجابة ضعيفة",
  "dashboard.gapSource.conflict": "تعارض",
  "dashboard.gapSource.negative_feedback": "ملاحظات سلبية",
  "dashboard.gapSource.manual": "أُضيفت يدويًا",
  "dashboard.gapCategory.inaccurate": "غير دقيقة",
  "dashboard.gapCategory.incomplete": "غير مكتملة",
  "dashboard.gapCategory.irrelevant": "غير ذات صلة",
  "dashboard.gapCategory.harmful": "ضارة",
  "dashboard.gapCategory.other": "أخرى",
  "dashboard.gapCategory.unspecified": "غير محددة",
  "dashboard.gapOutcome.refused": "مرفوضة",
  "dashboard.gapOutcome.weak": "ضعيفة",
  "dashboard.gapOutcome.conflict": "تعارض",
  "dashboard.gapOutcome.negative_feedback": "ملاحظات سلبية",

  /* ── Processing Failed ─────────────────────────────────── */
  "dashboard.processingFailed.title": "فشل معالجة المستندات",
  "dashboard.processingFailed.description": "مراجعة وإعادة محاولة عمليات معالجة المستندات الفاشلة عبر مساحة العمل.",
  "dashboard.processingFailed.noFailedDocs": "لم يتم العثور على عمليات معالجة مستندات فاشلة.",

  /* ── Analytics ─────────────────────────────────────────── */
  "dashboard.analytics.title": "التحليلات والرؤى",
  "dashboard.analytics.description": "مراقبة استخدام النظام وأداء المعالجة وتفاصيل التكاليف.",
  "dashboard.analytics.export": "تصدير البيانات",
};

export default arDashboard;
