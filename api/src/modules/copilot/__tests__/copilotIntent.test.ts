import { describe, it, expect } from "vitest";
import { detectIntentMode } from "../intent/copilotIntent.js";

describe("detectIntentMode", () => {
  it("honors an explicit guide mode", () => {
    const result = detectIntentMode({ query: "Search for documents", mode: "guide" });
    expect(result).toEqual({ mode: "guide", source: "explicit" });
  });

  it("honors an explicit action mode", () => {
    const result = detectIntentMode({ query: "Show me how to upload", mode: "action" });
    expect(result).toEqual({ mode: "action", source: "explicit" });
  });

  it("classifies how-to phrasing as guide", () => {
    const guideQueries = [
      "How do I upload a document?",
      "How to invite a user",
      "Show me how to search the knowledge base",
      "Guide me through creating a role",
      "Walk me through the import flow",
      "Teach me to run a health check step by step",
      "Quick demo of the dashboard",
      "كيف أرفع مستند",
      "أرشدني لإنشاء مجلد",
      "علمني خطوة بخطوة",
      "اشرح لي كيف أبحث",
    ];
    for (const query of guideQueries) {
      expect(detectIntentMode({ query }).mode).toBe("guide");
    }
  });

  it("defaults ordinary requests to action mode", () => {
    const actionQueries = [
      "Search for the onboarding policy",
      "Find invoices from last month",
      "Invite the new engineer",
      "Upload document.pdf",
      "What is our vacation policy?",
      "Run the OCR on batch 5",
      "ارفع المستند",
    ];
    for (const query of actionQueries) {
      expect(detectIntentMode({ query })).toEqual({ mode: "action", source: "auto" });
    }
  });

  it("returns auto source when mode is absent or auto", () => {
    expect(detectIntentMode({ query: "How do I search" }).source).toBe("auto");
    expect(detectIntentMode({ query: "Search docs", mode: "auto" }).source).toBe("auto");
  });
});
