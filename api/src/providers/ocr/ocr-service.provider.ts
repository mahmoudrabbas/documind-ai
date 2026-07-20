import type { OcrProvider, OcrPageInput, OcrBatchResult, OcrPageResult, OcrLanguage } from "./types.js";
import { getOcrConfig } from "../../config/ocr.config.js";
import { ProviderTimeoutError, OcrProviderError } from "./errors.js";
import { logger } from "../../common/logger/logger.js";

const OCR_LANG_MAP: Record<OcrLanguage, string> = {
  ar: "ar",
  en: "en",
  "ar+en": "ar",
};

interface OcrServiceResponse {
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

export class OcrServiceProvider implements OcrProvider {
  readonly name = "ocr";
  readonly version = "1.0";
  private serviceUrl: string;

  constructor(serviceUrl?: string) {
    const config = getOcrConfig();
    this.serviceUrl = serviceUrl || config.ocrServiceUrl;
  }

  async recognizeBatch(pages: OcrPageInput[]): Promise<OcrBatchResult> {
    const config = getOcrConfig();
    const startTime = Date.now();
    const multipartBody = new FormData();
    for (const page of pages) {
      const lang = OCR_LANG_MAP[page.language] || "ar";
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
          `OCR service returned ${response.status}: ${body}`,
          this.name,
        );
      }

      const data = (await response.json()) as OcrServiceResponse;
      const totalDurationMs = Date.now() - startTime;

      logger.info({
        msg: "OCR service batch processed",
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
        msg: "OCR service error",
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
        warnings: [`OCR service error: ${error.message}`],
      }));

      return {
        pages: fallbackResults,
        totalCostUsd: 0,
        providerVersion: this.version,
      };
    }
  }

  isLanguageSupported(lang: OcrLanguage): boolean {
    return lang in OCR_LANG_MAP;
  }
}

export function createOcrServiceProvider(serviceUrl?: string): OcrServiceProvider {
  return new OcrServiceProvider(serviceUrl);
}
