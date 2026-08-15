import { getAllGuideFlows } from "./guideFlows.js";
import type { GuideFlow } from "./guide.contracts.js";
import { BASE_ROLE_DEFAULTS } from "../../permissions/permissions.catalog.js";

export type GuideFlowCategory =
  | "documents"
  | "users"
  | "roles"
  | "settings"
  | "billing"
  | "chat"
  | "platform";

/** Who a flow is primarily meant for — used by the launcher to rank the catalog. */
export type GuideFlowAudience = "employee" | "admin" | "all";

export interface FlowIntent {
  flowId: string;
  category: GuideFlowCategory;
  entryRoute: string;
  keywords: readonly string[];
}

/**
 * Normalize user input for matching: lowercase, strip Arabic diacritics
 * (tashkeel) and tatweel, and collapse common Arabic letter variants so
 * "الاعدادات", "الإعدادات", "إعدادات" all match the same keyword.
 */
export function normalizeText(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, "")
    .replace(/[أإآ]/g, "ا")
    .replace(/ة/g, "ه")
    .replace(/ى/g, "ي")
    .trim();
}

export interface UtteranceMatch {
  flowId: string;
  score: number;
}

export const FLOW_CATEGORIES: Record<string, GuideFlowCategory> = {
  "documents.upload": "documents",
  "documents.search": "documents",
  "documents.delete": "documents",
  "documents.archive": "documents",
  "documents.restore": "documents",
  "documents.replace": "documents",
  "documents.failedReview": "documents",
  "knowledgeBase.build": "documents",
  "users.invite": "users",
  "users.resendInvitation": "users",
  "users.revokeInvitation": "users",
  "users.remove": "users",
  "roles.create": "roles",
  "settings.open": "settings",
  "settings.updateProfile": "settings",
  "taxonomy.manage": "settings",
  "billing.open": "billing",
  "usage.view": "billing",
  "chat.ask": "chat",
  "platform.tour": "platform",
};

/**
 * Intent keywords per flow, EN + AR. Keep phrases specific: generic short
 * words ("find", "open", "add") cause misroutes (e.g. "find the roles page"
 * colliding with the document search flow). Longer phrases win by length.
 */
