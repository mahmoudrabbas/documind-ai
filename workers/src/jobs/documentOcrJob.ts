import { z } from "zod";
import { ObjectId } from "mongodb";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { JobHandlerDefinition, JobHandlerResult } from "../contracts/jobDispatcher.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import { getMongoClient } from "../db/mongo.js";
import { logger } from "../logger.js";
import { reportProgressToProcessingRun } from "./progressReporter.js";
import { storageProvider } from "../providers/storage/index.js";

const require = createRequire(import.meta.url);

let pdfJsModulePromise: Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> | null = null;

async function getPdfJsModule(): Promise<typeof import("pdfjs-dist/legacy/build/pdf.mjs")> {
  pdfJsModulePromise ??= import("pdfjs-dist/legacy/build/pdf.mjs").then((pdfjs) => {
    const workerPath = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
    pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;
    return pdfjs;
  });

  return pdfJsModulePromise;
}

const OcrLanguageSchema = z.enum(["ar", "en", "ar+en"]);

const PayloadSchema = z.object({
  documentId: z.string(),
  tenantId: z.string(),
  documentVersion: z.number().int().positive(),
  language: OcrLanguageSchema.default("ar+en"),
  pageNumbers: z.array(z.number().int().positive()).min(1).optional(),
  ocrProvider: z.string().optional(),
});

type DocumentOcrPayload = z.infer<typeof PayloadSchema>;

interface OcrPageOutput {
  pageNumber: number;
  text: string;
  confidence: number;
  words: Array<{ text: string; confidence: number; boundingBox?: { x: number; y: number; width: number; height: number } }>;
  language: string;
  provider: string;
  providerModel: string;
  durationMs: number;
  warnings: string[];
  requestId?: string;
}

interface OcrProviderStub {
  name: string;
  version: string;
  recognizeBatch(pages: Array<{ pageNumber: number; imageBuffer: Buffer; mimeType: string; language: string }>): Promise<{ pages: OcrPageOutput[]; totalCostUsd: number; providerVersion: string }>;
}


function readPositiveIntegerEnv(name: string, fallback: number): number {
  const rawValue = process.env[name];
  if (!rawValue) {
    return fallback;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  return Number.isInteger(parsedValue) && parsedValue > 0
    ? parsedValue
    : fallback;
}

async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
): Promise<T> {
  let timeoutId: NodeJS.Timeout | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(message));
        }, timeoutMs);

        timeoutId.unref?.();
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}

function getProviderInstance(providerName: string): OcrProviderStub {
  const normalizedProviderName = providerName.trim().toLowerCase();

  switch (normalizedProviderName) {
    case "tesseract":
      return createTesseractStub();

    case "paddle":
    case "ocr":
      return createOcrServiceStub();

    case "fake":
      if (process.env.NODE_ENV === "test") {
        return createFakeStub();
      }

      throw new PermanentJobError(
        "Fake OCR provider is not allowed outside tests",
      );

    default:
      throw new PermanentJobError(
        `Unsupported OCR provider: ${providerName}`,
      );
  }
}

function createFakeStub(): OcrProviderStub {
  return {
    name: "fake-ocr",
    version: "1.0.0",
    async recognizeBatch(pages) {
      return {
        pages: pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: `[FAKE OCR] Simulated text for page ${p.pageNumber}.`,
          confidence: 0.95,
          words: [{ text: `Page ${p.pageNumber}`, confidence: 0.95 }],
          language: p.language,
          provider: "fake-ocr",
          providerModel: "fake-ocr-v1.0.0",
          durationMs: 10,
          warnings: [],
        })),
        totalCostUsd: 0,
        providerVersion: "1.0.0",
      };
    },
  };
}

