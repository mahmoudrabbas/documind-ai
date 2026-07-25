import { z } from "zod";
import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
import type { JobHandlerDefinition, JobHandlerResult } from "../contracts/jobDispatcher.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import { getMongoClient } from "../db/mongo.js";
import { chunkDocument, type ChunkCandidate } from "../providers/chunking/chunker.js";
import { TiktokenTokenizer } from "../providers/chunking/tokenizer.js";
import type { ExtractionPage } from "../contracts/extractionContract.js";

const PayloadSchema = z.object({
  documentId: z.string(),
  tenantId: z.string(),
  documentVersion: z.number().int().positive(),
  generationId: z.string(),
  department: z.string().nullable().optional(),
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

      const documentId = new ObjectId(payload.documentId);
      const tenantId = new ObjectId(payload.tenantId);
      const generationId = new ObjectId(payload.generationId);

      const artifact = await db.collection("extractionartifacts").findOne({
        tenantId,
        documentId,
        documentVersion: payload.documentVersion,
        status: "completed",
      });

      if (!artifact) {
        throw new PermanentJobError("Extraction artifact not found or not completed");
      }

      const pages = artifact.pages as ExtractionPage[];
      if (!pages || pages.length === 0) {
        throw new PermanentJobError("No pages found in extraction artifact");
      }

      ctx.progress("Starting chunking...", { pageCount: pages.length });

      const tokenizer = new TiktokenTokenizer();
      const chunks = chunkDocument(pages, tokenizer, payload.chunkingConfig);

      if (chunks.length === 0) {
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
        offsetStart: chunk.offsetStart,
        offsetEnd: chunk.offsetEnd,
        contentType: chunk.contentType,
        language: chunk.language,
        department: payload.department ?? null,
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
