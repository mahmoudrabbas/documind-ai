/**
 * Arabic translations — account, checkout, and public pages.
 *
 * Auth screens, the marketing landing page, checkout and company usage,
 * tenant settings, entitlement prompts, and shared domain widgets.
 *
 * Keys added here must have a matching entry in `en.account.ts` — the
 * parity test in `__tests__/i18n.test.ts` enforces it.
 */

import type { TranslationDictionary } from "../i18n.types";

const arAccount: TranslationDictionary = {
  /* ── Checkout ──────────────────────────────────────────── */
  "account.checkout.title": "اختر خطة الاشتراك",
  "account.checkout.description": "ترقية حدود مساحة العمل وفتح ميزات ذكاء المستندات المتقدمة.",
  "account.checkout.currentPlan": "الخطة الحالية",
  "account.checkout.subscribe": "اشترك الآن",
  "account.checkout.changePlan": "تغيير الخطة",
  "account.checkout.perMonth": "/ شهرياً",
  "account.checkout.loadingPlans": "جاري تحميل الخطط…",

  /* ── Billing ───────────────────────────────────────────── */
  "account.billing.title": "الفواتير والاشتراك",
  "account.billing.description": "عرض استخدام الخطة الحالية والاشتراكات النشطة وسجل الفواتير.",
  "account.billing.manageSubscription": "إدارة الاشتراك",
  "account.billing.monthlyCost": "التكلفة الشهرية",

  /* ── Settings ──────────────────────────────────────────── */
  "account.settings.title": "إعدادات الشركة",
  "account.settings.description": "تكوين تفاصيل الشركة والهوية وتفضيلات المنصة.",
  "account.settings.companyName": "اسم الشركة",
  "account.settings.slug": "معرف مساحة العمل",
  "account.settings.saveChanges": "حفظ التغييرات",
};

export default arAccount;