const FLOW_KEYWORDS: Record<string, readonly string[]> = {
  "documents.upload": [
    "upload a document",
    "upload document",
    "upload a file",
    "upload file",
    "upload",
    "add a document",
    "add document",
    "upload documents",
    "رفع مستند",
    "رفع ملف",
    "إضافة مستند",
    "اضافة مستند",
    "اضف مستند",
    "أضف مستند",
    "رفع",
  ],
  "documents.search": [
    "search for a document",
    "search documents",
    "search a document",
    "find a document",
    "find document",
    "find a file",
    "look up a document",
    "search",
    "بحث عن مستند",
    "بحث في المستندات",
    "ابحث عن مستند",
    "ابحث في المستندات",
    "البحث عن مستند",
    "بحث",
  ],
  "documents.delete": [
    "delete a document",
    "delete document",
    "remove a document",
    "delete a file",
    "move to trash",
    "delete",
    "حذف مستند",
    "احذف مستند",
    "حذف ملف",
    "نقل إلى المهملات",
    "حذف",
  ],
  "documents.archive": [
    "archive a document",
    "archive document",
    "archive a file",
    "archive documents",
    "أرشف مستند",
    "أرشفة مستند",
    "ارشف مستند",
    "أرشف",
  ],
  "documents.restore": [
    "restore a document",
    "restore document",
    "unarchive a document",
    "restore a deleted document",
    "restore a file",
    "restore an archived document",
    "استعادة مستند",
    "أستعيد مستند",
    "إلغاء الأرشفة",
    "استعادة",
  ],
  "documents.replace": [
    "replace a document",
    "replace document",
    "replace a file",
    "replace the file",
    "new version of a document",
    "upload a new version",
    "استبدال مستند",
    "استبدال الملف",
    "رفع نسخه جديدة",
    "رفع نسخة جديدة",
    "استبدال",
  ],
  "documents.failedReview": [
    "failed processing",
    "failed documents",
    "processing failures",
    "failed uploads",
    "review failed documents",
    "استعراض المعالجه الفاشله",
    "استعراض المعالجة الفاشلة",
    "المستندات الفاشله",
    "المستندات الفاشلة",
    "فشل المعالجة",
  ],
  "knowledgeBase.build": [
    "knowledge base",
    "build knowledge base",
    "create a knowledge base",
    "add to knowledge base",
    "reorganize the knowledge base",
    "knowledge",
    "قاعدة معرفه",
    "قاعدة معرفة",
    "بناء قاعدة المعرفة",
    "إنشاء قاعدة معرفة",
    "انشاء قاعدة معرفة",
    "قاعدة المعرفة",
  ],
  "users.invite": [
    "invite a user",
    "invite user",
    "invite a teammate",
    "invite a team member",
    "add a user",
    "add user",
    "new user",
    "invite an employee",
    "invite",
    "دعوة مستخدم",
    "دعوة زميل",
    "دعوة موظف",
    "إضافة مستخدم",
    "اضافة مستخدم",
    "أضف مستخدما",
    "اضف مستخدما",
    "دعوة",
    "ادعو",
  ],
  "users.resendInvitation": [
    "resend invitation",
    "resend the invitation",
    "resend an invitation",
    "resend invite",
    "send the invitation again",
    "اعيد ارسال",
    "إعادة إرسال الدعوه",
    "إعادة إرسال الدعوة",
    "اعد ارسال الدعوة",
    "إعادة الإرسال",
  ],
  "users.revokeInvitation": [
    "revoke invitation",
    "revoke an invitation",
    "revoke the invitation",
    "cancel an invitation",
    "cancel invitation",
    "cancel the invitation",
    "withdraw an invitation",
    "إلغاء الدعوه",
    "إلغاء الدعوة",
    "الغاء الدعوة",
    "سحب الدعوة",
  ],
  "users.remove": [
    "delete a user",
    "remove a user",
    "delete user",
    "remove user",
    "remove a team member",
    "remove an employee",
    "delete a team member",
    "حذف مستخدم",
    "احذف مستخدم",
    "إزالة مستخدم",
    "ازالة مستخدم",
    "حذف عضو",
    "إزالة عضو",
  ],
  "roles.create": [
    "create a role",
    "create role",
    "create the role",
    "create a new role",
    "creating a role",
    "create a new role called",
    "create a role named",
    "add a role",
    "new role",
    "create a custom role",
    "set up a role",
    "إنشاء دور",
    "انشاء دور",
    "إضافة دور",
    "اصنع دور",
    "دور جديد",
  ],
  "settings.open": [
    "open settings",
    "settings page",
    "company settings",
    "preferences",
    "app settings",
    "update settings",
    "change my password",
    "update my password",
    "reset my password",
    "change password",
    "settings",
    "تغيير كلمة المرور",
    "الإعدادات",
    "الاعدادات",
    "اعدادات",
    "إعدادات الشركة",
    "اعدادات الشركة",
    "التفضيلات",
    "الخيارات",
  ],
  "settings.updateProfile": [
    "update company profile",
    "edit company profile",
    "update my profile",
    "edit my profile",
    "update profile",
    "change company name",
    "update company information",
    "change the company logo",
    "edit company information",
    "تحديث بيانات الشركة",
    "تعديل بيانات الشركة",
    "تغيير اسم الشركة",
    "تغيير شعار الشركة",
    "بيانات الشركة",
    "تحديث الملف التعريفي",
    "تعديل الملف التعريفي",
  ],
  "taxonomy.manage": [
    "manage taxonomy",
    "document taxonomy",
    "add a category",
    "add a classification",
    "add a department",
    "manage categories",
    "taxonomy",
    "categories",
    "classification settings",
    "إدارة التصنيفات",
    "إدارة الفئات",
    "إضافة تصنيف",
    "اضافة تصنيف",
    "إضافة فئه",
    "إضافة فئة",
    "اضافة قسم",
    "التصنيفات",
    "الفئات",
  ],
  "billing.open": [
    "open billing",
    "billing page",
    "billing settings",
    "view billing",
    "payment settings",
    "subscription",
    "invoices",
    "الفوترة",
    "الفواتير",
    "الاشتراك",
    "الاشتراكات",
    "وسائل الدفع",
    "الدفع",
  ],
  "usage.view": [
    "view usage",
    "usage and limits",
    "usage page",
    "check usage",
    "storage usage",
    "limits",
    "quota",
    "my usage",
    "الاستخدام",
    "الحدود",
    "القيود",
    "استخدام الشركة",
    "حجم التخزين",
  ],
  "chat.ask": [
    "ask a question",
    "ask the assistant",
    "ask a question in chat",
    "chat with the assistant",
    "use the chat",
    "اسأل المساعد",
    "اسأل سؤالا",
    "اطرح سؤالا",
    "اطرح سؤال",
    "المحادثه",
    "المحادثة",
    "استفسار",
    "سؤال للمساعد",
  ],
  "platform.tour": [
    "tour",
    "platform tour",
    "guided tour",
    "explain the platform",
    "explain the whole platform",
    "walk me through the platform",
    "walk me through the whole platform",
    "show me around",
    "getting started",
    "onboarding",
    "introduction",
    "introduce me to the platform",
    "جولة",
    "جولة في المنصة",
    "اشرح لي المنصة",
    "تعرف على المنصة",
    "شرح المنصة",
    "من أين أبدأ",
    "ابدأ معنا",
  ],
};

