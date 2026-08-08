import { describe, it } from "node:test";
import assert from "node:assert/strict";

process.env.NODE_ENV = "test";

import {
  detectAnalyticsRequest,
  formatAnalyticsAnswer,
  detectReplyLanguage,
} from "./chat.tools.js";

describe("detectAnalyticsRequest", () => {
  it("detects document_count questions in English and Arabic", () => {
    assert.deepEqual(detectAnalyticsRequest("How many documents do we have?"), {
      metric: "document_count",
      period: "week",
    });
    assert.deepEqual(detectAnalyticsRequest("What is the total number of files?"), {
      metric: "document_count",
      period: "week",
    });
    assert.deepEqual(detectAnalyticsRequest("كم عدد المستندات؟"), {
      metric: "document_count",
      period: "week",
    });
    assert.deepEqual(detectAnalyticsRequest("عدد الوثائق المرفوعة"), {
      metric: "document_count",
      period: "week",
    });
  });

  it("detects query_count questions", () => {
    assert.deepEqual(detectAnalyticsRequest("How many queries this week?"), {
      metric: "query_count",
      period: "week",
    });
    assert.deepEqual(detectAnalyticsRequest("عدد الاستفسارات هذا الشهر"), {
      metric: "query_count",
      period: "month",
    });
  });

  it("detects top_queries questions", () => {
    assert.deepEqual(
      detectAnalyticsRequest("What are the most common queries this week?"),
      { metric: "top_queries", period: "week" },
    );
    assert.deepEqual(
      detectAnalyticsRequest("ما هي أكثر الأسئلة شيوعاً هذا الأسبوع؟"),
      { metric: "top_queries", period: "week" },
    );
    assert.deepEqual(detectAnalyticsRequest("الأسئلة الشائعة اليوم"), {
      metric: "top_queries",
      period: "day",
    });
  });

  it("detects feedback_stats and usage_trend questions", () => {
    assert.deepEqual(detectAnalyticsRequest("Feedback for this month?"), {
      metric: "feedback_stats",
      period: "month",
    });
    assert.deepEqual(detectAnalyticsRequest("ما هي نسبة الرضا؟"), {
      metric: "feedback_stats",
      period: "week",
    });
    assert.deepEqual(detectAnalyticsRequest("Show me the usage trend"), {
      metric: "usage_trend",
      period: "week",
    });
    assert.deepEqual(detectAnalyticsRequest("اتجاه الاستخدام هذا الشهر"), {
      metric: "usage_trend",
      period: "month",
    });
  });

  it("detects explicit periods (day/month)", () => {
    assert.equal(detectAnalyticsRequest("How many documents today?")?.period, "day");
    assert.equal(detectAnalyticsRequest("كم مستند اليوم؟")?.period, "day");
    assert.equal(
      detectAnalyticsRequest("How many documents were there this month?")?.period,
      "month",
    );
  });

  it("does not hijack document-content questions into analytics", () => {
    assert.equal(
      detectAnalyticsRequest("What are the FAQs in the employee handbook?"),
      null,
    );
    assert.equal(
      detectAnalyticsRequest("ما هي الأسئلة الشائعة في سياسة السفر؟"),
      null,
    );
    assert.equal(
      detectAnalyticsRequest("How satisfied are employees with the leave policy?"),
      null,
    );
    assert.equal(detectAnalyticsRequest("What is remote work policy?"), null);
    assert.equal(detectAnalyticsRequest("مرحباً"), null);
  });

  it("suppresses analytics when the plan resolved specific documents", () => {
    const plan = {
      referencedDocumentIds: ["64b000000000000000000001"],
      referencedDocumentTitles: [],
    };
    assert.equal(
      detectAnalyticsRequest("How many questions are in Onboarding 2026?", plan),
      null,
    );
  });

  it("suppresses analytics when the plan resolved only a document title", () => {
    assert.equal(
      detectAnalyticsRequest("How many questions are in Onboarding 2026?", {
        referencedDocumentIds: [],
        referencedDocumentTitles: ["Onboarding 2026"],
      }),
      null,
    );
  });

  it("returns null for empty input", () => {
    assert.equal(detectAnalyticsRequest(""), null);
    assert.equal(detectAnalyticsRequest("   "), null);
  });
});

describe("detectReplyLanguage", () => {
  it("detects Arabic and English", () => {
    assert.equal(detectReplyLanguage("مرحبا"), "ar");
    assert.equal(detectReplyLanguage("hello"), "en");
    assert.equal(detectReplyLanguage("123"), "en");
  });
});

describe("formatAnalyticsAnswer", () => {
  it("formats document counts with correct pluralization", () => {
    assert.equal(
      formatAnalyticsAnswer({ count: 1 }, { metric: "document_count", period: "week", language: "en" }),
      "You currently have 1 uploaded document.",
    );
    assert.equal(
      formatAnalyticsAnswer({ count: 5 }, { metric: "document_count", period: "week", language: "en" }),
      "You currently have 5 uploaded documents.",
    );
    assert.equal(
      formatAnalyticsAnswer({ count: 2 }, { metric: "document_count", period: "week", language: "ar" }),
      "لديك حالياً مستندان مرفوعان في مساحة عملك.",
    );
    assert.equal(
      formatAnalyticsAnswer({ count: 5 }, { metric: "document_count", period: "week", language: "ar" }),
      "لديك حالياً 5 مستندات مرفوعة في مساحة عملك.",
    );
  });

  it("formats query counts", () => {
    assert.equal(
      formatAnalyticsAnswer({ count: 1 }, { metric: "query_count", period: "day", language: "en" }),
      "There was 1 query in today.",
    );
    assert.equal(
      formatAnalyticsAnswer({ count: 12 }, { metric: "query_count", period: "week", language: "ar" }),
      "كان هناك 12 استفساراً خلال هذا الأسبوع.",
    );
  });

  it("formats feedback stats with a percentage", () => {
    const answer = formatAnalyticsAnswer(
      { total: 10, thumbsUp: 7, thumbsDown: 3, positiveRate: 0.7 },
      { metric: "feedback_stats", period: "month", language: "en" },
    );
    assert.match(answer, /Feedback for this month: 10 total \(7 thumbs up, 3 thumbs down\), 70% positive\./);
  });

  it("formats top queries as a numbered list and handles empty results", () => {
    const answer = formatAnalyticsAnswer(
      [
        { query: "remote work policy", count: 4 },
        { query: "leave days", count: 2 },
      ],
      { metric: "top_queries", period: "week", language: "en" },
    );
    assert.ok(answer.includes('1. "remote work policy" — 4 times'));
    assert.ok(answer.includes('2. "leave days" — 2 times'));

    const empty = formatAnalyticsAnswer([], {
      metric: "top_queries",
      period: "week",
      language: "ar",
    });
    assert.equal(empty, "لم تُسجل أي استفسارات خلال هذا الأسبوع.");
  });

  it("formats usage trend series", () => {
    const answer = formatAnalyticsAnswer(
      [
        { date: "2026-08-05", queries: 12 },
        { date: "2026-08-06", queries: 8 },
      ],
      { metric: "usage_trend", period: "week", language: "en" },
    );
    assert.ok(answer.includes("Usage trend (this week):"));
    assert.ok(answer.includes("- 2026-08-05: 12 queries"));
  });
});
