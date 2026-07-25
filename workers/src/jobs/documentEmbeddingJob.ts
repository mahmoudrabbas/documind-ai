import { z } from "zod";
import { ObjectId } from "mongodb";
import { createHash } from "node:crypto";
import type { JobHandlerDefinition, JobHandlerResult } from "../contracts/jobDispatcher.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import { getMongoClient } from "../db/mongo.js";
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
  return !CLASSIFICATIONS_BLOCKED_FROM_EXTERNAL_EMBEDDING.has(classification);
}

export function createDocumentEmbeddingJobHandler(): JobHandlerDefinition<EmbeddingPayload> {
  return {
    jobType: "document.embed",
    description: "Generates vector embeddings for document chunks.",
    payloadSchema: PayloadSchema,
    maxAttempts: 3,
    handle: async (payload, ctx): Promise<JobHandlerResult | void> => {
      const startTime = Date.now();
      const db = getMongoClient()?.db();
      if (!db) throw new RetryableJobError("Database connection unavailable");

      const tenantId = new ObjectId(payload.tenantId);
      const generationId = new ObjectId(payload.generationId);
      const documentId = new ObjectId(payload.documentId);

      const chunks = await db.collection("documentchunks")
        .find({ tenantId, generationId, status: "DRAFT" })
        .toArray();

      if (chunks.length === 0) {
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

        throw new PermanentJobError(
          `Classification "${blockedClassification}" is not permitted for external embedding provider`,
        );
      }

      ctx.progress("Starting embedding...", { chunkCount: chunks.length });

      const provider = createEmbeddingProvider();

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

          const embeddings = results.map((result, idx) => {
            const chunk = batch[idx];
            return {
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
              classification: chunk.classification ?? null,
              accessPolicyVersion: null,
              language: chunk.language || "en",
              contentType: chunk.contentType || "paragraph",
              tokenUsage: result.tokenUsage,
              costUsd: result.costUsd,
              createdAt: new Date(),
            };
          });

          await db.collection("chunkembeddings").insertMany(embeddings, { ordered: false });

          await db.collection("documentchunks").updateMany(
            { _id: { $in: batch.map((c) => c._id) } },
            { $set: { status: "EMBEDDED" } },
          );
          embeddedCount += batch.length;
          for (const result of results) {
            totalTokens += result.tokenUsage;
            totalCostUsd += result.costUsd;
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
