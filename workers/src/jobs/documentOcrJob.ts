import { z } from "zod";
import { ObjectId } from "mongodb";
import { JobHandlerDefinition, JobHandlerResult } from "../contracts/jobDispatcher.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import { getMongoClient } from "../db/mongo.js";

const OcrLanguageSchema = z.enum(["ar", "en", "ar+en"]);

const PayloadSchema = z.object({
  documentId: z.string(),
  tenantId: z.string(),
  documentVersion: z.number().int().positive(),
  language: OcrLanguageSchema.default("ar+en"),
  pageNumbers: z.array(z.number().int().positive()).optional(),
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

function getProviderInstance(providerName: string): OcrProviderStub {
  switch (providerName) {
    case "tesseract":
      return createTesseractStub();
    case "paddle":
      return createPaddleStub();
    default:
      return createFakeStub();
  }
}

interface OcrProviderStub {
  name: string;
  version: string;
  recognizeBatch(pages: Array<{ pageNumber: number; imageBuffer: Buffer; mimeType: string; language: string }>): Promise<{ pages: OcrPageOutput[]; totalCostUsd: number; providerVersion: string }>;
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
      const Tesseract = await import("tesseract.js");
      const langMap: Record<string, string> = { ar: "ara", en: "eng", "ar+en": "ara+eng" };
      const results: OcrPageOutput[] = [];

      for (const page of pages) {
        const start = Date.now();
        try {
          const result = await Tesseract.recognize(page.imageBuffer, langMap[page.language] || "eng", { logger: () => {} });
          results.push({
            pageNumber: page.pageNumber,
            text: result.data.text,
            confidence: result.data.confidence / 100,
            words: (result.data.words as Array<{ text: string; confidence: number; bbox?: { x0: number; y0: number; x1: number; y1: number } }>).map((w) => ({
              text: w.text,
              confidence: w.confidence / 100,
              boundingBox: w.bbox ? { x: w.bbox.x0, y: w.bbox.y0, width: w.bbox.x1 - w.bbox.x0, height: w.bbox.y1 - w.bbox.y0 } : undefined,
            })),
            language: page.language,
            provider: "tesseract",
            providerModel: "tesseract-v5.x",
            durationMs: Date.now() - start,
            warnings: result.data.confidence < 50 ? [`Low confidence: ${result.data.confidence}%`] : [],
          });
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          results.push({
            pageNumber: page.pageNumber,
            text: "",
            confidence: 0,
            words: [],
            language: page.language,
            provider: "tesseract",
            providerModel: "tesseract-v5.x",
            durationMs: Date.now() - start,
            warnings: [`OCR failed: ${error.message}`],
          });
        }
      }
      return { pages: results, totalCostUsd: 0, providerVersion: "5.x" };
    },
  };
}

function createPaddleStub(): OcrProviderStub {
  const serviceUrl = process.env.PADDLE_OCR_SERVICE_URL || "http://localhost:8501";
  return {
    name: "paddle",
    version: "2.x",
    async recognizeBatch(pages) {
      const formData = new FormData();
      for (const page of pages) {
        const ext = page.mimeType.includes("png") ? "png" : "jpg";
        const blob = new Blob([new Uint8Array(page.imageBuffer)], { type: page.mimeType });
        formData.append("files", blob, `page_${page.pageNumber}.${ext}`);
        formData.append("languages", page.language === "ar+en" ? "ar" : page.language);
      }

      try {
        const response = await fetch(`${serviceUrl}/ocr`, { method: "POST", body: formData });
        if (!response.ok) throw new Error(`PaddleOCR returned ${response.status}`);
        const data = (await response.json()) as { requestId?: string; pages: OcrPageOutput[] };
        return { pages: data.pages, totalCostUsd: 0, providerVersion: "2.x" };
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error(String(err));
        return {
          pages: pages.map((p) => ({
            pageNumber: p.pageNumber,
            text: "",
            confidence: 0,
            words: [],
            language: p.language,
            provider: "paddle",
            providerModel: "paddle-v2.x",
            durationMs: 0,
            warnings: [`PaddleOCR error: ${error.message}`],
          })),
          totalCostUsd: 0,
          providerVersion: "2.x",
        };
      }
    },
  };
}

