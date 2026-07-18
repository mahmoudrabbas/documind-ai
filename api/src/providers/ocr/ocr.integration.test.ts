import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  createFakeOcrProvider,
  createTesseractOcrProvider,
  getOcrProvider,
  resetOcrProvider,
} from "./index.js";
import { FakeOcrProvider } from "./fake.provider.js";
import type { OcrPageInput, OcrLanguage } from "./types.js";

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
});
