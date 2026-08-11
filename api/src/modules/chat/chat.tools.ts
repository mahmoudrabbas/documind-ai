import type { QueryPlan } from "../intent-query/intentQuery.types.js";

export type ChatAnalyticsMetric =
  | "document_count"
  | "query_count"
  | "feedback_stats"
  | "top_queries"
  | "usage_trend";

export type ChatAnalyticsPeriod = "day" | "week" | "month";

export interface ChatAnalyticsRequest {
  metric: ChatAnalyticsMetric;
  period: ChatAnalyticsPeriod;
}

// Words that indicate the user is asking about the *content* of a specific
// document rather than about the tenant's analytics. Used to avoid hijacking
// questions like "what are the FAQs in the handbook?" into the analytics tool.
const DOC_TARGET_RE =
  /(handbook|polic(y|ies)|guide|manual|documents?|دليل|سياسة|سياسات|مستندات?|وثائق?|ملفات?|كتيب|تعليمات)/i;

const FEEDBACK_RE = [
  /\bfeedback\b/i,
  /thumbs?\s*(up|down)/i,
  /positive\s*rate/i,
  /satisfaction/i,
  /\bratings?\b/i,
  /التقييمات?/,
  /الإعجابات/,
  /عدم الإعجاب/,
  /نسبة الرضا/,
  /الرضا/,
  /إعجاب/,
];

const USAGE_TREND_RE = [
  /usage\s*tren/i,
  /\btrends?\b/i,
  /usage\s*over\s*time/i,
  /usage\s+(this|last|over)/i,
  /معدل الاستخدام/,
  /اتجاهات? الاستخدام/,
  /الاستخدام/,
];

const TOP_QUERIES_RE = [
  /top\s+quer(ies|y)/i,
  /top\s+questions?/i,
  /most\s+(common|frequent|popular|repeated|asked|searched)\s+(quer(ies|y)|questions?)/i,
  /most\s+asked/i,
  /frequently\s+asked/i,
  /أكثر الأسئلة/,
  /الأسئلة الشائعة/,
  /الأكثر شيوعاً/,
  /الأكثر شيوعا/,
  /الأكثر تكراراً/,
  /الأكثر تكرارا/,
  /أكثر الاستفسارات/,
  /الأكثر بحثاً/,
  /الأكثر بحثا/,
];

const DOC_COUNT_RE = [
  /how\s+many\s+(documents?|files?|docs?)/i,
  /number\s+of\s+(documents?|files?|docs?)/i,
  /total\s+(documents?|files?|docs?)/i,
  /document\s*count/i,
  /كم\s+عدد\s+(المستندات|الوثائق|الملفات)/,
  /عدد\s+(المستندات|الوثائق|الملفات)/,
  /كم\s+مستند/,
  /كم\s+وثيقة/,
  /كم\s+ملف/,
];

const QUERY_COUNT_RE = [
  /how\s+many\s+(queries|questions|messages)/i,
  /number\s+of\s+(queries|questions|messages)/i,
  /total\s+(queries|questions|messages)/i,
  /query\s*count/i,
  /عدد\s+(الاستفسارات|الأسئلة|الرسائل|الطلبات)/,
  /كم\s+(استفسار|سؤال|رسالة)/,
];

/**
 * Deterministically detects whether a chat message is asking for tenant
 * analytics (document/query counts, feedback stats, top queries, or usage
 * trends) rather than a knowledge-base question. When a query plan resolved
 * specific document references, the request is treated as document-content
 * oriented and analytics routing is suppressed.
 */
export function detectAnalyticsRequest(
  message: string,
  plan?: Pick<
    QueryPlan,
    "referencedDocumentIds" | "referencedDocumentTitles"
  > | null,
): ChatAnalyticsRequest | null {
  const text = message.trim();
  if (!text) return null;

  if (
    plan &&
    (plan.referencedDocumentIds.length > 0 ||
      plan.referencedDocumentTitles.length > 0)
  ) {
    return null;
  }

  let metric: ChatAnalyticsMetric | null = null;
  if (matchesAny(text, FEEDBACK_RE)) {
    metric = "feedback_stats";
  } else if (matchesAny(text, USAGE_TREND_RE)) {
    metric = "usage_trend";
  } else if (matchesAny(text, TOP_QUERIES_RE)) {
    metric = "top_queries";
  } else if (matchesAny(text, DOC_COUNT_RE)) {
    metric = "document_count";
  } else if (matchesAny(text, QUERY_COUNT_RE)) {
    metric = "query_count";
  }

  if (!metric) return null;

  // Questions that reference a specific document ("FAQs in the handbook",
  // "satisfaction with the leave policy") must stay on the RAG path.
  if (metric !== "document_count" && DOC_TARGET_RE.test(text)) {
    return null;
  }

  return { metric, period: detectPeriod(text) };
}

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function detectPeriod(message: string): ChatAnalyticsPeriod {
  if (
    /today|last\s+24|خلال اليوم|آخر ٢٤|آخر 24|اليوم/.test(message)
  ) {
    return "day";
  }
  if (
    /this\s+month|last\s+month|monthly|هذا الشهر|الشهر الماضي|خلال الشهر|شهرياً|شهريا/.test(
      message,
    )
  ) {
    return "month";
  }
  return "week";
}

