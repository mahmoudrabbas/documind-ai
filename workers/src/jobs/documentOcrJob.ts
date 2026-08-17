import { z } from "zod";
import { ObjectId } from "mongodb";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import { cpus } from "node:os";
import { JobHandlerDefinition, JobHandlerResult } from "../contracts/jobDispatcher.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import type { OutboxTriggerPort } from "../contracts/notificationOutboxPort.js";
import { RawOutboxWriter } from "../providers/rawOutboxWriter.js";
import { getMongoClient } from "../db/mongo.js";
import { logger } from "../logger.js";
import { reportProgressToProcessingRun } from "./progressReporter.js";
import { withProcessingFailedOutbox } from "./processingFailedNotifier.js";
import { storageProvider } from "../providers/storage/index.js";
import type {
  Canvas,
  ContextAttributes,
  SKRSContext2D,
} from "@napi-rs/canvas";

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
  /** Present when OCR was triggered by the ingest pipeline (auto-OCR). */
  generationId: z.string().optional(),

  /**
   * Durable paid OCR quota reservation created by the API for manual OCR.
   * Auto-OCR never carries these fields.
   */
  quotaReservationId: z.string().min(1).optional(),
  quotaReservedPages: z.number().int().positive().optional(),

  department: z.string().nullable().optional(),
  classification: z.string().nullable().optional(),
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
  /** True when OCR ran successfully but the page contained no recognisable
   * text (a legitimately blank page). Set by providers so the job can record
   * it as a completed-empty page instead of a hard failure. */
  isBlank?: boolean;
  requestId?: string;
}

interface OcrProviderStub {
  name: string;
  version: string;
  recognizeBatch(pages: Array<{ pageNumber: number; imageBuffer: Buffer; mimeType: string; language: string }>): Promise<{ pages: OcrPageOutput[]; totalCostUsd: number; providerVersion: string }>;
  /** Releases any long-lived resources (e.g. persistent Tesseract workers). */
  shutdown?(): Promise<void>;
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

function defaultOcrConcurrency(): number {
  const cpuCount = (cpus() || []).length;
  return Math.max(1, Math.min(16, cpuCount - 1));
}

/**
 * True when `error` looks like a transient infrastructure failure (Mongo
 * DNS/connection blips, storage/network timeouts) rather than a genuine OCR
 * problem. Such failures can recover on retry, so they should be retried
 * rather than recorded as permanent page failures.
 */
function isTransientInfraError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }

  const name = (error as NodeJS.ErrnoException).name ?? "";
  const code = (error as NodeJS.ErrnoException).code ?? "";
  const message = error.message.toLowerCase();

  const transientCodes = new Set([
    "EAI_AGAIN",
    "ENOTFOUND",
    "ECONNREFUSED",
    "ECONNRESET",
    "ETIMEDOUT",
    "ESOCKETTIMEDOUT",
    "EHOSTUNREACH",
    "ENETUNREACH",
    "EPIPE",
    "ETIMEDOUT",
    "MONGODB_TIMEOUT",
  ]);

  return (
    transientCodes.has(code) ||
    transientCodes.has(name) ||
    message.includes("getaddrinfo") ||
    message.includes("socket hang up") ||
    message.includes("connection reset") ||
    message.includes("connection refused") ||
    message.includes("server selection timeout") ||
    message.includes("network timeout") ||
    message.includes("failed to connect")
  );
}

/**
 * Retries `operation` up to `attempts` times with exponential backoff, but
 * ONLY when the failure is a transient infrastructure error. Other errors
 * (e.g. a real OCR failure) propagate immediately.
 */
async function withTransientRetry<T>(
  operation: () => Promise<T>,
  options: { attempts?: number; baseDelayMs?: number } = {},
): Promise<T> {
  const attempts = Math.max(1, options.attempts ?? 3);
  const baseDelayMs = Math.max(0, options.baseDelayMs ?? 250);

  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (err: unknown) {
      lastError = err;

      if (
        attempt >= attempts ||
        !isTransientInfraError(err)
      ) {
        throw err;
      }

      const delayMs = baseDelayMs * attempt;
      await new Promise<void>((resolve) => {
        setTimeout(resolve, delayMs);
      });
    }
  }

  throw lastError;
}

/**
 * Runs `task` over `items` with at most `concurrency` tasks in flight.
 * Results are returned in input order. Used to parallelise per-page OCR
 * work inside a single job without unbounded memory growth.
 */
async function runWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  task: (item: T, index: number) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  const limit = Math.max(1, Math.floor(concurrency));

  let nextIndex = 0;

  const workers = Array.from(
    { length: Math.min(limit, items.length) },
    async () => {
      while (true) {
        const index = nextIndex;
        if (index >= items.length) return;
        nextIndex += 1;
        results[index] = await task(items[index], index);
      }
    },
  );

  await Promise.all(workers);
  return results;
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

