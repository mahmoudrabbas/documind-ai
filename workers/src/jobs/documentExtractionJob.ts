import { z } from "zod";
import { ObjectId } from "mongodb";
import * as crypto from "node:crypto";
import { JobHandlerDefinition, JobHandlerResult } from "../contracts/jobDispatcher.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import { parserRegistry } from "../providers/extraction/parserRegistry.js";
import { getMongoClient } from "../db/mongo.js";
import { reportProgressToProcessingRun } from "./progressReporter.js";
import { storageProvider } from "../providers/storage/index.js";

const PayloadSchema = z.object({
  documentId: z.string(),
  tenantId: z.string(),
  documentVersion: z.number().int().positive(),
});

type DocumentExtractionPayload = z.infer<typeof PayloadSchema>;

export function createDocumentExtractionJobHandler(): JobHandlerDefinition<DocumentExtractionPayload> {
  return {
    jobType: "document.extract",
    description: "Extracts structured text and layout blocks from PDF, DOCX, and TXT files.",
    payloadSchema: PayloadSchema,
    maxAttempts: 3,
    handle: async (payload, ctx): Promise<JobHandlerResult | void> => {
      const db = getMongoClient()?.db();
      if (!db) {
        throw new RetryableJobError("Database connection unavailable");
      }

      const documentId = new ObjectId(payload.documentId);
      const tenantId = new ObjectId(payload.tenantId);

      // 1. Fetch document version record
      const version = await db.collection("documentversions").findOne({
        documentId,
        version: payload.documentVersion,
        tenantId,
      });

      if (!version) {
        ctx.progress("Document version not found; skipping job execution.");
        return { summary: { discarded: true, reason: "version_not_found" } };
      }

      // 2. Fetch main document record
      const document = await db.collection("documents").findOne({
        _id: documentId,
        tenantId,
      });

      if (!document) {
        ctx.progress("Document record not found; skipping job execution.");
        return { summary: { discarded: true, reason: "document_not_found" } };
      }

      // Check for idempotency: if there is already a completed artifact with matching checksum
      const existingArtifact = await db.collection("extractionartifacts").findOne({
        tenantId,
        documentId,
        documentVersion: payload.documentVersion,
      });

      if (existingArtifact && existingArtifact.status === "completed" && existingArtifact.sourceChecksum === version.checksum) {
        ctx.progress("Extraction artifact is already completed; skipping reprocessing.");
        
        // Ensure document status is updated to processed if it's currently processing or uploaded
        if (document.status === "uploaded" || document.status === "processing") {
          await db.collection("documents").updateOne(
            { _id: documentId },
            { $set: { status: "processed" } }
          );
        }

        // Auto-trigger chunking if no active generation exists
        const existingGen = await db.collection("indexgenerations")
          .findOne({ tenantId, documentId, status: { $in: ["BUILDING", "VERIFYING", "VERIFIED", "ACTIVE"] } });
        if (!existingGen) {
          try {
            const latestGen = await db.collection("indexgenerations")
              .find({ tenantId, documentId })
              .sort({ generationNumber: -1 })
              .limit(1)
              .toArray();
            const nextGenNumber = (latestGen[0]?.generationNumber ?? 0) + 1;
            const generationId = new ObjectId();
            await db.collection("indexgenerations").insertOne({
              _id: generationId,
              tenantId,
              documentId,
              documentVersion: payload.documentVersion,
              generationNumber: nextGenNumber,
              status: "BUILDING",
              expectedChunkCount: 0,
              actualChunkCount: 0,
              expectedEmbeddingCount: 0,
              actualEmbeddingCount: 0,
              atlasIndexName: "vidx_chunk_embeddings_v1",
              atlasIndexStatus: "UNKNOWN",
              failureReason: null,
              triggeredBy: "INITIAL",
              chunkingConfig: {
                targetTokens: 400,
                hardCeiling: 800,
                overlap: 50,
                tokenizerVersion: "cl100k_base",
              },
              activatedAt: null,
              retiredAt: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            });
            await db.collection("documents").updateOne(
              { _id: documentId },
              { $set: { searchStatus: "INDEXING" } },
            );
            await ctx.enqueue({
              jobType: "document.chunk",
              tenantId: payload.tenantId,
              actorId: "system",
              traceId: ctx.traceId,
              idempotencyKey: `${payload.documentId}-${payload.documentVersion}-chunk-${generationId.toString()}`,
              payload: {
                documentId: payload.documentId,
                tenantId: payload.tenantId,
                documentVersion: payload.documentVersion,
                generationId: generationId.toString(),
                department: document.department ?? null,
                classification: document.classification ?? null,
                chunkingConfig: {
                  targetTokens: 400,
                  hardCeiling: 800,
                  overlap: 50,
                  tokenizerVersion: "cl100k_base",
                },
              },
            });
            ctx.progress("Auto-triggered chunking pipeline after extraction.");
        } catch (err) {
          ctx.progress(`Failed to auto-trigger chunking: ${err instanceof Error ? err.message : String(err)}`);
        }
        }

        return { summary: { skipped: true, reason: "already_completed" } };
      }

      // 3. Mark document status as processing
      await db.collection("documents").updateOne(
        { _id: documentId },
        { $set: { status: "processing" } }
      );

      await reportProgressToProcessingRun({
        tenantId: payload.tenantId,
        documentId: payload.documentId,
        documentVersion: payload.documentVersion,
        stageName: "extraction",
        status: "running",
        progress: 10,
        jobId: ctx.envelope?.jobType,
      });

      // 4. Update/Upsert the ExtractionArtifact record to 'extracting'
      const artifactId = existingArtifact ? existingArtifact._id : new ObjectId();
      await db.collection("extractionartifacts").updateOne(
        { _id: artifactId },
        {
          $set: {
            tenantId,
            documentId,
            documentVersion: payload.documentVersion,
            sourceChecksum: version.checksum,
            parserName: "pending",
            parserVersion: "pending",
            status: "extracting",
            pages: [],
            metadata: {
              totalPages: 0,
              totalCharacters: 0,
              detectedLanguages: [],
              warnings: [],
              hasImageOnlyPages: false,
            },
            failureReason: null,
            failureCode: null,
            artifactChecksum: null,
            durationMs: null,
            updatedAt: new Date(),
          },
          $setOnInsert: {
            createdAt: new Date(),
          }
        },
        { upsert: true }
      );

      // 5. Read file from storage provider
      const storageKey = version.storageKey as string;
      let buffer: Buffer;
      try {
        buffer = await storageProvider.getFileBuffer(storageKey);
      } catch (err: unknown) {
        ctx.progress(`Failed to read file for key: ${storageKey}`);
        
        const error = err instanceof Error ? err : new Error(String(err));
        const nodeErr = err as NodeJS.ErrnoException;
        const isNotFound = nodeErr?.code === "ENOENT" || error.message.includes("ENOENT") || error.message.includes("not found");
        const failureCode = isNotFound ? "resource_limit" : "timeout";
        const reason = isNotFound ? "Source file not found in storage" : `IO Error: ${error.message}`;
        
        await db.collection("extractionartifacts").updateOne(
          { _id: artifactId },
          {
            $set: {
              status: "failed",
              failureCode,
              failureReason: reason,
              updatedAt: new Date(),
            }
          }
        );

        await db.collection("documents").updateOne(
          { _id: documentId },
          { $set: { status: "failed" } }
        );

        if (nodeErr.code === "ENOENT") {
          throw new PermanentJobError(reason);
        } else {
          throw new RetryableJobError(reason);
        }
      }

      // 6. Perform the extraction using the parser registry
      ctx.progress("Starting text parser extraction...");
      const startTime = Date.now();
      try {
        const result = await parserRegistry.parse({
          buffer,
          mimeType: version.mimeType as string,
          fileName: version.fileName as string,
          tenantId: payload.tenantId,
          documentId: payload.documentId,
          documentVersion: payload.documentVersion,
        });
        const durationMs = Date.now() - startTime;

        // Generate checksum for the extracted pages block
        const artifactChecksum = crypto
          .createHash("sha256")
          .update(JSON.stringify(result.pages))
          .digest("hex");

        // 7. Success — save artifact and update document status
        await db.collection("extractionartifacts").updateOne(
          { _id: artifactId },
          {
            $set: {
              status: "completed",
              pages: result.pages,
              metadata: result.metadata,
              parserName: result.parserName,
              parserVersion: result.parserVersion,
              artifactChecksum,
              durationMs,
              failureReason: null,
              failureCode: null,
              updatedAt: new Date(),
            }
          }
        );

        await db.collection("documents").updateOne(
          { _id: documentId },
          { $set: { status: "processed" } }
        );

        await reportProgressToProcessingRun({
          tenantId: payload.tenantId,
          documentId: payload.documentId,
          documentVersion: payload.documentVersion,
          stageName: "extraction",
          status: "completed",
          progress: 100,
        });

        // Skip intermediate stages that aren't used in the basic pipeline
        for (const skipStage of ["ocr", "quality_review", "metadata_review"]) {
          await reportProgressToProcessingRun({
            tenantId: payload.tenantId,
            documentId: payload.documentId,
            documentVersion: payload.documentVersion,
            stageName: skipStage,
            status: "skipped",
            progress: 100,
          });
        }

        ctx.progress(`Extraction completed successfully in ${durationMs}ms.`);

        // Auto-trigger chunking pipeline after extraction
        try {
          const tenantObjectId = new ObjectId(payload.tenantId);

          // Get next generation number for this document
          const latestGen = await db.collection("indexgenerations")
            .find({ tenantId: tenantObjectId, documentId })
            .sort({ generationNumber: -1 })
            .limit(1)
            .toArray();
          const nextGenNumber = (latestGen[0]?.generationNumber ?? 0) + 1;

          // Create index generation record
          const generationId = new ObjectId();
          await db.collection("indexgenerations").insertOne({
            _id: generationId,
            tenantId: tenantObjectId,
            documentId,
            documentVersion: payload.documentVersion,
            generationNumber: nextGenNumber,
            status: "BUILDING",
            expectedChunkCount: 0,
            actualChunkCount: 0,
            expectedEmbeddingCount: 0,
            actualEmbeddingCount: 0,
            atlasIndexName: "vidx_chunk_embeddings_v1",
            atlasIndexStatus: "UNKNOWN",
            failureReason: null,
            triggeredBy: "INITIAL",
            chunkingConfig: {
              targetTokens: 400,
              hardCeiling: 800,
              overlap: 50,
              tokenizerVersion: "cl100k_base",
            },
            activatedAt: null,
            retiredAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          });

          // Update document search status to INDEXING
          await db.collection("documents").updateOne(
            { _id: documentId },
            { $set: { searchStatus: "INDEXING" } },
          );

          // Enqueue chunk job to start the pipeline
          await ctx.enqueue({
            jobType: "document.chunk",
            tenantId: payload.tenantId,
            actorId: "system",
            traceId: ctx.traceId,
            idempotencyKey: `${payload.documentId}-${payload.documentVersion}-chunk-${generationId.toString()}`,
            payload: {
              documentId: payload.documentId,
              tenantId: payload.tenantId,
              documentVersion: payload.documentVersion,
              generationId: generationId.toString(),
              department: document.department ?? null,
              classification: document.classification ?? null,
              chunkingConfig: {
                targetTokens: 400,
                hardCeiling: 800,
                overlap: 50,
                tokenizerVersion: "cl100k_base",
              },
            },
          });

          ctx.progress("Auto-triggered chunking pipeline after extraction.");
        } catch (err) {
          ctx.progress(`Failed to auto-trigger chunking: ${err instanceof Error ? err.message : String(err)}`);
        }

        return { summary: { success: true, pages: result.pages.length, characters: result.metadata.totalCharacters } };

      } catch (err: unknown) {
        const durationMs = Date.now() - startTime;
        const error = err instanceof Error ? err : new Error(String(err));
        ctx.progress(`Extraction failed: ${error.message}`);

        let failureCode: "encrypted" | "unsupported" | "malformed" = "malformed";
        const isPermanent = true;

        if (error.message === "encrypted") {
          failureCode = "encrypted";
        } else if (error.message === "unsupported") {
          failureCode = "unsupported";
        }

        await db.collection("extractionartifacts").updateOne(
          { _id: artifactId },
          {
            $set: {
              status: "failed",
              failureCode,
              failureReason: error.message,
              durationMs,
              updatedAt: new Date(),
            }
          }
        );

        await db.collection("documents").updateOne(
          { _id: documentId },
          { $set: { status: "failed" } }
        );

        await reportProgressToProcessingRun({
          tenantId: payload.tenantId,
          documentId: payload.documentId,
          documentVersion: payload.documentVersion,
          stageName: "extraction",
          status: "failed",
          errorCode: failureCode,
          errorMessage: error.message,
          retryable: !isPermanent,
        });

        if (isPermanent) {
          throw new PermanentJobError(`Extraction failed permanently: ${error.message}`);
        } else {
          throw new RetryableJobError(`Extraction failed temporarily: ${error.message}`);
        }
      }
    },
  };
}