function createTesseractStub(): OcrProviderStub {
  return {
    name: "tesseract",
    version: "5.x",

    async recognizeBatch(pages) {
      const tesseractModule = await import("tesseract.js");

      type RecognizeFunction =
        typeof tesseractModule.default.recognize;

      const recognize =
        tesseractModule.default?.recognize ??
        (
          tesseractModule as unknown as {
            recognize?: RecognizeFunction;
          }
        ).recognize;

      if (typeof recognize !== "function") {
        throw new PermanentJobError(
          "Tesseract.js recognize API is unavailable",
        );
      }

      const languageMap: Record<string, string> = {
        ar: "ara",
        en: "eng",
        "ar+en": "ara+eng",
      };

      const results: OcrPageOutput[] = [];
      const timeoutMs = readPositiveIntegerEnv(
        "OCR_TIMEOUT",
        30_000,
      );

      for (const page of pages) {
        const startedAt = Date.now();
        const inputBuffer = Buffer.from(page.imageBuffer);
        const selectedLanguage =
          languageMap[page.language] || "eng";

        try {
          const result = await withTimeout(
            recognize(
              inputBuffer,
              selectedLanguage,
              {
                logger: () => {},
              },
            ),
            timeoutMs,
            `Tesseract timed out after ${timeoutMs}ms`,
          );

          type TesseractWord = {
            text: string;
            confidence: number;
            bbox?: {
              x0: number;
              y0: number;
              x1: number;
              y1: number;
            };
          };

          const rawWords = (
            result.data as unknown as {
              words?: TesseractWord[];
            }
          ).words;

          const words = Array.isArray(rawWords)
            ? rawWords
            : [];

          const confidencePercent =
            typeof result.data.confidence === "number"
              ? result.data.confidence
              : 0;

          results.push({
            pageNumber: page.pageNumber,
            text: result.data.text || "",
            confidence: confidencePercent / 100,
            words: words.map((word) => ({
              text: word.text,
              confidence: word.confidence / 100,
              boundingBox: word.bbox
                ? {
                    x: word.bbox.x0,
                    y: word.bbox.y0,
                    width: word.bbox.x1 - word.bbox.x0,
                    height: word.bbox.y1 - word.bbox.y0,
                  }
                : undefined,
            })),
            language: page.language,
            provider: "tesseract",
            providerModel: "tesseract-v5.x",
            durationMs: Date.now() - startedAt,
            warnings:
              confidencePercent < 50
                ? [`Low confidence: ${confidencePercent}%`]
                : [],
          });
        } catch (err: unknown) {
          const error =
            err instanceof Error
              ? err
              : new Error(String(err));

          logger.error(
            {
              stage: "tesseract-recognize-call",
              pageNumber: page.pageNumber,
              provider: "tesseract",
              inputByteLength: inputBuffer.byteLength,
              errorName: error.name,
              errorMessage: error.message,
            },
            "OCR page stage failed",
          );

          results.push({
            pageNumber: page.pageNumber,
            text: "",
            confidence: 0,
            words: [],
            language: page.language,
            provider: "tesseract",
            providerModel: "tesseract-v5.x",
            durationMs: Date.now() - startedAt,
            warnings: [`OCR failed: ${error.message}`],
          });
        }
      }

      return {
        pages: results,
        totalCostUsd: 0,
        providerVersion: "5.x",
      };
    },
  };
}

function createOcrServiceStub(): OcrProviderStub {
  const serviceUrl =
    process.env.OCR_SERVICE_URL ||
    process.env.PADDLE_OCR_SERVICE_URL ||
    "http://localhost:8501";

  return {
    name: "ocr",
    version: "1.0",

    async recognizeBatch(pages) {
      const formData = new FormData();

      for (const page of pages) {
        const extension = page.mimeType.includes("png")
          ? "png"
          : "jpg";

        const blob = new Blob(
          [new Uint8Array(page.imageBuffer)],
          { type: page.mimeType },
        );

        formData.append(
          "files",
          blob,
          `page_${page.pageNumber}.${extension}`,
        );

        formData.append(
          "languages",
          page.language === "ar+en"
            ? "ar"
            : page.language,
        );
      }

      const timeoutMs = readPositiveIntegerEnv(
        "OCR_TIMEOUT",
        30_000,
      );

      const controller = new AbortController();
      const timeoutId = setTimeout(
        () => controller.abort(),
        timeoutMs,
      );

      timeoutId.unref?.();

      try {
        const response = await fetch(`${serviceUrl}/ocr`, {
          method: "POST",
          body: formData,
          signal: controller.signal,
        });

        if (!response.ok) {
          throw new Error(
            `OCR service returned ${response.status}`,
          );
        }

        const data = (await response.json()) as {
          requestId?: string;
          pages: OcrPageOutput[];
        };

        return {
          pages: data.pages,
          totalCostUsd: 0,
          providerVersion: "1.0",
        };
      } catch (err: unknown) {
        const error =
          err instanceof Error
            ? err
            : new Error(String(err));

        return {
          pages: pages.map((page) => ({
            pageNumber: page.pageNumber,
            text: "",
            confidence: 0,
            words: [],
            language: page.language,
            provider: "ocr",
            providerModel: "ocr-v1.0",
            durationMs: 0,
            warnings: [
              `OCR service error: ${error.message}`,
            ],
          })),
          totalCostUsd: 0,
          providerVersion: "1.0",
        };
      } finally {
        clearTimeout(timeoutId);
      }
    },
  };
}

