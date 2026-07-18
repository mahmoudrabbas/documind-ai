import test from "node:test";
import assert from "node:assert";
import {
  analyzeDocumentQuality,
  type QualityAnalysisInput,
  type PageExtractionData,
  type OcrPageData,
} from "./qualityAgent.js";

function makeExtractionPage(overrides: Partial<PageExtractionData> = {}): PageExtractionData {
  return {
    pageNumber: 1,
    text: "Sample extracted text content for testing.",
    characterCount: 40,
    blockCount: 1,
    hasImageOnlyPages: false,
    ...overrides,
  };
}

function makeOcrPage(overrides: Partial<OcrPageData> = {}): OcrPageData {
  return {
    pageNumber: 1,
    text: "OCR extracted text from page.",
    confidence: 0.9,
    language: "ar+en",
    warnings: [],
    ...overrides,
  };
}

function makeInput(overrides: Partial<QualityAnalysisInput> = {}): QualityAnalysisInput {
  return {
    totalPages: 1,
    extractionPages: [makeExtractionPage()],
    ocrPages: [makeOcrPage()],
    detectedLanguages: ["ar", "en"],
    extractionWarnings: [],
    ...overrides,
  };
}

test("qualityAgent", async (t) => {
  await t.test("returns READY_FOR_INDEXING for high-confidence pages with no issues", async () => {
    const result = analyzeDocumentQuality(makeInput());
    assert.equal(result.qualityStatus, "READY_FOR_INDEXING");
    assert.equal(result.requiresReview, false);
    assert.ok(result.overallConfidence > 0.8);
  });

  await t.test("detects blank pages", async () => {
    const input = makeInput({
      extractionPages: [makeExtractionPage({ text: "", characterCount: 0 })],
      ocrPages: [makeOcrPage({ text: "", confidence: 0.5 })],
    });
    const result = analyzeDocumentQuality(input);
    const blankIssues = result.issues.filter((i) => i.type === "blank_page");
    assert.ok(blankIssues.length > 0, "Should detect blank page");
  });

  await t.test("detects garbled text above threshold", async () => {
    const garbledText = "ABC\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008\u0009\u000A\u000B\u000C\u000D\u000E\u000F\u0010\u0011\u0012\u0013\u0014\u0015\u0016\u0017\u0018\u0019\u001A\u001B\u001C\u001D\u001E\u001FDEF";
    const input = makeInput({
      extractionPages: [makeExtractionPage({ text: garbledText, characterCount: garbledText.length })],
      ocrPages: [makeOcrPage({ text: garbledText, confidence: 0.8 })],
    });
    const result = analyzeDocumentQuality(input);
    const garbledIssues = result.issues.filter((i) => i.type === "garbled_text");
    assert.ok(garbledIssues.length > 0, "Should detect garbled text");
  });

  await t.test("detects low OCR confidence", async () => {
    const input = makeInput({
      ocrPages: [makeOcrPage({ confidence: 0.3 })],
    });
    const result = analyzeDocumentQuality(input);
    const lowConfIssues = result.issues.filter((i) => i.type === "low_confidence");
    assert.ok(lowConfIssues.length > 0, "Should detect low confidence");
  });

  await t.test("returns REVIEW_REQUIRED when critical issues exist", async () => {
    const input = makeInput({
      ocrPages: [makeOcrPage({ confidence: 0.2 })],
    });
    const result = analyzeDocumentQuality(input);
    assert.equal(result.qualityStatus, "REVIEW_REQUIRED");
    assert.equal(result.requiresReview, true);
  });

  await t.test("returns REVIEW_REQUIRED when overall confidence is below critical threshold", async () => {
    const input = makeInput({
      ocrPages: [makeOcrPage({ confidence: 0.35 })],
    });
    const result = analyzeDocumentQuality(input);
    assert.equal(result.qualityStatus, "REVIEW_REQUIRED");
    assert.equal(result.requiresReview, true);
  });

  await t.test("returns READY_WITH_WARNINGS for moderate confidence with warnings", async () => {
    const input = makeInput({
      ocrPages: [makeOcrPage({ confidence: 0.6, warnings: ["Low contrast detected"] })],
    });
    const result = analyzeDocumentQuality(input);
    assert.equal(result.qualityStatus, "READY_WITH_WARNINGS");
    assert.equal(result.requiresReview, false);
  });

  await t.test("detects OCR warnings from provider", async () => {
    const input = makeInput({
      ocrPages: [makeOcrPage({ warnings: ["Rotation detected", "Low contrast"] })],
    });
    const result = analyzeDocumentQuality(input);
    const warningIssues = result.issues.filter((i) => i.message.includes("Rotation detected") || i.message.includes("Low contrast"));
    assert.ok(warningIssues.length >= 2, "Should have warning issues from OCR provider");
  });

  await t.test("calculates per-page confidences correctly", async () => {
    const input = makeInput({
      totalPages: 2,
      extractionPages: [
        makeExtractionPage({ pageNumber: 1 }),
        makeExtractionPage({ pageNumber: 2 }),
      ],
      ocrPages: [
        makeOcrPage({ pageNumber: 1, confidence: 0.95 }),
        makeOcrPage({ pageNumber: 2, confidence: 0.6 }),
      ],
    });
    const result = analyzeDocumentQuality(input);
    assert.equal(result.pageConfidences["1"], 0.95);
    assert.equal(result.pageConfidences["2"], 0.6);
  });

  await t.test("calculates per-page statuses correctly", async () => {
    const input = makeInput({
      totalPages: 2,
      extractionPages: [
        makeExtractionPage({ pageNumber: 1 }),
        makeExtractionPage({ pageNumber: 2 }),
      ],
      ocrPages: [
        makeOcrPage({ pageNumber: 1, confidence: 0.95 }),
        makeOcrPage({ pageNumber: 2, confidence: 0.3 }),
      ],
    });
    const result = analyzeDocumentQuality(input);
    assert.equal(result.pageStatuses["1"], "READY");
    assert.equal(result.pageStatuses["2"], "REVIEW_REQUIRED");
  });

  await t.test("handles empty pages array", async () => {
    const input = makeInput({
      totalPages: 0,
      extractionPages: [],
      ocrPages: [],
    });
    const result = analyzeDocumentQuality(input);
    assert.equal(result.overallConfidence, 0);
    assert.equal(input.totalPages, 0);
  });

  await t.test("generates a summary string", async () => {
    const result = analyzeDocumentQuality(makeInput());
    assert.ok(typeof result.summary === "string");
    assert.ok(result.summary.length > 0);
    assert.ok(result.summary.includes("confidence"));
  });

  await t.test("respects custom thresholds", async () => {
    const input = makeInput({
      thresholds: {
        criticalConfidenceThreshold: 0.5,
        lowConfidenceThreshold: 0.7,
      },
    });
    input.ocrPages[0].confidence = 0.55;
    const result = analyzeDocumentQuality(input);
    assert.equal(result.qualityStatus, "READY_WITH_WARNINGS");
    assert.equal(result.requiresReview, false);
  });
});
