import type { OcrProvider, OcrPageInput, OcrBatchResult, OcrPageResult, OcrLanguage } from "./types.js";
import { getOcrConfig } from "../../config/ocr.config.js";
import { ProviderTimeoutError, OcrProviderError } from "./errors.js";
import { logger } from "../../common/logger/logger.js";

const PADDLE_LANG_MAP: Record<OcrLanguage, string> = {
  ar: "ar",
  en: "en",
  "ar+en": "ar",
};

interface PaddleOcrResponse {
  pages: Array<{
    pageNumber: number;
    text: string;
    confidence: number;
    words: Array<{
      text: string;
      confidence: number;
      boundingBox?: { x: number; y: number; width: number; height: number };
    }>;
    warnings: string[];
  }>;
  requestId?: string;
}

export class PaddleOcrProvider implements OcrProvider {
  readonly name = "paddle";
  readonly version = "2.x";
  private serviceUrl: string;

  constructor(serviceUrl?: string) {
    const config = getOcrConfig();
    this.serviceUrl = serviceUrl || config.paddleServiceUrl;
  }

  async recognizeBatch(pages: OcrPageInput[]): Promise<OcrBatchResult> {
    const config = getOcrConfig();
    const startTime = Date.now();
    const multipartBody = new FormData();
    for (const page of pages) {
      const lang = PADDLE_LANG_MAP[page.language] || "ar";
      multipartBody.append("languages", lang);
      const ext = page.mimeType.includes("png") ? "png" : "jpg";
      const blob = new Blob([new Uint8Array(page.imageBuffer)], { type: page.mimeType });
      multipartBody.append("files", blob, `page_${page.pageNumber}.${ext}`);
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), config.timeout);

      const response = await fetch(`${this.serviceUrl}/ocr`, {
        method: "POST",
        body: multipartBody,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const body = await response.text().catch(() => "unknown");
        throw new OcrProviderError(
          `PaddleOCR service returned ${response.status}: ${body}`,
          this.name,
        );
      }

      const data = (await response.json()) as PaddleOcrResponse;
      const totalDurationMs = Date.now() - startTime;

      logger.info({
        msg: "PaddleOCR batch processed",
        provider: this.name,
        pageCount: pages.length,
        durationMs: totalDurationMs,
        requestId: data.requestId,
      });

      const results: OcrPageResult[] = data.pages.map((p) => ({
        pageNumber: p.pageNumber,
        text: p.text,
        confidence: p.confidence,
        words: p.words.map((w) => ({
          text: w.text,
          confidence: w.confidence,
          boundingBox: w.boundingBox,
        })),
        language: pages[0]?.language || "ar+en",
        provider: this.name,
        providerModel: `${this.name}-v${this.version}`,
        durationMs: Math.round(totalDurationMs / pages.length),
        warnings: p.warnings || [],
        requestId: data.requestId,
      }));

      return {
        pages: results,
        totalCostUsd: 0,
        providerVersion: this.version,
      };
    } catch (err: unknown) {
      if (err instanceof OcrProviderError) throw err;

      const error = err instanceof Error ? err : new Error(String(err));

      if (error.name === "AbortError") {
        throw new ProviderTimeoutError(this.name, config.timeout, error);
      }

      logger.error({
        msg: "PaddleOCR service error",
        provider: this.name,
        durationMs: Date.now() - startTime,
        error: error.message,
      });

      const fallbackResults: OcrPageResult[] = pages.map((page) => ({
        pageNumber: page.pageNumber,
        text: "",
        confidence: 0,
        words: [],
        language: page.language,
        provider: this.name,
        providerModel: `${this.name}-v${this.version}`,
        durationMs: Date.now() - startTime,
        warnings: [`PaddleOCR service error: ${error.message}`],
      }));

      return {
        pages: fallbackResults,
        totalCostUsd: 0,
        providerVersion: this.version,
      };
    }
  }

  isLanguageSupported(lang: OcrLanguage): boolean {
    return lang in PADDLE_LANG_MAP;
  }
}

export function createPaddleOcrProvider(serviceUrl?: string): PaddleOcrProvider {
  return new PaddleOcrProvider(serviceUrl);
}