export function createDocumentOcrJobHandler(): JobHandlerDefinition<DocumentOcrPayload> {
  return {
    jobType: "document.ocr",
    description: "Performs OCR processing on document pages and records page-level results.",
    payloadSchema: PayloadSchema,
    maxAttempts: 3,
    handle: async (payload, ctx): Promise<JobHandlerResult | void> => {
      const db = getMongoClient()?.db();
      if (!db) {
        throw new RetryableJobError("Database connection unavailable");
      }

      const documentId = new ObjectId(payload.documentId);
      const tenantId = new ObjectId(payload.tenantId);

      const version = await db.collection("documentversions").findOne({
        documentId,
        version: payload.documentVersion,
        tenantId,
      });
      if (!version) {
        ctx.progress("Document version not found; skipping OCR job execution.");
        return { summary: { discarded: true, reason: "version_not_found" } };
      }

      const document = await db.collection("documents").findOne({ _id: documentId, tenantId });
      if (!document) {
        ctx.progress("Document record not found; skipping OCR job execution.");
        return { summary: { discarded: true, reason: "document_not_found" } };
      }

      const pageNumbers = payload.pageNumbers || [1];
      const providerName = payload.ocrProvider || process.env.OCR_PROVIDER || "fake";
      const provider = getProviderInstance(providerName);

      ctx.progress(`Starting OCR processing with ${provider.name} for ${pageNumbers.length} page(s)...`);

      const startTime = Date.now();
      let totalPagesProcessed = 0;
      let totalPagesFailed = 0;
      const pageResults: Array<{ pageNumber: number; status: string; confidence: number }> = [];

      for (const pageNum of pageNumbers) {
        try {
          const _pageStart = Date.now();

          const fakeImageBuffer = new TextEncoder().encode(`page-${pageNum}-placeholder`);
          const ocrResult = await provider.recognizeBatch([{
            pageNumber: pageNum,
            imageBuffer: Buffer.from(fakeImageBuffer),
            mimeType: "image/png",
            language: payload.language,
          }]);

          const pageOcr = ocrResult.pages[0];

          if (pageOcr.confidence === 0 && pageOcr.warnings.some((w) => w.includes("failed"))) {
            throw new PermanentJobError(`OCR failed for page ${pageNum}: ${pageOcr.warnings.join(", ")}`);
          }

          await db.collection("ocrpageresults").updateOne(
            { tenantId, documentId, documentVersion: payload.documentVersion, pageNumber: pageNum },
            {
              $set: {
                text: pageOcr.text,
                confidence: pageOcr.confidence,
                words: pageOcr.words,
                language: payload.language,
                provider: pageOcr.provider,
                providerModel: pageOcr.providerModel,
                providerVersion: ocrResult.providerVersion,
                durationMs: pageOcr.durationMs,
                costUsd: 0,
                warnings: pageOcr.warnings,
                status: "completed",
                failureReason: null,
                updatedAt: new Date(),
              },
              $setOnInsert: {
                documentId,
                tenantId,
                documentVersion: payload.documentVersion,
                pageNumber: pageNum,
                createdAt: new Date(),
              },
            },
            { upsert: true },
          );

          await db.collection("ocrusagerecords").insertOne({
            tenantId,
            documentId,
            documentVersion: payload.documentVersion,
            pageNumber: pageNum,
            provider: pageOcr.provider,
            providerModel: pageOcr.providerModel,
            language: payload.language,
            pagesProcessed: 1,
            durationMs: pageOcr.durationMs,
            costUsd: 0,
            createdAt: new Date(),
          });

          totalPagesProcessed++;
          pageResults.push({ pageNumber: pageNum, status: "completed", confidence: pageOcr.confidence });

          ctx.progress(`OCR completed for page ${pageNum} (confidence: ${Math.round(pageOcr.confidence * 100)}%)`);
        } catch (err: unknown) {
          const error = err instanceof Error ? err : new Error(String(err));
          totalPagesFailed++;

          await db.collection("ocrpageresults").updateOne(
            { tenantId, documentId, documentVersion: payload.documentVersion, pageNumber: pageNum },
            {
              $set: { status: "failed", failureReason: error.message, updatedAt: new Date() },
              $setOnInsert: { documentId, tenantId, documentVersion: payload.documentVersion, pageNumber: pageNum, createdAt: new Date() },
            },
            { upsert: true },
          );

          pageResults.push({ pageNumber: pageNum, status: "failed", confidence: 0 });
          ctx.progress(`OCR failed for page ${pageNum}: ${error.message}`);
        }
      }

      const totalDurationMs = Date.now() - startTime;

      ctx.progress(`OCR processing completed. ${totalPagesProcessed} succeeded, ${totalPagesFailed} failed. Duration: ${totalDurationMs}ms`);

      if (totalPagesProcessed > 0) {
        try {
          await runQualityAssessment(db, tenantId, documentId, payload.documentVersion, provider.name);
          ctx.progress("Quality assessment completed after OCR.");
        } catch (qaErr: unknown) {
          const qaError = qaErr instanceof Error ? qaErr : new Error(String(qaErr));
          ctx.progress(`Quality assessment failed after OCR: ${qaError.message}`);
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

async function runQualityAssessment(
  db: ReturnType<NonNullable<ReturnType<typeof getMongoClient>>["db"]>,
  tenantId: ObjectId,
  documentId: ObjectId,
  documentVersion: number,
  providerName: string,
): Promise<void> {
  const ocrPages = await db.collection("ocrpageresults")
    .find({ tenantId, documentId, documentVersion })
    .sort({ pageNumber: 1 })
    .toArray();

  if (ocrPages.length === 0) return;

  const issues: Array<{ type: string; severity: string; message: string; pageNumber: number }> = [];
  let totalConfidence = 0;

  const lowConfThreshold = parseFloat(process.env.OCR_CONFIDENCE_THRESHOLD || "0.7");
  const criticalThreshold = parseFloat(process.env.OCR_CRITICAL_CONFIDENCE_THRESHOLD || "0.4");

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
    pageStatuses[num] = conf < criticalThreshold ? "REVIEW_REQUIRED" : conf < lowConfThreshold ? "READY_WITH_WARNINGS" : "READY";
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