function copyBufferForPdfJs(buffer: Buffer): Uint8Array {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy;
}

async function renderPdfPageToImage(
  pdfBuffer: Buffer,
  pageNumber: number,
  scale = 2,
): Promise<Buffer> {
  let stage = "pdf-module-import";
  const pdfjsLib = await getPdfJsModule();

  stage = "pdf-document-open";
  const loadingTask = pdfjsLib.getDocument({
    data: copyBufferForPdfJs(pdfBuffer),
  });

  let pdfDoc:
    | Awaited<typeof loadingTask.promise>
    | undefined;

  try {
    pdfDoc = await loadingTask.promise;

    if (
      !Number.isInteger(pageNumber) ||
      pageNumber < 1 ||
      pageNumber > pdfDoc.numPages
    ) {
      throw new PermanentJobError(
        `Requested page ${pageNumber} does not exist in the document ` +
          `(total pages: ${pdfDoc.numPages}).`,
      );
    }

    stage = "pdf-page-retrieval";
    const page = await pdfDoc.getPage(pageNumber);

    try {
      stage = "viewport-creation";
      const viewport = page.getViewport({ scale });
      stage = "canvas-module-import";
      const canvasModule = await import(
        "@napi-rs/canvas"
      );

      stage = "canvas-creation";
      const canvas = canvasModule.createCanvas(
        Math.ceil(viewport.width),
        Math.ceil(viewport.height),
      );

      stage = "canvas-context-creation";
      const canvasContext =
        canvas.getContext("2d");

      stage = "pdf-page-render";
      await page.render({
        canvas:
          canvas as unknown as HTMLCanvasElement,
        canvasContext:
          canvasContext as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;

      stage = "png-encoding";
      const pngData = canvas.toBuffer("image/png");

      if (!pngData || pngData.byteLength === 0) {
        throw new Error(
          `PDF page ${pageNumber} rendered to an empty PNG buffer`,
        );
      }

      stage = "png-buffer-creation";
      const imageBuffer = Buffer.from(pngData);

      return imageBuffer;
    } finally {
      page.cleanup();
    }
  } catch (err: unknown) {
    const error = err instanceof Error ? err : new Error(String(err));
    logger.error(
      {
        stage,
        pageNumber,
        provider: "pdfjs",
        errorName: error.name,
        errorMessage: error.message,
      },
      "OCR page stage failed",
    );
    throw error;
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

async function renderImagePageToBuffer(
  fileBuffer: Buffer,
  _mimeType: string,
): Promise<Buffer> {
  return Buffer.from(fileBuffer);
}

export function createDocumentOcrJobHandler(): JobHandlerDefinition<DocumentOcrPayload> {
  return {
    jobType: "document.ocr",
    description:
      "Performs OCR processing on document pages and records page-level results.",
    payloadSchema: PayloadSchema,
    maxAttempts: 3,

    handle: async (
      payload,
      ctx,
    ): Promise<JobHandlerResult | void> => {
      const db = getMongoClient()?.db();

      if (!db) {
        throw new RetryableJobError(
          "Database connection unavailable",
        );
      }

      const documentId = new ObjectId(
        payload.documentId,
      );

      const tenantId = new ObjectId(
        payload.tenantId,
      );

      const version = await db
        .collection("documentversions")
        .findOne({
          documentId,
          version: payload.documentVersion,
          tenantId,
        });

      if (!version) {
        ctx.progress(
          "Document version not found; skipping OCR job execution.",
        );

        return {
          summary: {
            discarded: true,
            reason: "version_not_found",
          },
        };
      }

      const document = await db
        .collection("documents")
        .findOne({
          _id: documentId,
          tenantId,
        });

      if (!document) {
        ctx.progress(
          "Document record not found; skipping OCR job execution.",
        );

        return {
          summary: {
            discarded: true,
            reason: "document_not_found",
          },
        };
      }

      const storageKey = version.storageKey as
        | string
        | undefined;

      if (!storageKey) {
        throw new PermanentJobError(
          "Document version has no storage key; cannot read file for OCR.",
        );
      }

      let fileBuffer: Buffer;

      try {
        fileBuffer = await storageProvider.getFileBuffer(storageKey);
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        const nodeErr = err as NodeJS.ErrnoException;
        const isNotFound = nodeErr?.code === "ENOENT" || error.message.includes("ENOENT") || error.message.includes("not found");
        if (isNotFound) {
          throw new PermanentJobError(`Source file not found in storage for key: ${storageKey}`);
        }
        throw new RetryableJobError(`Failed to read file from storage: ${error.message}`);
      }

      const fileMimeType =
        (version.mimeType as string) ||
        "application/pdf";

      const maxPages = readPositiveIntegerEnv(
        "OCR_MAX_PAGES",
        500,
      );

      const totalPages = await detectPageCount(
        fileBuffer,
        fileMimeType,
      );

      const selectedPages = payload.pageNumbers
        ? [...new Set(payload.pageNumbers)].sort(
            (left, right) => left - right,
          )
        : Array.from(
            { length: totalPages },
            (_, index) => index + 1,
          );

      if (selectedPages.length > maxPages) {
        throw new PermanentJobError(
          `Document contains ${totalPages} pages but ` +
            `${selectedPages.length} page(s) were selected, ` +
            `exceeding the configured OCR limit of ${maxPages}. ` +
            "Select a smaller page range or ask an administrator " +
            "to increase OCR_MAX_PAGES.",
        );
      }

      for (const pageNumber of selectedPages) {
        if (pageNumber > totalPages) {
          throw new PermanentJobError(
            `Requested page ${pageNumber} does not exist ` +
              `in the document (total pages: ${totalPages}).`,
          );
        }
      }

      const configuredProvider =
        payload.ocrProvider ||
        process.env.OCR_PROVIDER;

      if (!configuredProvider?.trim()) {
        throw new PermanentJobError(
          "OCR provider is not configured",
        );
      }

      const provider = getProviderInstance(
        configuredProvider,
      );

      const maxRetries = readPositiveIntegerEnv(
        "OCR_MAX_RETRIES",
        3,
      );

      const retryDelayMs = readPositiveIntegerEnv(
        "OCR_RETRY_DELAY_MS",
        1_000,
      );

      ctx.progress(
        `Starting OCR processing with ${provider.name} ` +
          `for ${selectedPages.length} page(s)...`,
      );

      await reportProgressToProcessingRun({
        tenantId: payload.tenantId,
        documentId: payload.documentId,
        documentVersion: payload.documentVersion,
        stageName: "ocr",
        status: "running",
        progress: 10,
      });

      const startedAt = Date.now();
      let totalPagesProcessed = 0;
      let totalPagesFailed = 0;
      let firstPageFailure: Error | null = null;

      const pageResults: Array<{
        pageNumber: number;
        status: string;
        confidence: number;
      }> = [];

      for (const pageNumber of selectedPages) {
        const pageStartedAt = Date.now();

        try {
          await db
            .collection("ocrpageresults")
            .updateOne(
              {
                tenantId,
                documentId,
                documentVersion:
                  payload.documentVersion,
                pageNumber,
              },
              {
                $set: {
                  status: "processing",
                  failureReason: null,
                  text: "",
                  confidence: 0,
                  words: [],
                  warnings: [],
                  provider: provider.name,
                  providerModel: provider.version,
                  updatedAt: new Date(),
                },
                $setOnInsert: {
                  documentId,
                  tenantId,
                  documentVersion:
                    payload.documentVersion,
                  pageNumber,
                  createdAt: new Date(),
                },
              },
              { upsert: true },
            );

          const imageBuffer =
            await renderPageToImage(
              fileBuffer,
              fileMimeType,
              pageNumber,
            );

          let lastError: Error | null = null;

          let ocrResult: {
            pages: OcrPageOutput[];
            totalCostUsd: number;
            providerVersion: string;
          } | null = null;

          for (
            let attempt = 1;
            attempt <= maxRetries;
            attempt++
          ) {
            try {
              ocrResult =
                await provider.recognizeBatch([
                  {
                    pageNumber,
                    imageBuffer,
                    mimeType: "image/png",
                    language: payload.language,
                  },
                ]);

              lastError = null;
              break;
            } catch (retryErr: unknown) {
              lastError =
                retryErr instanceof Error
                  ? retryErr
                  : new Error(String(retryErr));

              ctx.progress(
                `OCR attempt ${attempt}/${maxRetries} ` +
                  `failed for page ${pageNumber}: ` +
                  lastError.message,
              );

              if (attempt < maxRetries) {
                await new Promise<void>((resolve) => {
                  setTimeout(
                    resolve,
                    retryDelayMs * attempt,
                  );
                });
              }
            }
          }

          if (!ocrResult) {
            throw (
              lastError ||
              new Error(
                "OCR failed after all retries",
              )
            );
          }

          const pageOcr = ocrResult.pages[0];

          if (!pageOcr) {
            throw new PermanentJobError(
              `OCR provider returned no result for page ${pageNumber}`,
            );
          }

          const warningMessage =
            pageOcr.warnings.join(", ");

          const providerReportedFailure =
            pageOcr.confidence === 0 &&
            pageOcr.text.trim().length === 0 &&
            pageOcr.warnings.length > 0;

          if (providerReportedFailure) {
            const normalizedWarning =
              warningMessage.toLowerCase();

            const isTimeout =
              normalizedWarning.includes(
                "timed out",
              ) ||
              normalizedWarning.includes(
                "timeout",
              ) ||
              normalizedWarning.includes(
                "aborted",
              );

            if (isTimeout) {
              throw new RetryableJobError(
                `OCR failed for page ${pageNumber}: ` +
                  warningMessage,
              );
            }

            throw new PermanentJobError(
              `OCR failed for page ${pageNumber}: ` +
                warningMessage,
            );
          }

          await db
            .collection("ocrpageresults")
            .updateOne(
              {
                tenantId,
                documentId,
                documentVersion:
                  payload.documentVersion,
                pageNumber,
              },
              {
                $set: {
                  text: pageOcr.text,
                  confidence: pageOcr.confidence,
                  words: pageOcr.words,
                  language: payload.language,
                  provider: pageOcr.provider,
                  providerModel:
                    pageOcr.providerModel,
                  providerVersion:
                    ocrResult.providerVersion,
                  durationMs:
                    pageOcr.durationMs,
                  costUsd: 0,
                  warnings: pageOcr.warnings,
                  status: "completed",
                  failureReason: null,
                  updatedAt: new Date(),
                },
                $setOnInsert: {
                  documentId,
                  tenantId,
                  documentVersion:
                    payload.documentVersion,
                  pageNumber,
                  createdAt: new Date(),
                },
              },
              { upsert: true },
            );

          await db
            .collection("ocrusagerecords")
            .insertOne({
              tenantId,
              documentId,
              documentVersion:
                payload.documentVersion,
              pageNumber,
              provider: pageOcr.provider,
              providerModel:
                pageOcr.providerModel,
              language: payload.language,
              pagesProcessed: 1,
              durationMs: pageOcr.durationMs,
              costUsd: 0,
              createdAt: new Date(),
            });

          totalPagesProcessed++;

          pageResults.push({
            pageNumber,
            status: "completed",
            confidence: pageOcr.confidence,
          });

          ctx.progress(
            `OCR completed for page ${pageNumber} ` +
              `(confidence: ${Math.round(
                pageOcr.confidence * 100,
              )}%, duration: ${
                Date.now() - pageStartedAt
              }ms)`,
          );
        } catch (err: unknown) {
          const error =
            err instanceof Error
              ? err
              : new Error(String(err));

          firstPageFailure ??= error;
          totalPagesFailed++;

          await db
            .collection("ocrpageresults")
            .updateOne(
              {
                tenantId,
                documentId,
                documentVersion:
                  payload.documentVersion,
                pageNumber,
              },
              {
                $set: {
                  status: "failed",
                  failureReason: error.message,
                  text: "",
                  confidence: 0,
                  words: [],
                  warnings: [error.message],
                  provider: provider.name,
                  providerModel: provider.version,
                  durationMs:
                    Date.now() - pageStartedAt,
                  updatedAt: new Date(),
                },
                $setOnInsert: {
                  documentId,
                  tenantId,
                  documentVersion:
                    payload.documentVersion,
                  pageNumber,
                  createdAt: new Date(),
                },
              },
              { upsert: true },
            );

          pageResults.push({
            pageNumber,
            status: "failed",
            confidence: 0,
          });

          ctx.progress(
            `OCR failed for page ${pageNumber}: ` +
              error.message,
          );
        }
      }

      const totalDurationMs =
        Date.now() - startedAt;

      ctx.progress(
        `OCR processing completed. ` +
          `${totalPagesProcessed} succeeded, ` +
          `${totalPagesFailed} failed. ` +
          `Duration: ${totalDurationMs}ms`,
      );

      const ocrProgress =
        totalPagesFailed === 0
          ? 100
          : Math.round(
              (totalPagesProcessed /
                selectedPages.length) *
                100,
            );

      await reportProgressToProcessingRun({
        tenantId: payload.tenantId,
        documentId: payload.documentId,
        documentVersion: payload.documentVersion,
        stageName: "ocr",
        status:
          totalPagesFailed === 0
            ? "completed"
            : "failed",
        progress: ocrProgress,
        errorCode:
          totalPagesFailed > 0
            ? "ocr_failed"
            : undefined,
        errorMessage:
          totalPagesFailed > 0
            ? `${totalPagesFailed} pages failed OCR`
            : undefined,
      });

      if (
        totalPagesProcessed === 0 &&
        totalPagesFailed > 0
      ) {
        if (
          firstPageFailure instanceof
          RetryableJobError
        ) {
          throw firstPageFailure;
        }

        if (
          firstPageFailure instanceof
          PermanentJobError
        ) {
          throw firstPageFailure;
        }

        throw new PermanentJobError(
          `OCR failed for all ${totalPagesFailed} ` +
            `selected page(s). First failure: ` +
            `${
              firstPageFailure?.message ||
              "unknown OCR error"
            }`,
        );
      }

      if (totalPagesProcessed > 0) {
        try {
          await runQualityAssessment(
            db,
            tenantId,
            documentId,
            payload.documentVersion,
            provider.name,
          );

          ctx.progress(
            "Quality assessment completed after OCR.",
          );
        } catch (qaErr: unknown) {
          const qaError =
            qaErr instanceof Error
              ? qaErr
              : new Error(String(qaErr));

          ctx.progress(
            `Quality assessment failed after OCR: ` +
              qaError.message,
          );
        }
      }

      return {
        summary: {
          success: totalPagesFailed === 0,
          totalPagesProcessed,
          totalPagesFailed,
          durationMs: totalDurationMs,
          pageResults,
        },
      };
    },
  };
}

async function detectPageCount(
  fileBuffer: Buffer,
  mimeType: string,
): Promise<number> {
  if (mimeType !== "application/pdf") {
    return 1;
  }

  const pdfjsLib = await getPdfJsModule();

  const loadingTask = pdfjsLib.getDocument({
    data: copyBufferForPdfJs(fileBuffer),
  });

  let pdfDoc:
    | Awaited<typeof loadingTask.promise>
    | undefined;

  try {
    pdfDoc = await loadingTask.promise;

    if (
      !Number.isInteger(pdfDoc.numPages) ||
      pdfDoc.numPages < 1
    ) {
      throw new PermanentJobError(
        "PDF document contains no readable pages",
      );
    }

    return pdfDoc.numPages;
  } catch (err: unknown) {
    const error =
      err instanceof Error
        ? err
        : new Error(String(err));

    if (error instanceof PermanentJobError) {
      throw error;
    }

    throw new PermanentJobError(
      `Unable to read PDF page count: ${error.message}`,
    );
  } finally {
    await loadingTask.destroy().catch(() => {});
  }
}

async function renderPageToImage(fileBuffer: Buffer, mimeType: string, pageNumber: number): Promise<Buffer> {
  if (mimeType === "application/pdf") {
    return renderPdfPageToImage(fileBuffer, pageNumber);
  }
  if (mimeType.startsWith("image/")) {
    return renderImagePageToBuffer(fileBuffer, mimeType);
  }
  throw new Error(`Cannot render pages for MIME type '${mimeType}' to images for OCR`);
}

async function runQualityAssessment(
  db: ReturnType<NonNullable<ReturnType<typeof getMongoClient>>["db"]>,
  tenantId: ObjectId,
  documentId: ObjectId,
  documentVersion: number,
  providerName: string,
): Promise<void> {
  const ocrPages = await db.collection("ocrpageresults")
    .find({ tenantId, documentId, documentVersion, status: "completed" })
    .sort({ pageNumber: 1 })
    .toArray();

  if (ocrPages.length === 0) return;

  const lowConfThreshold = parseFloat(process.env.OCR_CONFIDENCE_THRESHOLD || "0.7");
  const criticalThreshold = parseFloat(process.env.OCR_CRITICAL_CONFIDENCE_THRESHOLD || "0.4");

  const issues: Array<{ type: string; severity: string; message: string; pageNumber: number }> = [];
  let totalConfidence = 0;

  for (const page of ocrPages) {
    const text = (page.text as string) || "";
    const confidence = (page.confidence as number) || 0;
    const pageNum = page.pageNumber as number;

    totalConfidence += confidence;

    if (text.trim().length <= 5) {
      issues.push({ type: "blank_page", severity: "warning", message: `Page ${pageNum} appears blank.`, pageNumber: pageNum });
    }

    const garbledChars = text.match(/[^\w\s\u0600-\u06FF\u0020-\u007E.,;:!?'"()[\]{}\-+*/=<>@#$%^&|\\~`]/g);
    const garbledRatio = garbledChars ? garbledChars.length / text.length : 0;
    if (garbledRatio > 0.3) {
      issues.push({ type: "garbled_text", severity: "critical", message: `Page ${pageNum} has ${Math.round(garbledRatio * 100)}% garbled characters.`, pageNumber: pageNum });
    }

    if (confidence < criticalThreshold) {
      issues.push({ type: "low_confidence", severity: "critical", message: `Page ${pageNum} confidence ${Math.round(confidence * 100)}% is critically low.`, pageNumber: pageNum });
    } else if (confidence < lowConfThreshold) {
      issues.push({ type: "low_confidence", severity: "warning", message: `Page ${pageNum} confidence ${Math.round(confidence * 100)}% is below threshold.`, pageNumber: pageNum });
    }
  }

  const overallConfidence = ocrPages.length > 0 ? totalConfidence / ocrPages.length : 0;
  const hasCritical = issues.some((i) => i.severity === "critical");
  const hasWarnings = issues.some((i) => i.severity === "warning");

  let qualityStatus: string;
  let requiresReview: boolean;

  if (hasCritical || overallConfidence < criticalThreshold) {
    qualityStatus = "REVIEW_REQUIRED";
    requiresReview = true;
  } else if (hasWarnings || overallConfidence < lowConfThreshold) {
    qualityStatus = "READY_WITH_WARNINGS";
    requiresReview = false;
  } else if (issues.length === 0) {
    qualityStatus = "READY_FOR_INDEXING";
    requiresReview = false;
  } else {
    qualityStatus = "READY";
    requiresReview = false;
  }

  const pageConfidences: Record<string, number> = {};
  const pageStatuses: Record<string, string> = {};
  for (const p of ocrPages) {
    const num = String(p.pageNumber as number);
    const conf = (p.confidence as number) || 0;
    pageConfidences[num] = conf;
    if (conf < criticalThreshold) {
      pageStatuses[num] = "REVIEW_REQUIRED";
    } else if (conf < lowConfThreshold) {
      pageStatuses[num] = "READY_WITH_WARNINGS";
    } else {
      pageStatuses[num] = "READY_FOR_INDEXING";
    }
  }

  const totalDurationMs = ocrPages.reduce((sum: number, p: Record<string, unknown>) => sum + ((p.durationMs as number) || 0), 0);

  await db.collection("documentqualities").updateOne(
    { tenantId, documentId, documentVersion },
    {
      $set: {
        overallConfidence,
        qualityStatus,
        issues,
        pageConfidences,
        pageStatuses,
        summary: `${qualityStatus} (${Math.round(overallConfidence * 100)}% confidence). ${ocrPages.length} pages analyzed. ${issues.length} issue(s) found.`,
        requiresReview,
        ocrProvider: providerName,
        ocrModelVersion: "1.0.0",
        totalPagesProcessed: ocrPages.length,
        totalPagesOcr: ocrPages.length,
        totalCostUsd: 0,
        durationMs: totalDurationMs,
        updatedAt: new Date(),
      },
      $setOnInsert: {
        documentId,
        tenantId,
        documentVersion,
        createdAt: new Date(),
      },
    },
    { upsert: true },
  );
}
