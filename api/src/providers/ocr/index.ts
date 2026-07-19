import type { OcrProvider, OcrPageInput, OcrBatchResult, OcrLanguage } from "./types.js";
import { getOcrConfig } from "../../config/ocr.config.js";
import { logger } from "../../common/logger/logger.js";
import { FakeOcrProvider } from "./fake.provider.js";
import { TesseractOcrProvider } from "./tesseract.provider.js";
import { OcrServiceProvider } from "./ocr-service.provider.js";


export type { OcrProvider, OcrPageInput, OcrBatchResult, OcrPageResult, OcrLanguage } from "./types.js";
export { FakeOcrProvider } from "./fake.provider.js";
export { TesseractOcrProvider } from "./tesseract.provider.js";
export { OcrServiceProvider } from "./ocr-service.provider.js";
export {
  OcrProviderError,
  ProviderTimeoutError,
  UnsupportedLanguageError,
  OcrAuthenticationError,
  OcrQuotaExceededError,
  PartialPageFailureError,
} from "./errors.js";

function createProvider(type: string): OcrProvider {
  switch (type) {
    case "tesseract":
      return new TesseractOcrProvider();
    case "paddle":
    case "ocr":
      return new OcrServiceProvider();
    case "fake":
      return new FakeOcrProvider();
    default:
      logger.warn({ msg: "Unknown OCR provider, falling back to fake", provider: type });
      return new FakeOcrProvider();
  }
}

class OcrProviderWithFallback implements OcrProvider {
  readonly name: string;
  readonly version: string;
  private primary: OcrProvider;
  private fallback: OcrProvider | null;
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(primary: OcrProvider, fallback: OcrProvider | null, maxRetries: number, retryDelayMs: number) {
    this.primary = primary;
    this.fallback = fallback;
    this.maxRetries = maxRetries;
    this.retryDelayMs = retryDelayMs;
    this.name = primary.name;
    this.version = primary.version;
  }

  async recognizeBatch(pages: OcrPageInput[]): Promise<OcrBatchResult> {
    let lastError: Error | null = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const result = await this.primary.recognizeBatch(pages);

        const failedPages = result.pages
          .filter((p) => p.confidence === 0 && p.warnings.some((w) => w.includes("failed")))
          .map((p) => p.pageNumber);

        if (failedPages.length > 0 && failedPages.length < pages.length) {
          logger.warn({
            msg: "Partial OCR failure",
            provider: this.primary.name,
            failedPages,
            attempt,
          });
        }

        return result;
      } catch (err: unknown) {
        lastError = err instanceof Error ? err : new Error(String(err));

        logger.warn({
          msg: "OCR provider attempt failed",
          provider: this.primary.name,
          attempt,
          maxRetries: this.maxRetries,
          error: lastError.message,
        });

        if (attempt < this.maxRetries) {
          await new Promise((resolve) => setTimeout(resolve, this.retryDelayMs * attempt));
        }
      }
    }

    if (this.fallback) {
      logger.warn({
        msg: "Falling back to secondary OCR provider",
        primary: this.primary.name,
        fallback: this.fallback.name,
        error: lastError?.message,
      });

      try {
        return await this.fallback.recognizeBatch(pages);
      } catch (fallbackErr: unknown) {
        const fbError = fallbackErr instanceof Error ? fallbackErr : new Error(String(fallbackErr));
        logger.error({
          msg: "Fallback OCR provider also failed",
          provider: this.fallback.name,
          error: fbError.message,
        });
      }
    }

    throw lastError;
  }

  isLanguageSupported(lang: OcrLanguage): boolean {
    return this.primary.isLanguageSupported(lang);
  }
}

let singleton: OcrProvider | null = null;

export function getOcrProvider(): OcrProvider {
  if (!singleton) {
    const config = getOcrConfig();
    const primary = createProvider(config.provider);
    const fallback = config.fallbackProvider !== config.provider
      ? createProvider(config.fallbackProvider)
      : null;

    if (config.maxRetries > 0 || fallback) {
      singleton = new OcrProviderWithFallback(primary, fallback, config.maxRetries, config.retryDelayMs);
    } else {
      singleton = primary;
    }

    logger.info({
      msg: "OCR provider initialized",
      provider: singleton.name,
      fallback: fallback?.name || "none",
      maxRetries: config.maxRetries,
      timeout: config.timeout,
    });
  }
  return singleton;
}

export function createFakeOcrProvider(): FakeOcrProvider {
  return new FakeOcrProvider();
}

export function createTesseractOcrProvider(): TesseractOcrProvider {
  return new TesseractOcrProvider();
}

export function createOcrServiceProvider(serviceUrl?: string): OcrServiceProvider {
  return new OcrServiceProvider(serviceUrl);
}

export function resetOcrProvider(): void {
  singleton = null;
}
