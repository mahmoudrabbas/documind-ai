/**
 * Arabic translation dictionary.
 *
 * Must contain the exact same key set as `en.ts`. The i18n tests
 * verify key-parity between all locale dictionaries.
 */

import type { TranslationDictionary } from "../i18n.types";

const ar: TranslationDictionary = {
  /* ── common ────────────────────────────────────────────── */
  "common.loading": "جارٍ التحميل…",
  "common.error": "حدث خطأ ما",
  "common.retry": "إعادة المحاولة",
  "common.cancel": "إلغاء",
  "common.save": "حفظ",
  "common.delete": "حذف",
  "common.confirm": "تأكيد",
  "common.back": "رجوع",
  "common.next": "التالي",
  "common.close": "إغلاق",
  "common.search": "بحث",
  "common.noResults": "لا توجد نتائج",
  "common.welcome": "أهلاً، {{name}}!",

  /* ── auth ──────────────────────────────────────────────── */
  "auth.signIn": "تسجيل الدخول",
  "auth.signOut": "تسجيل الخروج",
  "auth.signingIn": "جارٍ تسجيل الدخول…",
  "auth.secureSignIn": "تسجيل دخول آمن",
  "auth.accessWorkspace": "الوصول إلى مساحة عمل شركتك.",
  "auth.companySlug": "معرّف الشركة",
  "auth.companySlugPlaceholder": "acme-consulting",
  "auth.companySlugHelp": "استخدم معرّف مساحة عمل شركتك.",
  "auth.companySlugRequired": "معرّف الشركة مطلوب.",
  "auth.email": "البريد الإلكتروني",
  "auth.emailPlaceholder": "admin@company.com",
  "auth.emailRequired": "البريد الإلكتروني مطلوب.",
  "auth.emailInvalid": "أدخل عنوان بريد إلكتروني صالح.",
  "auth.password": "كلمة المرور",
  "auth.passwordPlaceholder": "••••••••",
  "auth.passwordRequired": "كلمة المرور مطلوبة.",
  "auth.sessionNote":
    "تستخدم جلستك رمز وصول في الذاكرة وملف تعريف ارتباط تحديث آمن httpOnly.",
  "auth.errorGeneric": "تعذّر تسجيل الدخول. يرجى المحاولة مرة أخرى.",
  "auth.errorEmailNotVerified":
    "يرجى التحقق من بريدك الإلكتروني قبل تسجيل الدخول.",
  "auth.errorInvalidCredentials":
    "الشركة أو البريد الإلكتروني أو كلمة المرور غير صحيحة.",
  "auth.errorAccountNotActive": "الحساب غير مفعّل.",
  "auth.errorTenantNotActive": "المستأجر غير مفعّل.",

  /* ── nav ───────────────────────────────────────────────── */
  "nav.home": "الرئيسية",
  "nav.chat": "المحادثة",
  "nav.documents": "المستندات",
  "nav.settings": "الإعدادات",
  "nav.language": "اللغة",

  /* ── landing ───────────────────────────────────────────── */
  "landing.appName": "DocuMind AI",
  "landing.tagline": "مساحة عمل ذكاء اصطناعي خاصة",
  "landing.badge": "معرفة مؤسسية آمنة",
  "landing.heroTitle":
    "سجّل دخولك إلى مساعد المعرفة الخاص بشركتك.",
  "landing.heroDescription":
    "الوصول إلى مستندات معزولة حسب المستأجر، ومراجعة الإجابات الموثّقة، والعمل مع المعرفة الداخلية المعتمدة عبر مساحة عمل ذكاء اصطناعي آمنة.",
  "landing.verifiedRetrieval": "استرجاع موثّق",
  "landing.answersFromApprovedFiles": "إجابات من ملفات معتمدة",
  "landing.protected": "محمي",
  "landing.queryLabel": "استعلام",
  "landing.queryExample":
    "\u201Cابحث عن أحدث سياسة ترحيل الإجازات.\u201D",
  "landing.sourceFile": "HR_Policy_2024.pdf",
  "landing.sourceDescription":
    "إجابة موثّقة مع ذكر المصدر.",
  "landing.sourcePage": "صفحة 14",
  "landing.trustTenantTitle": "عزل المستأجرين",
  "landing.trustTenantDesc":
    "كل مساحة عمل مفصولة حسب حدود الشركة.",
  "landing.trustVerifiedTitle": "وصول موثّق",
  "landing.trustVerifiedDesc":
    "يمكن للمستخدمين المفعّلين فقط الوصول إلى معرفة الشركة.",
  "landing.trustPrivateTitle": "إجابات خاصة",
  "landing.trustPrivateDesc":
    "الردود مبنية على مستندات داخلية معتمدة.",
};

export default ar;
