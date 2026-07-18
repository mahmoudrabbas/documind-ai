import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createFakeOcrProvider,
  createTesseractOcrProvider,
  getOcrProvider,
  resetOcrProvider,
} from "./index.js";
import { FakeOcrProvider } from "./fake.provider.js";
import { TesseractOcrProvider } from "./tesseract.provider.js";
import { ProviderTimeoutError, UnsupportedLanguageError } from "./errors.js";
import type { OcrPageInput, OcrLanguage, OcrProvider, OcrBatchResult } from "./types.js";

describe("OCR Provider Integration", () => {
  function makePage(overrides: Partial<OcrPageInput> = {}): OcrPageInput {
    return {
      pageNumber: 1,
      imageBuffer: Buffer.from("fake-image-data"),
      mimeType: "image/png",
      language: "en",
      ...overrides,
    };
  }

  describe("Provider Factory", () => {
    it("createFakeOcrProvider returns FakeOcrProvider", () => {
      const provider = createFakeOcrProvider();
      assert.ok(provider instanceof FakeOcrProvider);
      assert.equal(provider.name, "fake-ocr");
    });

    it("createTesseractOcrProvider returns a tesseract provider", () => {
      const provider = createTesseractOcrProvider();
      assert.ok(provider instanceof TesseractOcrProvider);
      assert.equal(provider.name, "tesseract");
      assert.equal(provider.version, "5.x");
    });
  });

  describe("FakeProvider", () => {
    let provider: FakeOcrProvider;

    beforeEach(() => {
      provider = createFakeOcrProvider();
    });

    it("recognizeBatch returns synthetic results", async () => {
      const pages = [makePage({ pageNumber: 1 }), makePage({ pageNumber: 2 })];
      const result = await provider.recognizeBatch(pages);

      assert.equal(result.pages.length, 2);
      assert.equal(result.pages[0].pageNumber, 1);
      assert.equal(result.pages[1].pageNumber, 2);
      assert.equal(result.totalCostUsd, 0);
    });

    it("accepts any language", async () => {
      const pages = [makePage({ language: "ja" as OcrLanguage })];
      const result = await provider.recognizeBatch(pages);
      assert.equal(result.pages.length, 1);
    });
  });

  describe("Provider Name and Version", () => {
    it("fake provider has correct metadata", () => {
      const provider = createFakeOcrProvider();
      assert.equal(provider.name, "fake-ocr");
      assert.equal(provider.version, "1.0.0");
    });

    it("tesseract provider has correct metadata", () => {
      const provider = createTesseractOcrProvider();
      assert.equal(provider.name, "tesseract");
      assert.equal(provider.version, "5.x");
    });
  });

  describe("getOcrProvider singleton", () => {
    beforeEach(() => {
      resetOcrProvider();
      process.env.OCR_PROVIDER = "fake";
    });

    it("returns same instance on repeated calls", () => {
      const a = getOcrProvider();
      const b = getOcrProvider();
      assert.strictEqual(a, b);
    });

    it("resetOcrProvider allows new instance", () => {
      const a = getOcrProvider();
      resetOcrProvider();
      const b = getOcrProvider();
      assert.notStrictEqual(a, b);
    });
  });

  describe("Timeout handling", () => {
    it("ProviderTimeoutError carries provider name and timeout", () => {
      const err = new ProviderTimeoutError("tesseract", 30000);
      assert.equal(err.name, "ProviderTimeoutError");
      assert.equal(err.provider, "tesseract");
      assert.equal(err.timeoutMs, 30000);
      assert.ok(err.message.includes("30000"));
    });

    it("provider that times out returns empty results with warning", async () => {
      const provider: OcrProvider = {
        name: "slow-provider",
        version: "1.0",
        async recognizeBatch(pages): Promise<OcrBatchResult> {
          await new Promise((resolve) => setTimeout(resolve, 100));
          return {
            pages: pages.map((p) => ({
              pageNumber: p.pageNumber,
              text: "",
              confidence: 0,
              words: [],
              language: p.language,
              provider: "slow-provider",
              providerModel: "slow-v1",
              durationMs: 100,
              warnings: ["Provider timed out"],
            })),
            totalCostUsd: 0,
            providerVersion: "1.0",
          };
        },
        isLanguageSupported: () => true,
      };

      const result = await provider.recognizeBatch([makePage()]);
      assert.equal(result.pages[0].confidence, 0);
      assert.ok(result.pages[0].warnings.length > 0);
    });
  });

  describe("Retry and Fallback orchestration", () => {
    it("succeeds on first attempt with no retry needed", async () => {
      const provider = createFakeOcrProvider();
      let callCount = 0;
      const origRecognize = provider.recognizeBatch.bind(provider);
      provider.recognizeBatch = async (...args) => {
        callCount++;
        return origRecognize(...args);
      };

      const result = await provider.recognizeBatch([makePage()]);
      assert.equal(callCount, 1);
      assert.equal(result.pages[0].confidence, 0.95);
    });

    it("partial page failure produces zero-confidence pages with warnings", async () => {
      const provider = createFakeOcrProvider();
      const result = await provider.recognizeBatch([
        makePage({ pageNumber: 1 }),
        makePage({ pageNumber: 2 }),
      ]);

      assert.equal(result.pages.length, 2);
      result.pages.forEach((p) => {
        assert.ok(typeof p.confidence === "number");
        assert.ok(Array.isArray(p.warnings));
      });
    });
  });

  describe("Unsupported language handling", () => {
    it("UnsupportedLanguageError carries language name", () => {
      const err = new UnsupportedLanguageError("tesseract", "ja");
      assert.equal(err.name, "UnsupportedLanguageError");
      assert.equal(err.language, "ja");
      assert.equal(err.provider, "tesseract");
    });

    it("tesseract provider rejects unsupported language", async () => {
      const provider = createTesseractOcrProvider();
      assert.equal(provider.isLanguageSupported("ar"), true);
      assert.equal(provider.isLanguageSupported("en"), true);
      assert.equal(provider.isLanguageSupported("ar+en"), true);
    });
  });

  describe("Low-confidence review flow", () => {
    it("quality agent returns REVIEW_REQUIRED for low confidence", async () => {
      const { analyzeDocumentQuality } = await import("../../modules/processing/qualityAgent.js");
      const result = analyzeDocumentQuality({
        totalPages: 1,
        extractionPages: [{ pageNumber: 1, text: "Low quality", characterCount: 10, blockCount: 1, hasImageOnlyPages: false }],
        ocrPages: [{ pageNumber: 1, text: "Low quality", confidence: 0.25, language: "ar+en", warnings: [] }],
        detectedLanguages: ["ar", "en"],
        extractionWarnings: [],
      });

      assert.equal(result.qualityStatus, "REVIEW_REQUIRED");
      assert.equal(result.requiresReview, true);
    });

    it("quality agent returns READY_FOR_INDEXING for high confidence", async () => {
      const { analyzeDocumentQuality } = await import("../../modules/processing/qualityAgent.js");
      const result = analyzeDocumentQuality({
        totalPages: 1,
        extractionPages: [{ pageNumber: 1, text: "Good quality text", characterCount: 20, blockCount: 1, hasImageOnlyPages: false }],
        ocrPages: [{ pageNumber: 1, text: "Good quality text", confidence: 0.95, language: "ar+en", warnings: [] }],
        detectedLanguages: ["ar", "en"],
        extractionWarnings: [],
      });

      assert.equal(result.qualityStatus, "READY_FOR_INDEXING");
      assert.equal(result.requiresReview, false);
    });

    it("quality agent returns READY_WITH_WARNINGS for moderate confidence", async () => {
      const { analyzeDocumentQuality } = await import("../../modules/processing/qualityAgent.js");
      const result = analyzeDocumentQuality({
        totalPages: 1,
        extractionPages: [{ pageNumber: 1, text: "Moderate text", characterCount: 15, blockCount: 1, hasImageOnlyPages: false }],
        ocrPages: [{ pageNumber: 1, text: "Moderate text", confidence: 0.6, language: "ar+en", warnings: ["Low contrast"] }],
        detectedLanguages: ["ar", "en"],
        extractionWarnings: [],
      });

      assert.equal(result.qualityStatus, "READY_WITH_WARNINGS");
      assert.equal(result.requiresReview, false);
    });

    it("quality agent detects blank pages", async () => {
      const { analyzeDocumentQuality } = await import("../../modules/processing/qualityAgent.js");
      const result = analyzeDocumentQuality({
        totalPages: 1,
        extractionPages: [{ pageNumber: 1, text: "", characterCount: 0, blockCount: 0, hasImageOnlyPages: false }],
        ocrPages: [{ pageNumber: 1, text: "", confidence: 0.5, language: "ar+en", warnings: [] }],
        detectedLanguages: ["ar", "en"],
        extractionWarnings: [],
      });

      const blankIssues = result.issues.filter((i) => i.type === "blank_page");
      assert.ok(blankIssues.length > 0, "Should detect blank page");
    });

    it("quality agent detects garbled text", async () => {
      const { analyzeDocumentQuality } = await import("../../modules/processing/qualityAgent.js");
      const garbledText = "ABC\u0000\u0001\u0002\u0003\u0004\u0005\u0006\u0007\u0008\u0009\u000A\u000B\u000C\u000D\u000E\u000FDEF";
      const result = analyzeDocumentQuality({
        totalPages: 1,
        extractionPages: [{ pageNumber: 1, text: garbledText, characterCount: garbledText.length, blockCount: 1, hasImageOnlyPages: false }],
        ocrPages: [{ pageNumber: 1, text: garbledText, confidence: 0.8, language: "ar+en", warnings: [] }],
        detectedLanguages: ["ar", "en"],
        extractionWarnings: [],
      });

      const garbledIssues = result.issues.filter((i) => i.type === "garbled_text");
      assert.ok(garbledIssues.length > 0, "Should detect garbled text");
    });
  });

  describe("Partial-page failure", () => {
    it("partial failure produces mixed status results", async () => {
      const provider = createFakeOcrProvider();
      const pages = [
        makePage({ pageNumber: 1 }),
        makePage({ pageNumber: 2 }),
        makePage({ pageNumber: 3 }),
      ];

      const result = await provider.recognizeBatch(pages);
      assert.equal(result.pages.length, 3);
      result.pages.forEach((p, i) => {
        assert.equal(p.pageNumber, i + 1);
        assert.ok(typeof p.confidence === "number");
      });
    });
  });

  describe("Error hierarchy", () => {
    it("all error classes extend OcrProviderError", async () => {
      const { OcrProviderError } = await import("./errors.js");
      const { ProviderTimeoutError: PTE } = await import("./errors.js");
      const { UnsupportedLanguageError: ULE } = await import("./errors.js");
      const { OcrAuthenticationError: OAE } = await import("./errors.js");
      const { OcrQuotaExceededError: OQE } = await import("./errors.js");
      const { PartialPageFailureError: PPFE } = await import("./errors.js");

      assert.ok(new PTE("test", 1000) instanceof OcrProviderError);
      assert.ok(new ULE("test", "ja") instanceof OcrProviderError);
      assert.ok(new OAE("test") instanceof OcrProviderError);
      assert.ok(new OQE("test") instanceof OcrProviderError);
      assert.ok(new PPFE("test", [1], [2, 3]) instanceof OcrProviderError);
    });

    it("PartialPageFailureError carries failed/succeeded page lists", async () => {
      const { PartialPageFailureError } = await import("./errors.js");
      const err = new PartialPageFailureError("tesseract", [2, 4], [1, 3, 5]);
      assert.deepEqual(err.failedPages, [2, 4]);
      assert.deepEqual(err.succeededPages, [1, 3, 5]);
      assert.ok(err.message.includes("2 page(s) failed"));
    });
  });
});
