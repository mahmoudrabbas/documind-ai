import { z } from "zod";
import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
import type { JobHandlerDefinition, JobHandlerResult } from "../contracts/jobDispatcher.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import { getMongoClient } from "../db/mongo.js";
import { reportProgressToProcessingRun, skipProcessingStages } from "./progressReporter.js";
import { chunkDocument } from "../providers/chunking/chunker.js";
import { TiktokenTokenizer } from "../providers/chunking/tokenizer.js";
import type { ExtractionPage } from "../contracts/extractionContract.js";

const PayloadSchema = z.object({
  documentId: z.string(),
  tenantId: z.string(),
  documentVersion: z.number().int().positive(),
  generationId: z.string(),
  department: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  classification: z.string().nullable().optional(),
  chunkingConfig: z.object({
    targetTokens: z.number().int().positive().optional(),
    hardCeiling: z.number().int().positive().optional(),
    overlap: z.number().int().nonnegative().optional(),
  }).optional(),
});

type ChunkingPayload = z.infer<typeof PayloadSchema>;

export function createDocumentChunkingJobHandler(): JobHandlerDefinition<ChunkingPayload> {
  return {
    jobType: "document.chunk",
    description: "Chunks document text into semantically meaningful segments.",
    payloadSchema: PayloadSchema,
    maxAttempts: 3,
    handle: async (payload, ctx): Promise<JobHandlerResult | void> => {
      const startTime = Date.now();
      const db = getMongoClient()?.db();
      if (!db) throw new RetryableJobError("Database connection unavailable");

      await reportProgressToProcessingRun({
        tenantId: payload.tenantId,
        documentId: payload.documentId,
        documentVersion: payload.documentVersion,
        stageName: "chunking",
        status: "running",
        progress: 0,
      });

      const documentId = new ObjectId(payload.documentId);
      const tenantId = new ObjectId(payload.tenantId);
      const generationId = new ObjectId(payload.generationId);

      await reportProgressToProcessingRun({
        tenantId: payload.tenantId,
        documentId: payload.documentId,
        documentVersion: payload.documentVersion,
        stageName: "chunking",
        status: "running",
        progress: 10,
      });

      await skipProcessingStages({
        tenantId: payload.tenantId,
        documentId: payload.documentId,
        documentVersion: payload.documentVersion,
        stageNames: ["ocr", "quality_review", "metadata_review"],
      });

      const artifact = await db.collection("extractionartifacts").findOne({
        tenantId,
        documentId,
        documentVersion: payload.documentVersion,
        status: "completed",
      });

      if (!artifact) {
        await reportProgressToProcessingRun({
          tenantId: payload.tenantId,
          documentId: payload.documentId,
          documentVersion: payload.documentVersion,
          stageName: "chunking",
          status: "failed",
          errorCode: "ARTIFACT_NOT_FOUND",
          errorMessage: "Extraction artifact not found or not completed",
        });
        throw new PermanentJobError("Extraction artifact not found or not completed");
      }

      const pages = artifact.pages as ExtractionPage[];
      if (!pages || pages.length === 0) {
        await reportProgressToProcessingRun({
          tenantId: payload.tenantId,
          documentId: payload.documentId,
          documentVersion: payload.documentVersion,
          stageName: "chunking",
          status: "failed",
          errorCode: "NO_PAGES",
          errorMessage: "No pages found in extraction artifact",
        });
        throw new PermanentJobError("No pages found in extraction artifact");
      }

      ctx.progress("Starting chunking...", { pageCount: pages.length });

      const tokenizer = new TiktokenTokenizer();
      const chunks = chunkDocument(pages, tokenizer, payload.chunkingConfig);

      if (chunks.length === 0) {
        await reportProgressToProcessingRun({
          tenantId: payload.tenantId,
          documentId: payload.documentId,
          documentVersion: payload.documentVersion,
          stageName: "chunking",
          status: "failed",
          errorCode: "ZERO_CHUNKS",
          errorMessage: "Chunking produced zero chunks",
        });
        throw new PermanentJobError("Chunking produced zero chunks");
      }

      ctx.progress("Persisting chunks...", { chunkCount: chunks.length });

      const chunkDocs = chunks.map((chunk, index) => ({
        tenantId,
        documentId,
        documentVersion: payload.documentVersion,
        generationId,
        chunkIndex: index,
        sectionPath: chunk.sectionPath,
        pageStart: chunk.pageStart,
        pageEnd: chunk.pageEnd,
        pageNumber: chunk.pageStart,
        offsetStart: chunk.offsetStart,
        offsetEnd: chunk.offsetEnd,
        contentType: chunk.contentType,
        language: chunk.language,
        department: payload.department ?? null,
        category: payload.category ?? null,
        classification: payload.classification ?? null,
        text: chunk.text,
        checksum: createHash("sha256").update(chunk.text).digest("hex"),
        tokenCount: chunk.tokenCount,
        status: "DRAFT" as const,
        partIndex: chunk.partIndex,
        partCount: chunk.partCount,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));

      await db.collection("documentchunks").insertMany(chunkDocs, { ordered: false });

      await db.collection("indexgenerations").updateOne(
        { _id: generationId, tenantId },
        {
          $set: {
            expectedChunkCount: chunks.length,
            actualChunkCount: chunks.length,
          },
        },
      );

      ctx.progress("Chunking completed", {
        chunkCount: chunks.length,
        pageCount: pages.length,
        durationMs: Date.now() - startTime,
        metric: "indexing.chunk_duration_ms",
      });

      await reportProgressToProcessingRun({
        tenantId: payload.tenantId,
        documentId: payload.documentId,
        documentVersion: payload.documentVersion,
        stageName: "chunking",
        status: "completed",
        progress: 100,
      });

      try {
        await ctx.enqueue({
          jobType: "document.embed",
          tenantId: payload.tenantId,
          actorId: "system",
          traceId: ctx.traceId,
          idempotencyKey: `${payload.documentId}-${payload.documentVersion}-embed-${payload.generationId}`,
          payload: {
            documentId: payload.documentId,
            tenantId: payload.tenantId,
            documentVersion: payload.documentVersion,
            generationId: payload.generationId,
          },
        });
        ctx.progress("Auto-triggered embedding pipeline after chunking.");
      } catch (err) {
        ctx.progress(`Failed to auto-trigger embedding: ${err instanceof Error ? err.message : String(err)}`);
      }

      return {
        summary: {
          success: true,
          pageCount: pages.length,
          chunkCount: chunks.length,
        },
      };
    },
  };
}