/**
 * Frame markers. "how-to" framing (كيف/أرشدني/طريقة) means a step-by-step flow
 * is wanted; "navigation" framing (أين/افتح صفحة/find the X page) means the
 * user wants to reach a section. Arabic verbs conjugate, so these are checked
 * as substrings of the normalized utterance. A marker negated directly before
 * it ("do not guide me") does not count as how-to framing.
 */
const HOW_TO_FRAMING = [
  "how do i",
  "how can i",
  "how to",
  "walk me through",
  "guide me",
  "show me how",
  "explain how",
  "help me understand",
  "ما طريقة",
  "كيف يمكنني",
  "كيف أقوم",
  "كيف",
  "كيفية",
  "أرشدني",
  "اشرح لي",
  "طريقة استخدام",
];

const NAV_FRAMING_EN = [
  "where is",
  "where's",
  "where can i find",
  "show me",
  "show me the",
  "take me to",
  "go to the",
  "go to my",
  "navigate to",
  "open the",
  "how do i get to",
  "find the",
];

/** Navigation requests usually name a destination: page/screen/tab/section. */
const NAV_DESTINATION = /\b(page|screen|tab|section)\b/;

const NAV_FRAMING_AR = ["أين", "افتح صفحه", "افتح صفحة", "افتح قسم", "اذهب إلى", "اذهب الي", "عرض صفحه", "عرض صفحة", "خذني إلى", "وين"];

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function isArabic(text: string): boolean {
  return /[\u0600-\u06FF]/.test(text);
}

/**
 * Resolve the strongest guide flow for an utterance. Scoring is by longest
 * matched keyword (specific phrases beat generic ones); ties are broken by the
 * caller's current route (a flow whose entry route matches is preferred) and
 * finally by registration order.
 *
 * Latin keywords match on word boundaries; Arabic keywords match as substrings
 * because Arabic verbs and prepositions attach to the stem ("أرفع" contains
 * "رفع", "بحثت" contains "بحث").
 */
export function matchFlowToUtterance(
  utterance: string,
  locale: "en" | "ar",
  availableFlows: readonly string[],
  routeContext?: string,
): UtteranceMatch | null {
  const normalized = normalizeText(utterance);
  if (!normalized) return null;

  let best: UtteranceMatch | null = null;

  for (const flow of getFlowIntents()) {
    if (!availableFlows.includes(flow.flowId)) continue;

    let score = 0;
    for (const rawKeyword of flow.keywords) {
      const keyword = normalizeText(rawKeyword);
      if (!isArabic(keyword)) {
        if (keyword.length < 4) continue;
        const pattern = new RegExp(
          `(?<![\\p{L}\\p{N}])${escapeRegExp(keyword)}(?![\\p{L}\\p{N}])`,
          "u",
        );
        if (pattern.test(normalized)) {
          score = Math.max(score, keyword.length);
        }
      } else {
        if (keyword.length < 2) continue;
        if (normalized.includes(keyword)) {
          score = Math.max(score, keyword.length);
        }
      }
    }

    if (score === 0) continue;

    if (!best || score > best.score) {
      best = { flowId: flow.flowId, score };
    } else if (score === best.score) {
      const routePreferred = routeMatches(flow.entryRoute, routeContext);
      const currentPreferred = routeMatches(
        getEntryRoute(best.flowId),
        routeContext,
      );
      if (routePreferred && !currentPreferred) {
        best = { flowId: flow.flowId, score };
      }
    }
  }

  if (best && locale === "ar" && best.score < 2) return null;
  return best;
}

function routeMatches(entryRoute: string, routeContext?: string): boolean {
  if (!routeContext) return false;
  if (entryRoute === routeContext) return true;
  if (routeContext.startsWith(`${entryRoute}/`)) return true;
  return false;
}

function getEntryRoute(flowId: string): string {
  return getFlowIntents().find((flow) => flow.flowId === flowId)?.entryRoute ?? "";
}

/**
 * Negations that reverse a how-to marker ("do not guide me", "don't walk me
 * through", "لا ترشدني"). "no need to" and "without" are included because
 * they carry the same direct-execution intent ("no need to guide me").
 */
const NEGATION_MARKERS = [
  "do not",
  "don't",
  "dont",
  "does not",
  "doesn't",
  "no need to",
  "without",
  "never",
  "stop",
  "avoid",
  "please don't",
  "لا",
  "لن",
  "دون",
];

/** How-to markers that a user might explicitly decline ("do not guide me"). */
const NEGATABLE_HOW_TO_MARKERS = ["guide me", "walk me through"];

