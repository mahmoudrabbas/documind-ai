import { z } from "zod";
import { ObjectId } from "mongodb";
import { readFile } from "node:fs/promises";
import * as path from "node:path";
import * as crypto from "node:crypto";
import { JobHandlerDefinition, JobHandlerResult } from "../contracts/jobDispatcher.js";
import { RetryableJobError, PermanentJobError } from "../contracts/retryPolicy.js";
import { config } from "../config/index.js";
import { parserRegistry } from "../providers/extraction/parserRegistry.js";
import { getMongoClient } from "../db/mongo.js";

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
        return { summary: { skipped: true, reason: "already_completed" } };
      }

      // 3. Mark document status as processing
      await db.collection("documents").updateOne(
        { _id: documentId },
        { $set: { status: "processing" } }
      );

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

      // 5. Read file from disk storage
      const filePath = path.join(config.UPLOAD_DIR, version.storageKey as string);
      let buffer: Buffer;
      try {
        buffer = await readFile(filePath);
      } catch (err: unknown) {
        ctx.progress(`Failed to read file from path: ${filePath}`);
        
        const error = err instanceof Error ? err : new Error(String(err));
        const nodeErr = err as NodeJS.ErrnoException;
        const failureCode = nodeErr.code === "ENOENT" ? "resource_limit" : "timeout";
        const reason = nodeErr.code === "ENOENT" ? "Source file not found on disk" : `IO Error: ${error.message}`;
        
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

        ctx.progress(`Extraction completed successfully in ${durationMs}ms.`);
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

        if (isPermanent) {
          throw new PermanentJobError(`Extraction failed permanently: ${error.message}`);
        } else {
          throw new RetryableJobError(`Extraction failed temporarily: ${error.message}`);
        }
      }
    },
  };
}
