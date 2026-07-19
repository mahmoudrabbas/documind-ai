import { z } from "zod";

const OcrProviderType = z.enum(["fake", "tesseract", "paddle", "ocr"]);

const ocrConfigSchema = z.object({
  provider: OcrProviderType.default("fake"),
  fallbackProvider: OcrProviderType.default("fake"),
  timeout: z.coerce.number().int().positive().default(30_000),
  maxRetries: z.coerce.number().int().min(0).default(3),
  retryDelayMs: z.coerce.number().int().min(0).default(1_000),
  confidenceThreshold: z.coerce.number().min(0).max(1).default(0.7),
  criticalConfidenceThreshold: z.coerce.number().min(0).max(1).default(0.4),
  maxPages: z.coerce.number().int().positive().default(500),
  maxFileSizeBytes: z.coerce.number().int().positive().default(50 * 1024 * 1024),
  ocrServiceUrl: z.string().url().default("http://localhost:8501"),
});

export type OcrConfig = z.infer<typeof ocrConfigSchema>;

let cachedConfig: OcrConfig | null = null;

export function getOcrConfig(): OcrConfig {
  if (!cachedConfig) {
    cachedConfig = ocrConfigSchema.parse({
      provider: process.env.OCR_PROVIDER || "fake",
      fallbackProvider: process.env.OCR_FALLBACK_PROVIDER || "fake",
      timeout: process.env.OCR_TIMEOUT,
      maxRetries: process.env.OCR_MAX_RETRIES,
      retryDelayMs: process.env.OCR_RETRY_DELAY_MS,
      confidenceThreshold: process.env.OCR_CONFIDENCE_THRESHOLD,
      criticalConfidenceThreshold: process.env.OCR_CRITICAL_CONFIDENCE_THRESHOLD,
      maxPages: process.env.OCR_MAX_PAGES,
      maxFileSizeBytes: process.env.OCR_MAX_FILE_SIZE_BYTES,
      ocrServiceUrl: process.env.OCR_SERVICE_URL || process.env.PADDLE_OCR_SERVICE_URL,
    });
  }
  return cachedConfig;
}

export function resetOcrConfig(): void {
  cachedConfig = null;
}
