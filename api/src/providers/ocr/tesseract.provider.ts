import type { OcrProvider, OcrPageInput, OcrBatchResult, OcrPageResult, OcrWord, OcrLanguage } from "./types.js";
import { getOcrConfig } from "../../config/ocr.config.js";
import { ProviderTimeoutError } from "./errors.js";
import { logger } from "../../common/logger/logger.js";

const TESSERACT_LANG_MAP: Record<OcrLanguage, string> = {
  ar: "ara",
  en: "eng",
  "ar+en": "ara+eng",
};

interface TesseractWord {
  text: string;
  confidence: number;
  bbox?: { x0: number; y0: number; x1: number; y1: number };
}

export class TesseractOcrProvider implements OcrProvider {
  readonly name = "tesseract";
  readonly version = "5.x";

  async recognizeBatch(pages: OcrPageInput[]): Promise<OcrBatchResult> {
    const config = getOcrConfig();
    const results: OcrPageResult[] = [];
    const totalCostUsd = 0;

    const Tesseract = await import("tesseract.js");

    for (const page of pages) {
      const startTime = Date.now();
      const tessLang = TESSERACT_LANG_MAP[page.language] || "eng";
      const warnings: string[] = [];

      try {
        const result = await Promise.race([
          Tesseract.recognize(page.imageBuffer, tessLang, { logger: () => {} }),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new ProviderTimeoutError(this.name, config.timeout)), config.timeout),
          ),
        ]);

        const words: OcrWord[] = (result.data.words as TesseractWord[]).map((w) => ({
          text: w.text,
          confidence: w.confidence / 100,
          boundingBox: w.bbox
            ? { x: w.bbox.x0, y: w.bbox.y0, width: w.bbox.x1 - w.bbox.x0, height: w.bbox.y1 - w.bbox.y0 }
            : undefined,
        }));

        const avgConfidence = result.data.confidence / 100;
        if (avgConfidence < config.confidenceThreshold) {
          warnings.push(`Low average confidence: ${Math.round(avgConfidence * 100)}%`);
        }

        const durationMs = Date.now() - startTime;

        logger.info({
          msg: "OCR page processed",
          provider: this.name,
          pageNumber: page.pageNumber,
          confidence: avgConfidence,
          durationMs,
          textLength: result.data.text.length,
        });

        results.push({
          pageNumber: page.pageNumber,
          text: result.data.text,
          confidence: avgConfidence,
          words,
          language: page.language,
          provider: this.name,
          providerModel: `${this.name}-v${this.version}`,
          durationMs,
          warnings,
        });
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        const durationMs = Date.now() - startTime;

        logger.error({
          msg: "OCR page failed",
          provider: this.name,
          pageNumber: page.pageNumber,
          durationMs,
          error: error.message,
        });

        results.push({
          pageNumber: page.pageNumber,
          text: "",
          confidence: 0,
          words: [],
          language: page.language,
          provider: this.name,
          providerModel: `${this.name}-v${this.version}`,
          durationMs,
          warnings: [`OCR failed: ${error.message}`],
        });
      }
    }

    return { pages: results, totalCostUsd, providerVersion: this.version };
  }

  isLanguageSupported(lang: OcrLanguage): boolean {
    return lang in TESSERACT_LANG_MAP;
  }
}

export function createTesseractOcrProvider(): TesseractOcrProvider {
  return new TesseractOcrProvider();
}