function getProviderInstance(
  providerName: string,
  workerCount = 1,
): OcrProviderStub {
  const normalizedProviderName = providerName.trim().toLowerCase();

  switch (normalizedProviderName) {
    case "tesseract":
      return createTesseractStub(workerCount);

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
  const blankMode = process.env.FAKE_OCR_BLANK === "true";

  return {
    name: "fake-ocr",
    version: "1.0.0",
    async recognizeBatch(pages) {
      return {
        pages: pages.map((p) => ({
          pageNumber: p.pageNumber,
          text: blankMode
            ? ""
            : `[FAKE OCR] Simulated text for page ${p.pageNumber}.`,
          confidence: blankMode ? 0 : 0.95,
          words: blankMode
            ? []
            : [{ text: `Page ${p.pageNumber}`, confidence: 0.95 }],
          language: p.language,
          provider: "fake-ocr",
          providerModel: "fake-ocr-v1.0.0",
          durationMs: 10,
          warnings: blankMode
            ? ["Low confidence: 0%"]
            : [],
          isBlank: blankMode,
        })),
        totalCostUsd: 0,
        providerVersion: "1.0.0",
      };
    },
  };
}

type TesseractWorkerLike = {
  recognize(
    image: Buffer,
    options?: Record<string, unknown>,
  ): Promise<{
    data: {
      text?: string;
      confidence?: number;
      words?: Array<{
        text: string;
        confidence: number;
        bbox?: { x0: number; y0: number; x1: number; y1: number };
      }>;
    };
  }>;
  terminate(): Promise<void>;
};

interface TesseractWorkerSlot {
  worker: TesseractWorkerLike;
  dead: boolean;
}

const TESSERACT_LANGUAGE_MAP: Record<string, string> = {
  ar: "ara",
  en: "eng",
  "ar+en": "ara+eng",
};

async function createTesseractWorker(
  language: string,
): Promise<TesseractWorkerLike> {
  const tesseractModule = await import("tesseract.js");

  type CreateWorkerFunction = (
    ...args: unknown[]
  ) => Promise<TesseractWorkerLike>;

  const createWorker =
    (
      tesseractModule.default as unknown as {
        createWorker?: CreateWorkerFunction;
      }
    )?.createWorker ??
    (
      tesseractModule as unknown as {
        createWorker?: CreateWorkerFunction;
      }
    ).createWorker;

  if (typeof createWorker !== "function") {
    throw new PermanentJobError(
      "Tesseract.js createWorker API is unavailable",
    );
  }

  return createWorker(language, undefined, {
    logger: () => {},
  });
}

/**
 * A persistent pool of Tesseract workers. The previous implementation called
 * the `recognize()` convenience wrapper, which spawns a fresh worker, reloads
 * the language data and terminates the worker for EVERY page — a few seconds
 * of pure overhead per page that dominates a large scanned book. Reusing a
 * pool of workers once per OCR job removes that overhead entirely.
 */
class TesseractWorkerPool {
  private readonly language: string;
  private readonly slots: TesseractWorkerSlot[];
  private nextSlot = 0;

  private constructor(
    language: string,
    slots: TesseractWorkerSlot[],
  ) {
    this.language = language;
    this.slots = slots;
  }

  static async create(
    language: string,
    size: number,
  ): Promise<TesseractWorkerPool> {
    const slots = await Promise.all(
      Array.from(
        { length: Math.max(1, size) },
        async (): Promise<TesseractWorkerSlot> => {
          const worker = await createTesseractWorker(language);
          return { worker, dead: false };
        },
      ),
    );

    return new TesseractWorkerPool(language, slots);
  }

  private async acquireSlot(): Promise<TesseractWorkerSlot> {
    const index = this.nextSlot % this.slots.length;
    this.nextSlot += 1;

    let slot = this.slots[index];

    if (slot.dead) {
      try {
        const worker = await createTesseractWorker(this.language);
        const fresh: TesseractWorkerSlot = { worker, dead: false };
        this.slots[index] = fresh;
        slot = fresh;
      } catch {
        // Keep the dead slot; recognition fails and the page is recorded as failed.
      }
    }

    return slot;
  }

  async recognize(page: {
    pageNumber: number;
    imageBuffer: Buffer;
    language: string;
  }): Promise<OcrPageOutput> {
    const slot = await this.acquireSlot();
    const startedAt = Date.now();
    const inputBuffer = Buffer.from(page.imageBuffer);
    const timeoutMs = readPositiveIntegerEnv(
      "OCR_TIMEOUT",
      30_000,
    );

    try {
      const result = await withTimeout(
        slot.worker.recognize(inputBuffer),
        timeoutMs,
        `Tesseract timed out after ${timeoutMs}ms`,
      );

      const rawWords = (
        result.data as unknown as {
          words?: Array<{
            text: string;
            confidence: number;
            bbox?: { x0: number; y0: number; x1: number; y1: number };
          }>;
        }
      ).words;

      const words = Array.isArray(rawWords) ? rawWords : [];

      const text = result.data.text || "";
      const confidencePercent =
        typeof result.data.confidence === "number"
          ? result.data.confidence
          : 0;

      return {
        pageNumber: page.pageNumber,
        text,
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
        isBlank: text.trim().length === 0,
        warnings:
          confidencePercent < 50
            ? [`Low confidence: ${confidencePercent}%`]
            : [],
      };
    } catch (err: unknown) {
      const error =
        err instanceof Error
          ? err
          : new Error(String(err));

      // A worker that threw or timed out may be left in a bad state; force a
      // fresh worker for the next page instead of reusing it.
      slot.dead = true;

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

      return {
        pageNumber: page.pageNumber,
        text: "",
        confidence: 0,
        words: [],
        language: page.language,
        provider: "tesseract",
        providerModel: "tesseract-v5.x",
        durationMs: Date.now() - startedAt,
        warnings: [`OCR failed: ${error.message}`],
      };
    }
  }

  async terminate(): Promise<void> {
    await Promise.allSettled(
      this.slots.map((slot) => slot.worker.terminate()),
    );
  }
}

function createTesseractStub(workerCount: number): OcrProviderStub {
  const pools = new Map<string, Promise<TesseractWorkerPool>>();

  return {
    name: "tesseract",
    version: "5.x",

    async recognizeBatch(pages) {
      const language = pages[0]?.language ?? "ar+en";
      const selectedLanguage =
        TESSERACT_LANGUAGE_MAP[language] || "eng";

      let poolPromise = pools.get(selectedLanguage);
      if (!poolPromise) {
        poolPromise = TesseractWorkerPool.create(
          selectedLanguage,
          workerCount,
        );
        pools.set(selectedLanguage, poolPromise);
      }

      const pool = await poolPromise;

      const results = await Promise.all(
        pages.map((page) => pool.recognize(page)),
      );

      return {
        pages: results,
        totalCostUsd: 0,
        providerVersion: "5.x",
      };
    },

    async shutdown() {
      const poolsToClose = [...pools.values()];
      pools.clear();

      await Promise.allSettled(
        poolsToClose.map(async (poolPromise) => {
          try {
            const pool = await poolPromise;
            await pool.terminate();
          } catch {
            // best-effort cleanup; the process is free to exit regardless.
          }
        }),
      );
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
          pages: Array<
            Omit<OcrPageOutput, "isBlank"> & {
              isBlank?: boolean;
            }
          >;
        };

        return {
          pages: (data.pages ?? []).map((page) => ({
            ...page,
            isBlank:
              page.isBlank === true ||
              (page.text ?? "").trim().length === 0,
          })),
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

interface PdfJsCanvasAndContext {
  canvas: Canvas | null;
  context: SKRSContext2D | null;
}

type PdfJsNodeCanvasFactory = new () => {
  create(width: number, height: number): {
    canvas: Canvas;
    context: SKRSContext2D;
  };
  reset(canvasAndContext: PdfJsCanvasAndContext, width: number, height: number): void;
  destroy(canvasAndContext: PdfJsCanvasAndContext): void;
};

/**
 * Creates a PDF.js `CanvasFactory` that produces canvases from the same
 * `@napi-rs/canvas` module the job uses for the main render surface.
 *
 * PDF.js resolves its default `NodeCanvasFactory` from its own `node_modules`,
 * which can be a different `@napi-rs/canvas` binary than the one imported by
 * this job. Drawing a canvas created by one Skia build into a context from
 * another build segfaults the process (SIGSEGV), so both must share the module.
 */
function createNodeCanvasFactory(
  canvasModule: typeof import("@napi-rs/canvas"),
): PdfJsNodeCanvasFactory {
  return class NodeCanvasFactory {
    create(width: number, height: number): {
      canvas: Canvas;
      context: SKRSContext2D;
    } {
      const canvas = canvasModule.createCanvas(
        Math.ceil(width),
        Math.ceil(height),
      );
      return {
        canvas,
        context: canvas.getContext("2d", {
          willReadFrequently: true,
        } as ContextAttributes),
      };
    }

    reset(
      canvasAndContext: PdfJsCanvasAndContext,
      width: number,
      height: number,
    ): void {
      if (!canvasAndContext.canvas) {
        throw new Error("Canvas is not specified");
      }
      canvasAndContext.canvas.width = Math.ceil(width);
      canvasAndContext.canvas.height = Math.ceil(height);
    }

    destroy(canvasAndContext: PdfJsCanvasAndContext): void {
      if (!canvasAndContext.canvas) {
        return;
      }
      canvasAndContext.canvas.width = 0;
      canvasAndContext.canvas.height = 0;
      canvasAndContext.canvas = null;
      canvasAndContext.context = null;
    }
  };
}

type PdfJsLoadingTask = ReturnType<
  typeof import("pdfjs-dist/legacy/build/pdf.mjs")["getDocument"]
>;

type PdfDocument = Awaited<PdfJsLoadingTask["promise"]>;

/**
 * Renders a single page of an already-open PDF.js document to a PNG buffer.
 * The caller owns the document lifetime; pages are cleaned up after rendering
 * so a large book does not accumulate cached page content in memory.
 */
async function renderPageOnDocument(
  pdfDoc: PdfDocument,
  canvasModule: typeof import("@napi-rs/canvas"),
  pageNumber: number,
  scale = 2,
): Promise<Buffer> {
  let stage = "pdf-page-retrieval";

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

  const page = await pdfDoc.getPage(pageNumber);

  try {
    stage = "viewport-creation";
    const viewport = page.getViewport({ scale });

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
    page.cleanup();
  }
}

interface PdfRenderPoolDoc {
  loadingTask: PdfJsLoadingTask;
  pdfDoc: PdfDocument;
}

/**
 * A pool of open PDF.js documents. The previous implementation called
 * `getDocument()` for every page, re-parsing the PDF structure and spinning a
 * fresh pdf.js worker each time — wasteful for a 2000-page book. A pool keeps
 * N documents (and their workers) open for the whole job and renders pages
 * across them round-robin, so rendering parallelises across pdf.js workers.
 *
 * Note: each document needs its own buffer copy because pdf.js detaches the
 * buffer it is given; `count` therefore trades memory for render throughput.
 */
class PdfRenderPool {
  private readonly docs: PdfRenderPoolDoc[];
  private readonly canvasModule: typeof import("@napi-rs/canvas");
  private nextDoc = 0;

  private constructor(
    docs: PdfRenderPoolDoc[],
    canvasModule: typeof import("@napi-rs/canvas"),
  ) {
    this.docs = docs;
    this.canvasModule = canvasModule;
  }

  static async open(
    pdfBuffer: Buffer,
    count: number,
  ): Promise<PdfRenderPool> {
    const pdfjs = await getPdfJsModule();
    const canvasModule = await import("@napi-rs/canvas");

    const docs = await Promise.all(
      Array.from(
        { length: Math.max(1, count) },
        async (): Promise<PdfRenderPoolDoc> => {
          const loadingTask = pdfjs.getDocument({
            data: copyBufferForPdfJs(pdfBuffer),
            CanvasFactory: createNodeCanvasFactory(canvasModule),
          });
          const pdfDoc = await loadingTask.promise;
          return { loadingTask, pdfDoc };
        },
      ),
    );

    return new PdfRenderPool(docs, canvasModule);
  }

  async renderPage(
    pageNumber: number,
    scale = 2,
  ): Promise<Buffer> {
    const index = this.nextDoc % this.docs.length;
    this.nextDoc += 1;
    return renderPageOnDocument(
      this.docs[index].pdfDoc,
      this.canvasModule,
      pageNumber,
      scale,
    );
  }

  async destroy(): Promise<void> {
    await Promise.allSettled(
      this.docs.map((doc) =>
        doc.loadingTask.destroy().catch(() => {}),
      ),
    );
    this.docs.length = 0;
  }
}

async function renderImagePageToBuffer(
  fileBuffer: Buffer,
  _mimeType: string,
): Promise<Buffer> {
  return Buffer.from(fileBuffer);
}


async function settleManualOcrQuotaReservation(
  tenantId: ObjectId,
  reservationId: string,
  actualAmount: number,
): Promise<void> {
  if (
    !Number.isInteger(actualAmount) ||
    actualAmount < 0
  ) {
    throw new Error("Invalid actual OCR quota amount");
  }

  const client = getMongoClient();

  if (!client) {
    throw new Error(
      "MongoDB unavailable while settling OCR quota reservation",
    );
  }

  const session = client.startSession();

  try {
    await session.withTransaction(async () => {
      const db = client.db();

      const reservations =
        db.collection("ocrquotareservations");

      const counters =
        db.collection("quotacounters");

      const reservation = await reservations.findOne(
        {
          tenantId,
          reservationId,
        },
        { session },
      );

      if (!reservation) {
        throw new Error(
          `OCR quota reservation not found: ${reservationId}`,
        );
      }

      if (reservation.status === "committed") {
        return;
      }

      if (reservation.status === "released") {
        return;
      }

      if (reservation.status !== "active") {
        throw new Error(
          `Unsupported OCR quota reservation status: ${String(
            reservation.status,
          )}`,
        );
      }

      const reservedAmount =
        Number(reservation.reservedAmount);

      if (
        !Number.isInteger(reservedAmount) ||
        reservedAmount <= 0
      ) {
        throw new Error(
          "OCR quota reservation has invalid reservedAmount",
        );
      }

      if (actualAmount > reservedAmount) {
        throw new Error(
          "Actual OCR usage exceeds reserved OCR pages",
        );
      }

      const refund =
        reservedAmount - actualAmount;

      if (refund > 0) {
        await counters.updateOne(
          {
            tenantId,
            dimension: "ocrPagesPerMonth",
            periodStart: reservation.periodStart,
          },
          {
            $inc: {
              value: -refund,
            },
          },
          { session },
        );

        await counters.updateOne(
          {
            tenantId,
            dimension: "ocrPagesPerMonth",
            periodStart: reservation.periodStart,
            value: { $lt: 0 },
          },
          {
            $set: {
              value: 0,
            },
          },
          { session },
        );
      }

      await reservations.updateOne(
        {
          _id: reservation._id,
          status: "active",
        },
        {
          $set: {
            status:
              actualAmount === 0
                ? "released"
                : "committed",
            actualAmount,
            settledAt: new Date(),
            updatedAt: new Date(),
          },
        },
        { session },
      );
    });
  } finally {
    await session.endSession();
  }
}

async function releaseManualOcrQuotaReservation(
  tenantId: ObjectId,
  reservationId: string | undefined,
): Promise<void> {
  if (!reservationId) {
    return;
  }

  await settleManualOcrQuotaReservation(
    tenantId,
    reservationId,
    0,
  );
}

export function createDocumentOcrJobHandler(
  outbox: OutboxTriggerPort = new RawOutboxWriter(),
): JobHandlerDefinition<DocumentOcrPayload> {
  return {
    jobType: "document.ocr",
    description:
      "Performs OCR processing on document pages and records page-level results.",
    payloadSchema: PayloadSchema,
    maxAttempts: 3,

    handle: withProcessingFailedOutbox<DocumentOcrPayload>({
      outbox,
      stage: "ocr",

      onTerminalFailure: async (payload) => {
        if (
          payload.generationId ||
          !payload.quotaReservationId
        ) {
          return;
        }

        await releaseManualOcrQuotaReservation(
          new ObjectId(payload.tenantId),
          payload.quotaReservationId,
        );
      },

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
        if (
          !payload.generationId &&
          payload.quotaReservationId
        ) {
          await releaseManualOcrQuotaReservation(
            tenantId,
            payload.quotaReservationId,
          );
        }

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
        if (
          !payload.generationId &&
          payload.quotaReservationId
        ) {
          await releaseManualOcrQuotaReservation(
            tenantId,
            payload.quotaReservationId,
          );
        }

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

      // Runs triggered by the ingest pipeline (auto-OCR) carry a generationId.
      const isAutoOcr =
        typeof payload.generationId === "string" &&
        payload.generationId.trim().length > 0;

      const maxPages = readPositiveIntegerEnv(
        "OCR_MAX_PAGES",
        2000,
      );

      const totalPages = await detectPageCount(
        fileBuffer,
        fileMimeType,
      );

      let selectedPages = payload.pageNumbers
        ? [...new Set(payload.pageNumbers)].sort(
            (left, right) => left - right,
          )
        : Array.from(
            { length: totalPages },
            (_, index) => index + 1,
          );

      // Auto-OCR is bounded separately from the paid OCR_MAX_PAGES so a large
      // scanned book cannot monopolise the worker for an unbounded amount of
      // time. When the cap is reached only the first pages are processed.
      if (isAutoOcr) {
        const autoOcrMaxPages = readPositiveIntegerEnv(
          "AUTO_OCR_MAX_PAGES",
          2000,
        );
        if (selectedPages.length > autoOcrMaxPages) {
          ctx.progress(
            `Auto-OCR page cap of ${autoOcrMaxPages} reached; ` +
              `processing only the first ${autoOcrMaxPages} of ` +
              `${selectedPages.length} page(s).`,
          );
          selectedPages = selectedPages.slice(0, autoOcrMaxPages);
        }
      }

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

      // How many pages are OCR'd in parallel inside this single job. Tesseract
      // workers are CPU-bound so this defaults to the number of available
      // cores (minus one), capped at 16. The render pool below stays small —
      // rendering is much cheaper than OCR — but can be raised for fast
      // providers via OCR_RENDER_CONCURRENCY.
      const ocrConcurrency = readPositiveIntegerEnv(
        "OCR_CONCURRENCY",
        defaultOcrConcurrency(),
      );

      const renderConcurrency = Math.min(
        readPositiveIntegerEnv(
          "OCR_RENDER_CONCURRENCY",
          2,
        ),
        ocrConcurrency,
      );

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
        Math.max(
          1,
          Math.min(ocrConcurrency, selectedPages.length),
        ),
      );

      const maxRetries = readPositiveIntegerEnv(
        "OCR_MAX_RETRIES",
        3,
      );

      const retryDelayMs = readPositiveIntegerEnv(
        "OCR_RETRY_DELAY_MS",
        1_000,
      );

      const isPdf = fileMimeType === "application/pdf";

      // Open a small pool of PDF.js documents so pages render in parallel
      // without re-parsing the whole book once per page.
      let renderPool: PdfRenderPool | null = null;

      if (isPdf && selectedPages.length > 0) {
        renderPool = await PdfRenderPool.open(
          fileBuffer,
          Math.min(renderConcurrency, selectedPages.length),
        );
      }

      ctx.progress(
        `Starting OCR processing with ${provider.name} ` +
          `for ${selectedPages.length} page(s) across ` +
          `${ocrConcurrency} parallel worker(s)...`,
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
      const totalToProcess = selectedPages.length;

      const pageResults: Array<{
        pageNumber: number;
        status: string;
        confidence: number;
      }> = [];

      const failures: Error[] = [];

      // Shared, monotonically increasing count of pages that reached a
      // terminal state. Only touched from inside page tasks (single-threaded
      // event loop), so no locking is required.
      let pagesSettled = 0;
      let lastReportedProgress = 10;

      type PageOutcome = {
        pageNumber: number;
        status: "completed" | "failed" | "retry";
        confidence: number;
        error?: Error;
      };

      const reportOcrProgress = async (): Promise<void> => {
        if (pagesSettled >= totalToProcess) return;
        const pct = Math.floor(
          (pagesSettled / totalToProcess) * 100,
        );
        const mapped = 10 + Math.floor(pct * 0.9);
        if (mapped > lastReportedProgress) {
          lastReportedProgress = mapped;
          await reportProgressToProcessingRun({
            tenantId: payload.tenantId,
            documentId: payload.documentId,
            documentVersion: payload.documentVersion,
            stageName: "ocr",
            status: "running",
            progress: mapped,
          });
        }
      };

      let outcomes: PageOutcome[] = [];

      try {
        outcomes = await runWithConcurrency(
          selectedPages,
          ocrConcurrency,
          async (pageNumber): Promise<PageOutcome> => {
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

              const imageBuffer = isPdf
                ? await renderPool!.renderPage(pageNumber)
                : await renderImagePageToBuffer(
                    fileBuffer,
                    fileMimeType,
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
                    await new Promise<void>(
                      (resolve) => {
                        setTimeout(
                          resolve,
                          retryDelayMs * attempt,
                        );
                      },
                    );
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

              // A page that OCR'd successfully but produced no text is a
              // legitimate blank page (e.g. separator sheets in a scanned
              // book). Record it as completed-empty instead of a hard failure
              // so the run doesn't look failed for pages that were never
              // expected to contain text.
              const isBlankPage =
                pageOcr.isBlank === true &&
                pageOcr.text.trim().length === 0;

              if (providerReportedFailure && !isBlankPage) {
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

              const warningsToStore = isBlankPage
                ? ["Blank page: no text detected."]
                : pageOcr.warnings;

              // Persisting a recognised page can hit transient Mongo DNS /
              // connection blips; retry those writes in-place rather than
              // failing the page (recognition already succeeded).
              await withTransientRetry(async () => {
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
                        warnings: warningsToStore,
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
                    source: isAutoOcr
                      ? "auto"
                      : "manual",
                    createdAt: new Date(),
                  });
              });

              ctx.progress(
                `OCR completed for page ${pageNumber} ` +
                  `(confidence: ${Math.round(
                    pageOcr.confidence * 100,
                  )}%, duration: ${
                    Date.now() - pageStartedAt
                  }ms)`,
              );

              pagesSettled++;
              await reportOcrProgress();

              return {
                pageNumber,
                status: "completed",
                confidence: pageOcr.confidence,
              };
            } catch (err: unknown) {
              const error =
                err instanceof Error
                  ? err
                  : new Error(String(err));

              // A transient infra failure (Mongo/network blip) may recover on
              // a later run. Mark the page `retry` (picked up by the manual
              // Retry OCR action) and classify it as retryable so a run where
              // every page fails this way is retried wholesale by the queue.
              const isInfraError =
                isTransientInfraError(error);

              const pageStatus = isInfraError
                ? "retry"
                : "failed";

              const failureError = isInfraError
                ? new RetryableJobError(error.message)
                : error;

              // Persisting the failure record can itself hit the same
              // transient infra blip, so retry that write in-place. If the
              // DB is genuinely unreachable the failure cannot be recorded
              // at all — escalate to a retryable failure so the queue
              // re-attempts the whole job.
              try {
                await withTransientRetry(async () => {
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
                          status: pageStatus,
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
                });
              } catch (persistErr: unknown) {
                const persistError =
                  persistErr instanceof Error
                    ? persistErr
                    : new Error(String(persistErr));

                throw new RetryableJobError(
                  `Failed to persist OCR failure for page ${pageNumber}: ` +
                    persistError.message,
                );
              }

              ctx.progress(
                `OCR failed for page ${pageNumber}: ` +
                  error.message,
              );

              pagesSettled++;
              await reportOcrProgress();

              return {
                pageNumber,
                status: pageStatus,
                confidence: 0,
                error: failureError,
              };
            }
          },
        );

        for (const outcome of outcomes) {
          pageResults.push({
            pageNumber: outcome.pageNumber,
            status: outcome.status,
            confidence: outcome.confidence,
          });
          if (
            (outcome.status === "failed" ||
              outcome.status === "retry") &&
            outcome.error
          ) {
            failures.push(outcome.error);
          }
        }
      } finally {
        await renderPool?.destroy().catch(() => {});
        await provider.shutdown?.().catch(() => {});
      }

      const totalPagesProcessed = pageResults.filter(
        (result) => result.status === "completed",
      ).length;
      const totalPagesFailed = pageResults.filter(
        (result) =>
          result.status === "failed" ||
          result.status === "retry",
      ).length;

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
        // Prefer a retryable failure so the job can be retried wholesale,
        // otherwise surface a permanent failure (or the first error).
        const retryableFailure = failures.find(
          (failure) =>
            failure instanceof RetryableJobError,
        );

        if (retryableFailure) {
          throw retryableFailure;
        }

        const permanentFailure = failures.find(
          (failure) =>
            failure instanceof PermanentJobError,
        );

        if (permanentFailure) {
          throw permanentFailure;
        }

        throw new PermanentJobError(
          `OCR failed for all ${totalPagesFailed} ` +
            `selected page(s). First failure: ` +
            `${
              failures[0]?.message ||
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

      // ── Auto-OCR pipeline handoff ─────────────────────────────────────────
      // When this OCR run was triggered by the ingest pipeline (payload
      // carries a generationId), merge the recognised text back into the
      // extraction artifact and hand off to chunking → embedding → indexing
      // so the book becomes searchable via RAG.
      if (isAutoOcr && totalPagesProcessed > 0) {
        try {
          await mergeOcrResultsIntoArtifact(
            db,
            tenantId,
            documentId,
            payload.documentVersion,
            payload.generationId as string,
          );
          ctx.progress(
            "Merged OCR text into extraction artifact.",
          );
        } catch (mergeErr: unknown) {
          const mergeError =
            mergeErr instanceof Error
              ? mergeErr
              : new Error(String(mergeErr));

          ctx.progress(
            `Failed to merge OCR text into extraction artifact: ` +
              mergeError.message,
          );
        }

        try {
          await ctx.enqueue({
            jobType: "document.chunk",
            tenantId: payload.tenantId,
            actorId: "system",
            traceId: ctx.traceId,
            idempotencyKey: `${payload.documentId}-${payload.documentVersion}-chunk-${payload.generationId}`,
            payload: {
              documentId: payload.documentId,
              tenantId: payload.tenantId,
              documentVersion: payload.documentVersion,
              generationId: payload.generationId,
              department: payload.department ?? null,
              classification: payload.classification ?? null,
              chunkingConfig: {
                targetTokens: 400,
                hardCeiling: 800,
                overlap: 50,
                tokenizerVersion: "cl100k_base",
              },
            },
          });
          ctx.progress(
            "Auto-triggered chunking pipeline after OCR.",
          );
        } catch (enqueueErr: unknown) {
          const enqueueError =
            enqueueErr instanceof Error
              ? enqueueErr
              : new Error(String(enqueueErr));

          ctx.progress(
            `Failed to auto-trigger chunking after OCR: ` +
              enqueueError.message,
          );
        }
      }

      if (
        !isAutoOcr &&
        payload.quotaReservationId
      ) {
        await settleManualOcrQuotaReservation(
          tenantId,
          payload.quotaReservationId,
          totalPagesProcessed,
        );

        ctx.progress(
          `Settled OCR quota reservation: ${totalPagesProcessed} page(s) committed.`,
        );
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
    }),
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
  let confidenceSampleCount = 0;

  for (const page of ocrPages) {
    const text = (page.text as string) || "";
    const confidence = (page.confidence as number) || 0;
    const pageNum = page.pageNumber as number;

    // Blank pages are a valid outcome (separator sheets, blank inserts) — a
    // 0% confidence is expected there, so don't treat them as critically
    // low-confidence and don't let them drag the overall average down.
    const isBlank = text.trim().length <= 5;

    if (isBlank) {
      issues.push({ type: "blank_page", severity: "warning", message: `Page ${pageNum} appears blank.`, pageNumber: pageNum });
    } else {
      totalConfidence += confidence;
      confidenceSampleCount += 1;

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
  }

  const overallConfidence = confidenceSampleCount > 0 ? totalConfidence / confidenceSampleCount : 0;
  const hasCritical = issues.some((i) => i.severity === "critical");
  const hasWarnings = issues.some((i) => i.severity === "warning");

  // When every analysed page is blank there is no confidence sample to go on,
  // so a 0% average is expected; only apply the confidence thresholds when at
  // least one non-blank page contributed to the sample.
  const confidenceBelowCritical =
    confidenceSampleCount > 0 &&
    overallConfidence < criticalThreshold;

  let qualityStatus: string;
  let requiresReview: boolean;

  if (hasCritical || confidenceBelowCritical) {
    qualityStatus = "REVIEW_REQUIRED";
    requiresReview = true;
  } else if (
    hasWarnings ||
    (confidenceSampleCount > 0 &&
      overallConfidence < lowConfThreshold)
  ) {
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

    // Blank pages are expected (separator sheets, blank inserts) — treat them
    // as a warning, not as a critically low-confidence page.
    const pageIsBlank = String(p.text ?? "").trim().length <= 5;
    if (pageIsBlank) {
      pageStatuses[num] = "READY_WITH_WARNINGS";
    } else if (conf < criticalThreshold) {
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

/**
 * Merge completed OCR page results back into the extraction artifact so the
 * chunking job (which reads `extractionartifacts.pages`) sees the recognised
 * text. Used by the auto-OCR pipeline handoff for image-only documents.
 */
async function mergeOcrResultsIntoArtifact(
  db: ReturnType<NonNullable<ReturnType<typeof getMongoClient>>["db"]>,
  tenantId: ObjectId,
  documentId: ObjectId,
  documentVersion: number,
  generationId: string,
): Promise<void> {
  const [ocrPages, artifact] = await Promise.all([
    db.collection("ocrpageresults")
      .find({ tenantId, documentId, documentVersion, status: "completed" })
      .sort({ pageNumber: 1 })
      .toArray(),
    db.collection("extractionartifacts").findOne({
      tenantId,
      documentId,
      documentVersion,
      status: "completed",
    }),
  ]);

  if (!artifact || ocrPages.length === 0) {
    return;
  }

  const rawPages = Array.isArray(artifact.pages)
    ? (artifact.pages as Array<{
        pageNumber: number;
        blocks: Array<{ type: string; text: string; level?: number }>;
      }>)
    : [];

  const pagesById = new Map<
    number,
    {
      pageNumber: number;
      blocks: Array<{ type: string; text: string; level?: number }>;
    }
  >(
    rawPages.map((page) => [
      page.pageNumber,
      {
        pageNumber: page.pageNumber,
        blocks: page.blocks.filter(
          (block) => block.text.trim().length > 0,
        ),
      },
    ]),
  );

  for (const ocrPage of ocrPages) {
    const pageNumber = ocrPage.pageNumber as number;
    const text = (ocrPage.text as string) || "";
    pagesById.set(pageNumber, {
      pageNumber,
      blocks: text.trim().length > 0
        ? [{ type: "paragraph", text }]
        : [],
    });
  }

  const mergedPages = [...pagesById.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, page]) => page);

  const totalCharacters = mergedPages.reduce(
    (sum, page) =>
      sum +
      page.blocks.reduce(
        (pageSum, block) => pageSum + block.text.trim().length,
        0,
      ),
    0,
  );

  const previousMetadata = (artifact.metadata as Record<string, unknown>) ?? {};
  const warnings = Array.isArray(previousMetadata.warnings)
    ? [...(previousMetadata.warnings as string[])]
    : [];

  await db.collection("extractionartifacts").updateOne(
    { _id: artifact._id },
    {
      $set: {
        pages: mergedPages,
        metadata: {
          ...previousMetadata,
          totalPages: mergedPages.length,
          totalCharacters,
          hasImageOnlyPages: false,
          ocrAppliedPages: ocrPages.length,
          ocrGenerationId: generationId,
          warnings: [
            ...warnings,
            `OCR applied to ${ocrPages.length} page(s).`,
          ],
        },
        updatedAt: new Date(),
      },
    },
  );
}
