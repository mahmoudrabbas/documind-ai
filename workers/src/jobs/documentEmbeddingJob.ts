import { z } from "zod";
import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
import type { JobHandlerDefinition, JobHandlerResult } from "../contracts/jobDispatcher.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import { getMongoClient } from "../db/mongo.js";
import { reportProgressToProcessingRun } from "./progressReporter.js";
import { createEmbeddingProvider, type EmbeddingInput } from "../providers/embedding/openaiEmbedding.js";

const PayloadSchema = z.object({
  documentId: z.string(),
  tenantId: z.string(),
  documentVersion: z.number().int().positive(),
  generationId: z.string(),
});

type EmbeddingPayload = z.infer<typeof PayloadSchema>;

const EMBEDDING_BATCH_SIZE = 100;

const CLASSIFICATIONS_BLOCKED_FROM_EXTERNAL_EMBEDDING = new Set([
  "top_secret",
  "restricted",
]);

function isClassificationAllowedForEmbedding(classification: string | null): boolean {
  if (!classification) return true;
  // In development, only block top_secret; allow restricted for local testing
  if (process.env.NODE_ENV === "development" || process.env.ALLOW_RESTRICTED_EMBEDDING === "true") {
    return classification !== "top_secret";
  }
  return !CLASSIFICATIONS_BLOCKED_FROM_EXTERNAL_EMBEDDING.has(classification);
}

export type EmbeddingProviderFactory = () => {
  name: string;
  model: string;
  dimensions: number;
  embedBatch: (inputs: EmbeddingInput[]) => Promise<Array<{
    chunkId: string;
    vector: number[];
    tokenUsage: number;
    costUsd: number;
    modelVersion: string;
  }>>;
};

