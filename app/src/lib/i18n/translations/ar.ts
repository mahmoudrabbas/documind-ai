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

  /* ── auth/register ─────────────────────────────────────── */
  "auth.signUp": "إنشاء حساب",
  "auth.createAccount": "إنشاء حساب جديد",
  "auth.registerTitle": "سجّل شركتك وابدأ تشغيل مساحة عملك الآمنة.",
  "auth.registerDescription": "أنشئ حدود عزل المستأجرين، وقم بتهيئة تفاصيل مؤسستك، وجهّز مساحة عملك الخاصة لاسترجاع المستندات باللغة الطبيعية.",
  "auth.registerSuccess": "تم إنشاء المستأجر ومسؤول الشركة بنجاح. يرجى التحقق من بريدك الإلكتروني لتفعيل الحساب.",
  "auth.registering": "جاري التسجيل...",
  "auth.register": "تسجيل",
  "auth.alreadyHaveAccount": "هل لديك حساب بالفعل؟ تسجيل الدخول",
  "auth.adminName": "اسم المسؤول",
  "auth.adminNamePlaceholder": "سارة أحمد",
  "auth.adminNameRequired": "اسم المسؤول مطلوب.",
  "auth.adminNameInvalid": "يجب أن يتكون الاسم من حرفين على الأقل.",
  "auth.companyName": "اسم الشركة",
  "auth.companyNamePlaceholder": "إيكمي للاستشارات",
  "auth.companyNameRequired": "اسم الشركة مطلوب.",
  "auth.companyNameInvalid": "يجب أن يتكون اسم الشركة من حرفين على الأقل وأن يحتوي فقط على أحرف وأرقام ومسافات وعلامات & و . و ( و ) و -",
  "auth.companySlugInvalid": "يجب أن يحتوي معرّف الشركة فقط على أحرف صغيرة وأرقام وواصلات (-).",
  "auth.passwordInvalid": "يجب أن تتكون كلمة المرور من 8 أحرف على الأقل وتحتوي على حرف واحد ورقم واحد على الأقل.",
  "auth.confirmPassword": "تأكيد كلمة المرور",
  "auth.confirmPasswordPlaceholder": "••••••••",
  "auth.confirmPasswordRequired": "يرجى تأكيد كلمة المرور.",
  "auth.passwordsMustMatch": "يجب أن تتطابق كلمتا المرور.",
  "auth.backToLogin": "العودة إلى تسجيل الدخول",
  "auth.secureRegistration": "تسجيل آمن",
  "auth.tenantIsolationTitle": "عزل المستأجرين",
  "auth.tenantIsolationDesc": "كل مساحة عمل مفصولة حسب حدود الشركة.",
  "auth.verifiedAccessTitle": "وصول موثّق",
  "auth.verifiedAccessDesc": "يمكن للمستخدمين المفعّلين فقط الوصول إلى معرفة الشركة.",
  "auth.privateAnswersTitle": "إجابات خاصة",
  "auth.privateAnswersDesc": "الردود مبنية على مستندات داخلية معتمدة.",
  "auth.registerNow": "سجّل الآن",
};


export default ar;