const EN_PERIOD_LABEL: Record<ChatAnalyticsPeriod, string> = {
  day: "today",
  week: "this week",
  month: "this month",
};

const AR_PERIOD_LABEL: Record<ChatAnalyticsPeriod, string> = {
  day: "اليوم",
  week: "هذا الأسبوع",
  month: "هذا الشهر",
};

function arPlural(
  count: number,
  one: string,
  two: string,
  threeToTen: string,
  many: string,
): string {
  if (count === 1) return one;
  if (count === 2) return two;
  if (count >= 3 && count <= 10) return threeToTen;
  return many;
}

/**
 * Best-effort reply-language detection for tool-backed answers when intent
 * analysis is unavailable (e.g. the analytics path runs without it).
 */
export function detectReplyLanguage(message: string): "ar" | "en" {
  return /[\u0600-\u06FF]/.test(message) ? "ar" : "en";
}

/**
 * Renders a localized, human-readable chat answer from an `analytics_query`
 * tool result.
 */
export function formatAnalyticsAnswer(
  result: unknown,
  options: {
    metric: ChatAnalyticsMetric;
    period: ChatAnalyticsPeriod;
    language: "ar" | "en";
  },
): string {
  const { metric, period, language } = options;
  const en = language !== "ar";
  const periodLabel = en ? EN_PERIOD_LABEL[period] : AR_PERIOD_LABEL[period];

  switch (metric) {
    case "document_count": {
      const count = asCount(result);
      if (en) {
        return count === 1
          ? "You currently have 1 uploaded document."
          : `You currently have ${count} uploaded documents.`;
      }
      const noun = arPlural(
        count,
        "مستند واحد مرفوع",
        "مستندان مرفوعان",
        `${count} مستندات مرفوعة`,
        `${count} مستنداً مرفوعاً`,
      );
      return `لديك حالياً ${noun} في مساحة عملك.`;
    }
    case "query_count": {
      const count = asCount(result);
      if (en) {
        return count === 1
          ? `There was 1 query in ${periodLabel}.`
          : `There were ${count} queries in ${periodLabel}.`;
      }
      const noun = arPlural(
        count,
        "استفسار واحد",
        "استفساران",
        `${count} استفسارات`,
        `${count} استفساراً`,
      );
      return `كان هناك ${noun} خلال ${periodLabel}.`;
    }
    case "feedback_stats": {
      const stats = result as {
        total?: number;
        thumbsUp?: number;
        thumbsDown?: number;
        positiveRate?: number;
      };
      const total = Number(stats?.total ?? 0);
      const thumbsUp = Number(stats?.thumbsUp ?? 0);
      const thumbsDown = Number(stats?.thumbsDown ?? 0);
      const positivePct = Math.round(Number(stats?.positiveRate ?? 0) * 100);
      if (en) {
        return `Feedback for ${periodLabel}: ${total} total (${thumbsUp} thumbs up, ${thumbsDown} thumbs down), ${positivePct}% positive.`;
      }
      return `التقييم خلال ${periodLabel}: الإجمالي ${total} (${thumbsUp} إعجاب، ${thumbsDown} عدم إعجاب)، نسبة الرضا ${positivePct}%.`;
    }
    case "top_queries": {
      const rows = Array.isArray(result)
        ? (result as Array<{ query?: unknown; count?: unknown }>)
        : [];
      if (rows.length === 0) {
        return en
          ? `No queries were recorded ${periodLabel}.`
          : `لم تُسجل أي استفسارات خلال ${periodLabel}.`;
      }
      const header = en
        ? `Most common queries (${periodLabel}):`
        : `أكثر الاستفسارات شيوعاً (${periodLabel}):`;
      const lines = rows.map((row, index) => {
        const query = String(row?.query ?? "").slice(0, 120);
        const count = Number(row?.count ?? 0);
        const times = en
          ? count === 1
            ? "time"
            : "times"
          : count === 1
            ? "مرة"
            : "مرات";
        return `${index + 1}. "${query}" — ${count} ${times}`;
      });
      return [header, ...lines].join("\n");
    }
    case "usage_trend": {
      const rows = Array.isArray(result)
        ? (result as Array<{
            date?: unknown;
            timestamp?: unknown;
            queries?: unknown;
          }>)
        : [];
      if (rows.length === 0) {
        return en
          ? `No usage was recorded ${periodLabel}.`
          : `لم يُسجل أي استخدام خلال ${periodLabel}.`;
      }
      const header = en
        ? `Usage trend (${periodLabel}):`
        : `اتجاه الاستخدام (${periodLabel}):`;
      const lines = rows.slice(0, 10).map((row) => {
        const date = String(row?.date ?? row?.timestamp ?? "").slice(0, 10);
        const queries = Number(row?.queries ?? 0);
        return en
          ? `- ${date}: ${queries} queries`
          : `- ${date}: ${queries} استفسار`;
      });
      return [header, ...lines].join("\n");
    }
  }
}

function asCount(result: unknown): number {
  const value =
    typeof result === "object" &&
    result !== null &&
    "count" in (result as { count?: unknown })
      ? (result as { count?: unknown }).count
      : 0;
  return Number(value ?? 0);
}
