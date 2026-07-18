import type { OcrProvider, OcrPageInput, OcrBatchResult, OcrPageResult, OcrLanguage } from "./types.js";

export class FakeOcrProvider implements OcrProvider {
  readonly name = "fake-ocr";
  readonly version = "1.0.0";

  async recognizeBatch(pages: OcrPageInput[]): Promise<OcrBatchResult> {
    const results: OcrPageResult[] = pages.map((page) => ({
      pageNumber: page.pageNumber,
      text: `[FAKE OCR] Simulated text extraction for page ${page.pageNumber}. This is placeholder content produced by the fake OCR adapter for testing purposes. La simulación produce texto de prueba.`,
      confidence: 0.95,
      words: [
        {
          text: `[FAKE OCR] Page ${page.pageNumber}`,
          confidence: 0.95,
        },
      ],
      language: page.language,
      provider: this.name,
      providerModel: `${this.name}-v${this.version}`,
      durationMs: 10,
      warnings: [],
    }));

    return {
      pages: results,
      totalCostUsd: 0,
      providerVersion: this.version,
    };
  }

  isLanguageSupported(_lang: OcrLanguage): boolean {
    return true;
  }
}

export function createFakeOcrProvider(): FakeOcrProvider {
  return new FakeOcrProvider();
}