export function createDocumentEmbeddingJobHandler(
  providerFactory?: EmbeddingProviderFactory,
): JobHandlerDefinition<EmbeddingPayload> {
  return {
    jobType: "document.embed",
    description: "Generates vector embeddings for document chunks.",
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
        stageName: "embedding",
        status: "running",
        progress: 0,
      });

      const tenantId = new ObjectId(payload.tenantId);
      const generationId = new ObjectId(payload.generationId);
      const documentId = new ObjectId(payload.documentId);

      await reportProgressToProcessingRun({
        tenantId: payload.tenantId,
        documentId: payload.documentId,
        documentVersion: payload.documentVersion,
        stageName: "embedding",
        status: "running",
        progress: 10,
      });

      const chunks = await db.collection("documentchunks")
        .find({ tenantId, generationId, status: "DRAFT" })
        .toArray();

      if (chunks.length === 0) {
        await reportProgressToProcessingRun({
          tenantId: payload.tenantId,
          documentId: payload.documentId,
          documentVersion: payload.documentVersion,
          stageName: "embedding",
          status: "failed",
          errorCode: "NO_DRAFT_CHUNKS",
          errorMessage: "No DRAFT chunks found; chunking may not have completed",
        });
        throw new RetryableJobError(
          "No DRAFT chunks found; chunking may not have completed",
        );
      }

      const blockedChunks = chunks.filter(
        (c) => !isClassificationAllowedForEmbedding(c.classification as string | null),
      );
      if (blockedChunks.length > 0) {
        const blockedClassification = blockedChunks[0].classification;
        await db.collection("indexgenerations").updateOne(
          { _id: generationId, tenantId },
          {
            $set: {
              status: "FAILED",
              failureReason: {
                stage: "embed",
                code: "CLASSIFICATION_BLOCKED",
                message: `Classification "${blockedClassification}" is not permitted for external embedding provider. ${blockedChunks.length} chunks blocked.`,
              },
            },
          },
        );

        await db.collection("documents").updateOne(
          { _id: new ObjectId(payload.documentId), tenantId },
          { $set: { searchStatus: "FAILED" } },
        );

        try {
          await db.collection("auditlogs").insertOne({
            tenantId,
            action: "INDEX_CLASSIFICATION_BLOCKED",
            resourceType: "Document",
            resourceId: payload.documentId,
            outcome: "DENIED",
            metadata: {
              generationId: payload.generationId,
              classification: blockedClassification,
              blockedChunkCount: blockedChunks.length,
            },
            createdAt: new Date(),
          });
        } catch {
          // Audit logging failure should not block the error response
        }

        await reportProgressToProcessingRun({
          tenantId: payload.tenantId,
          documentId: payload.documentId,
          documentVersion: payload.documentVersion,
          stageName: "embedding",
          status: "failed",
          errorCode: "CLASSIFICATION_BLOCKED",
          errorMessage: `Classification "${blockedClassification}" is not permitted for external embedding provider`,
        });

        throw new PermanentJobError(
          `Classification "${blockedClassification}" is not permitted for external embedding provider`,
        );
      }

      ctx.progress("Starting embedding...", { chunkCount: chunks.length });

      const provider = providerFactory ? providerFactory() : createEmbeddingProvider();

      const batches: Array<Array<typeof chunks[0]>> = [];
      for (let i = 0; i < chunks.length; i += EMBEDDING_BATCH_SIZE) {
        batches.push(chunks.slice(i, i + EMBEDDING_BATCH_SIZE));
      }

      let embeddedCount = 0;
      let failedCount = 0;
      let totalTokens = 0;
      let totalCostUsd = 0;

      for (const batch of batches) {
        const inputs: EmbeddingInput[] = batch.map((chunk) => ({
          chunkId: chunk._id.toString(),
          text: chunk.text as string,
          idempotencyKey: createHash("sha256")
            .update(`${chunk._id}:${payload.generationId}:${provider.model}`)
            .digest("hex"),
        }));

        try {
          const results = await provider.embedBatch(inputs);

          const chunkMap = new Map(batch.map((c) => [c._id.toString(), c]));
          const matched: Array<Record<string, unknown>> = [];
          const succeededIds: ObjectId[] = [];
          let batchTokens = 0;
          let batchCost = 0;

          for (const result of results) {
            const chunk = chunkMap.get(result.chunkId);
            if (!chunk) continue;

            matched.push({
              chunkId: new ObjectId(result.chunkId),
              generationId,
              tenantId,
              documentId,
              provider: provider.name,
              modelName: provider.model,
              modelVersion: result.modelVersion,
              dimensions: provider.dimensions,
              vector: result.vector,
              embeddingChecksum: createHash("sha256")
                .update(chunk.text as string)
                .digest("hex"),
              department: chunk.department ?? null,
              category: chunk.category ?? null,
              classification: chunk.classification ?? null,
              accessPolicyVersion: null,
              language: chunk.language || "en",
              contentType: chunk.contentType || "paragraph",
              tokenUsage: result.tokenUsage,
              costUsd: result.costUsd,
              createdAt: new Date(),
            });
            succeededIds.push(chunk._id);
            batchTokens += result.tokenUsage;
            batchCost += result.costUsd;
          }

          if (matched.length > 0) {
            await db.collection("chunkembeddings").insertMany(matched, { ordered: false });
            await db.collection("documentchunks").updateMany(
              { _id: { $in: succeededIds } },
              { $set: { status: "EMBEDDED" } },
            );
          }

          const batchFailed = batch.length - matched.length;
          embeddedCount += matched.length;
          failedCount += batchFailed;
          totalTokens += batchTokens;
          totalCostUsd += batchCost;

          if (batchFailed > 0) {
            ctx.progress(`Partial batch failure: ${matched.length}/${batch.length} embedded`, {
              batchSize: batch.length,
              succeeded: matched.length,
              failed: batchFailed,
            });
          }
        } catch {
          failedCount += batch.length;
          ctx.progress(`Batch embedding failed`, { batchSize: batch.length });
          throw new RetryableJobError(
            `Embedding batch failed (${batch.length} chunks)`,
          );
        }
      }

      if (failedCount > 0 && embeddedCount === 0) {
        await reportProgressToProcessingRun({
          tenantId: payload.tenantId,
          documentId: payload.documentId,
          documentVersion: payload.documentVersion,
          stageName: "embedding",
          status: "failed",
          errorCode: "ALL_BATCHES_FAILED",
          errorMessage: `All embedding batches failed (${failedCount} chunks)`,
        });
        throw new RetryableJobError(
          `All embedding batches failed (${failedCount} chunks)`,
        );
      }

      await db.collection("indexgenerations").updateOne(
        { _id: generationId, tenantId },
        {
          $set: {
            expectedEmbeddingCount: chunks.length,
            actualEmbeddingCount: embeddedCount,
          },
        },
      );

      ctx.progress("Embedding completed", {
        embeddedCount,
        failedCount,
        totalTokens,
        totalCostUsd: Math.round(totalCostUsd * 10000) / 10000,
        model: provider.model,
        durationMs: Date.now() - startTime,
        metric: "indexing.embedding_duration_ms",
      });

      await reportProgressToProcessingRun({
        tenantId: payload.tenantId,
        documentId: payload.documentId,
        documentVersion: payload.documentVersion,
        stageName: "embedding",
        status: "completed",
        progress: 100,
      });

      try {
        await ctx.enqueue({
          jobType: "document.index",
          tenantId: payload.tenantId,
          actorId: "system",
          traceId: ctx.traceId,
          idempotencyKey: `${payload.documentId}-${payload.documentVersion}-index-${payload.generationId}`,
          payload: {
            documentId: payload.documentId,
            tenantId: payload.tenantId,
            documentVersion: payload.documentVersion,
            generationId: payload.generationId,
          },
        });
        ctx.progress("Auto-triggered indexing pipeline after embedding.");
      } catch (err) {
        ctx.progress(`Failed to auto-trigger indexing: ${err instanceof Error ? err.message : String(err)}`);
      }

      return {
        summary: {
          success: failedCount === 0,
          embeddedCount,
          failedCount,
        },
      };
    },
  };
}
