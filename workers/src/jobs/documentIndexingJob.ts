import { z } from "zod";
import { ObjectId } from "mongodb";
import type { JobHandlerDefinition, JobHandlerResult } from "../contracts/jobDispatcher.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import { getMongoClient } from "../db/mongo.js";
import { reportProgressToProcessingRun, skipProcessingStages } from "./progressReporter.js";

const PayloadSchema = z.object({
  documentId: z.string(),
  tenantId: z.string(),
  documentVersion: z.number().int().positive(),
  generationId: z.string(),
});

type IndexingPayload = z.infer<typeof PayloadSchema>;

const VECTOR_INDEX_NAME = "vidx_chunk_embeddings_v1";
const KEYWORD_INDEX_NAME = "kidx_chunk_text_v1";

export function createDocumentIndexingJobHandler(): JobHandlerDefinition<IndexingPayload> {
  return {
    jobType: "document.index",
    description: "Ensures Atlas search indexes exist and activates generation.",
    payloadSchema: PayloadSchema,
    maxAttempts: 10,
    handle: async (payload, ctx): Promise<JobHandlerResult | void> => {
      const startTime = Date.now();
      const db = getMongoClient()?.db();
      if (!db) throw new RetryableJobError("Database connection unavailable");

      await reportProgressToProcessingRun({
        tenantId: payload.tenantId,
        documentId: payload.documentId,
        documentVersion: payload.documentVersion,
        stageName: "indexing",
        status: "running",
        progress: 0,
      });

      const tenantId = new ObjectId(payload.tenantId);
      const generationId = new ObjectId(payload.generationId);

      await reportProgressToProcessingRun({
        tenantId: payload.tenantId,
        documentId: payload.documentId,
        documentVersion: payload.documentVersion,
        stageName: "indexing",
        status: "running",
        progress: 10,
      });

      await skipProcessingStages({
        tenantId: payload.tenantId,
        documentId: payload.documentId,
        documentVersion: payload.documentVersion,
        stageNames: ["finalization"],
      });

      const generation = await db.collection("indexgenerations").findOne({
        _id: generationId,
        tenantId,
      });

      if (!generation) {
        await reportProgressToProcessingRun({
          tenantId: payload.tenantId,
          documentId: payload.documentId,
          documentVersion: payload.documentVersion,
          stageName: "indexing",
          status: "failed",
          errorCode: "GENERATION_NOT_FOUND",
          errorMessage: "Generation not found",
        });
        throw new PermanentJobError("Generation not found");
      }

      const isVerifyRecovery = generation.status === "VERIFYING";

      if (!isVerifyRecovery) {
        const sampleEmbedding = await db.collection("chunkembeddings").findOne({
          tenantId,
          generationId,
        });
        const numDimensions =
          (sampleEmbedding?.dimensions as number) || 1536;

        ctx.progress("Ensuring Atlas search indexes...");

        try {
          const chunkEmbeddings = db.collection("chunkembeddings");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (chunkEmbeddings as any).createSearchIndex({
            name: VECTOR_INDEX_NAME,
            type: "vectorSearch",
            definition: {
              fields: [
                {
                  type: "vector",
                  numDimensions,
                  path: "vector",
                  similarity: "cosine",
                },
                {
                  type: "filter",
                  path: "tenantId",
                },
                {
                  type: "filter",
                  path: "documentId",
                },
                {
                  type: "filter",
                  path: "generationId",
                },
                {
                  type: "filter",
                  path: "department",
                },
                {
                  type: "filter",
                  path: "category",
                },
                {
                  type: "filter",
                  path: "classification",
                },
                {
                  type: "filter",
                  path: "language",
                },
                {
                  type: "filter",
                  path: "contentType",
                },
              ],
            },
          });
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          if (!error.message.includes("already exists")) {
            ctx.progress(`Vector index creation failed: ${error.message}`);
          }
        }

        try {
          const documentChunks = db.collection("documentchunks");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          await (documentChunks as any).createSearchIndex({
            name: KEYWORD_INDEX_NAME,
            type: "search",
            definition: {
              mappings: {
                dynamic: false,
                fields: {
                  text: { type: "string", analyzer: "lucene.standard" },
                  tenantId: { type: "objectId" },
                  documentId: { type: "objectId" },
                  generationId: { type: "objectId" },
                  classification: { type: "string", analyzer: "lucene.standard" },
                  department: { type: "string", analyzer: "lucene.standard" },
                  category: { type: "string", analyzer: "lucene.standard" },
                  allowAiUse: { type: "boolean" },
                },
              },
            },
          });
        } catch (err) {
          const error = err instanceof Error ? err : new Error(String(err));
          if (!error.message.includes("already exists")) {
            ctx.progress(`Keyword index creation failed: ${error.message}`);
          }
        }

        ctx.progress("Verifying counts...");

        const actualChunkCount = await db.collection("documentchunks")
          .countDocuments({ tenantId, generationId });

        const actualEmbeddingCount = await db.collection("chunkembeddings")
          .countDocuments({ tenantId, generationId });

        const expectedChunkCount = generation.expectedChunkCount || 0;
        const expectedEmbeddingCount = generation.expectedEmbeddingCount || 0;

        const chunkMatch = actualChunkCount === expectedChunkCount;
        const embeddingMatch = actualEmbeddingCount === expectedEmbeddingCount;

        if (!chunkMatch || !embeddingMatch) {
          const failureReason = {
            stage: "index",
            code: "COUNT_MISMATCH",
            message: `Chunks: ${actualChunkCount}/${expectedChunkCount}, Embeddings: ${actualEmbeddingCount}/${expectedEmbeddingCount}`,
          };

          await db.collection("indexgenerations").updateOne(
            { _id: generationId, tenantId },
            {
              $set: {
                status: "FAILED",
                actualChunkCount,
                actualEmbeddingCount,
                failureReason,
              },
            },
          );

          await db.collection("documents").updateOne(
            { _id: new ObjectId(payload.documentId), tenantId },
            { $set: { searchStatus: "FAILED" } },
          );

          await reportProgressToProcessingRun({
            tenantId: payload.tenantId,
            documentId: payload.documentId,
            documentVersion: payload.documentVersion,
            stageName: "indexing",
            status: "failed",
            errorCode: "COUNT_MISMATCH",
            errorMessage: failureReason.message,
          });

          throw new PermanentJobError(failureReason.message);
        }
      } else {
        ctx.progress("Recovering from VERIFYING status; checking index readiness...");
      }

      ctx.progress("Checking Atlas index status...");

      let vectorReady = false;
      let keywordReady = false;

      try {
        const chunkEmbeddings = db.collection("chunkembeddings");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const vectorIndexes = await (chunkEmbeddings as any).listSearchIndexes().toArray();
        vectorReady = vectorIndexes.some(
          (idx: { name: string; status?: string }) => idx.name === VECTOR_INDEX_NAME && idx.status === "READY",
        );
      } catch {
        ctx.progress("Could not check vector index status");
      }

      try {
        const documentChunks = db.collection("documentchunks");
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const keywordIndexes = await (documentChunks as any).listSearchIndexes().toArray();
        keywordReady = keywordIndexes.some(
          (idx: { name: string; status?: string }) => idx.name === KEYWORD_INDEX_NAME && idx.status === "READY",
        );
      } catch {
        ctx.progress("Could not check keyword index status");
      }

      if (!vectorReady || !keywordReady) {
        if (isVerifyRecovery) {
          throw new RetryableJobError(
            `Atlas indexes still building (vector: ${vectorReady}, keyword: ${keywordReady})`,
          );
        }

        await db.collection("indexgenerations").updateOne(
          { _id: generationId, tenantId },
          {
            $set: {
              status: "VERIFYING",
              atlasIndexStatus: "BUILDING",
            },
          },
        );

        ctx.progress("Atlas indexes still building; retrying later", {
          vectorReady,
          keywordReady,
        });

        throw new RetryableJobError(
          `Atlas indexes still building (vector: ${vectorReady}, keyword: ${keywordReady})`,
        );
      }

      const actualChunkCount = await db.collection("documentchunks")
        .countDocuments({ tenantId, generationId });
      const actualEmbeddingCount = await db.collection("chunkembeddings")
        .countDocuments({ tenantId, generationId });

      await db.collection("indexgenerations").updateOne(
        { _id: generationId, tenantId },
        {
          $set: {
            status: "ACTIVE",
            actualChunkCount,
            actualEmbeddingCount,
            atlasIndexStatus: "READY",
            activatedAt: new Date(),
          },
        },
      );

      await db.collection("indexgenerations").updateMany(
        {
          documentId: new ObjectId(payload.documentId),
          tenantId,
          status: "ACTIVE",
          _id: { $ne: generationId },
        },
        { $set: { status: "RETIRED", retiredAt: new Date() } },
      );

      try {
        const retiredGens = await db.collection("indexgenerations")
          .find({
            documentId: new ObjectId(payload.documentId),
            tenantId,
            status: "RETIRED",
            retiredAt: { $gte: new Date(Date.now() - 5000) },
          })
          .toArray();
        for (const rg of retiredGens) {
          await db.collection("auditlogs").insertOne({
            tenantId,
            action: "INDEX_GENERATION_RETIRED",
            resourceType: "IndexGeneration",
            resourceId: rg._id.toString(),
            outcome: "SUCCESS",
            metadata: {
              documentId: payload.documentId,
              generationId: rg._id.toString(),
              generationNumber: rg.generationNumber,
              replacedBy: generationId.toString(),
            },
            createdAt: new Date(),
          });
        }
      } catch {
        // Audit logging failure should not block indexing
      }

      await db.collection("documents").updateOne(
        { _id: new ObjectId(payload.documentId), tenantId },
        {
          $set: {
            activeChunkGeneration: generationId,
            searchStatus: "READY",
          },
        },
      );

      ctx.progress("Generation activated", {
        chunks: actualChunkCount,
        embeddings: actualEmbeddingCount,
        durationMs: Date.now() - startTime,
        metric: "indexing.index_duration_ms",
      });

      await reportProgressToProcessingRun({
        tenantId: payload.tenantId,
        documentId: payload.documentId,
        documentVersion: payload.documentVersion,
        stageName: "indexing",
        status: "completed",
        progress: 100,
      });

      return {
        summary: {
          success: true,
          activated: true,
          actualChunkCount,
          actualEmbeddingCount,
        },
      };
    },
  };
}