/** Arabic phrases that decline a guided walkthrough outright. */
const NO_GUIDE_PHRASES_AR = [
  "لا ترشدني",
  "لا ارشدني",
  "دون ارشاد",
  "بدون ارشاد",
];

/** Whether the gap between a negation and the marker is a knowledge gap. */
function hasKnowledgeGap(gap: string): boolean {
  return /\bknow\b/.test(gap) || /اعرف|عرفه|عرف/.test(gap);
}

/**
 * Whether a framing marker occurrence is negated ("do not guide me", "don't
 * walk me through"). A negation only counts when it appears within a short
 * window immediately before the marker; a knowledge gap is explicitly excluded
 * so "I do not know how to upload a document" still reads as how-to framing.
 */
function isNegatedMarker(normalized: string, marker: string): boolean {
  const index = normalized.indexOf(marker);
  if (index <= 0) return false;
  const windowStart = Math.max(0, index - 24);
  const before = normalized.slice(windowStart, index);
  return NEGATION_MARKERS.some((negation) => {
    const negIndex = before.lastIndexOf(negation);
    if (negIndex === -1) return false;
    const distance = before.length - (negIndex + negation.length);
    if (distance > 10) return false;
    if (hasKnowledgeGap(before.slice(negIndex + negation.length))) return false;
    return true;
  });
}

/**
 * Whether the user explicitly declined a guided walkthrough ("do not guide
 * me", "don't walk me through the UI", "لا ترشدني"). Such requests are direct
 * execution requests — the classifier must never hand them to the guide agent,
 * and when no action tool covers the request they must be reported as an
 * unsupported capability rather than clarified into a generic "could you
 * clarify?".
 */
export function isExplicitNoGuide(utterance: string): boolean {
  const normalized = normalizeText(utterance);
  if (
    NO_GUIDE_PHRASES_AR.some((phrase) =>
      normalized.includes(normalizeText(phrase)),
    )
  ) {
    return true;
  }
  return NEGATABLE_HOW_TO_MARKERS.some((marker) => {
    const markerNormalized = normalizeText(marker);
    if (!normalized.includes(markerNormalized)) return false;
    return isNegatedMarker(normalized, markerNormalized);
  });
}

export function hasHowToFraming(utterance: string): boolean {
  const normalized = normalizeText(utterance);
  return HOW_TO_FRAMING.some((marker) => {
    const markerNormalized = normalizeText(marker);
    if (!normalized.includes(markerNormalized)) return false;
    return !isNegatedMarker(normalized, markerNormalized);
  });
}

export function hasNavFraming(utterance: string): boolean {
  const normalized = normalizeText(utterance);
  if (NAV_FRAMING_AR.some((marker) => normalized.includes(normalizeText(marker)))) return true;
  for (const marker of NAV_FRAMING_EN) {
    const markerNormalized = normalizeText(marker);
    if (!normalized.includes(markerNormalized)) continue;
    if (markerNormalized === "find the") return NAV_DESTINATION.test(normalized);
    return true;
  }
  return false;
}

let intentCache: readonly FlowIntent[] | null = null;

export function getFlowIntents(): readonly FlowIntent[] {
  if (intentCache) return intentCache;
  intentCache = getAllGuideFlows().map((flow) => ({
    flowId: flow.flowId,
    category: FLOW_CATEGORIES[flow.flowId] ?? "documents",
    entryRoute: flow.entryRoute,
    keywords: FLOW_KEYWORDS[flow.flowId] ?? [],
  }));
  return intentCache;
}

export function getFlowCategory(flowId: string): GuideFlowCategory {
  return FLOW_CATEGORIES[flowId] ?? "documents";
}

export function getFlowKeywords(flowId: string): readonly string[] {
  return FLOW_KEYWORDS[flowId] ?? [];
}

const EMPLOYEE_SAFE_PERMISSIONS: ReadonlySet<string> = new Set(
  BASE_ROLE_DEFAULTS.EMPLOYEE,
);

/**
 * Classify a flow by audience. A flow whose permissions are all part of the
 * employee default role is employee-facing; one that carries no permission
 * requirement (e.g. the platform tour) is "all"; anything else targets
 * admins. The server remains the source of truth — the client only re-orders.
 */
export function deriveGuideFlowAudience(flow: GuideFlow): GuideFlowAudience {
  if (flow.requiredPermissions.length === 0) return "all";
  const employeeFacing = flow.requiredPermissions.every((permission) =>
    EMPLOYEE_SAFE_PERMISSIONS.has(permission),
  );
  return employeeFacing ? "employee" : "admin";
}

export function getAllFlowIds(): string[] {
  return getFlowIntents().map((flow) => flow.flowId);
}