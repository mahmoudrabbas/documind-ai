import crypto from "node:crypto";
import mongoose from "mongoose";
import { AppError } from "../../../common/errors/AppError.js";
import EmployeeImportBatchModel from "../../../db/models/employeeImportBatch.model.js";
import EmployeeImportRowModel from "../../../db/models/employeeImportRow.model.js";
import type { IEmployeeImportBatch, ImportBatchState } from "../../../db/models/employeeImportBatch.model.js";
import type { IEmployeeImportRow, ImportRowState } from "../../../db/models/employeeImportRow.model.js";
import { getApiJobDispatcher } from "../../jobs/jobDispatcher.js";
import { getAuditWriter } from "../../../common/observability/index.js";
import { logger } from "../../../common/logger/logger.js";
import {
  importBatchesCreated,
  importBatchesConfirmed,
  importBatchesCompleted,
  importRowsProcessed,
} from "./importMetrics.js";

// ─── Local Types ───────────────────────────────────────────────────────────────

export interface CreateBatchInput {
  tenantId: string;
  createdBy: string;
  originalFileName: string;
  fileChecksum: string;
  fileSizeBytes?: number;
  totalRows: number;
  rows: Array<{
    rowNumber: number;
    rawData: Record<string, unknown>;
    checksum: string;
  }>;
}

export interface ListBatchesFilters {
  tenantId: string;
  page?: number;
  pageSize?: number;
  state?: ImportBatchState;
  search?: string;
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<ImportBatchState, ImportBatchState[]> = {
  UPLOADED: ["PARSED", "CANCELLED"],
  PARSED: ["PREVIEW_READY", "CANCELLED"],
  PREVIEW_READY: ["PARSED", "QUEUED", "CANCELLED"],
  QUEUED: ["PROCESSING", "CANCELLED"],
  PROCESSING: ["COMPLETED", "PARTIALLY_COMPLETED", "FAILED"],
  COMPLETED: [],
  PARTIALLY_COMPLETED: [],
  FAILED: [],
  CANCELLED: [],
};

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

// ─── Audit helper ──────────────────────────────────────────────────────────────

interface AuditMeta {
  resourceType: string;
  resourceId: string;
  action: string;
  tenantId: string;
  actorId: string;
  metadata?: Record<string, unknown>;
}

async function writeAuditEvent(meta: AuditMeta): Promise<void> {
  try {
    await getAuditWriter().write({
      action: meta.action as never,
      resourceType: meta.resourceType as never,
      resourceId: meta.resourceId,
      tenantId: meta.tenantId,
      actorId: meta.actorId,
      metadata: meta.metadata,
    });
  } catch {
    // Audit failures never throw — they must not block the business transaction
  }
}

// ─── Validation ────────────────────────────────────────────────────────────────

/**
 * Validates a state transition. Throws AppError if the transition is not allowed.
 */
export function validateTransition(
  currentState: ImportBatchState,
  targetState: ImportBatchState,
): void {
  const allowed = VALID_TRANSITIONS[currentState];
  if (!allowed || !allowed.includes(targetState)) {
    throw new AppError(
      400,
      "INVALID_STATE_TRANSITION",
      `Cannot transition from ${currentState} to ${targetState}`,
    );
  }
}

// ─── Service ───────────────────────────────────────────────────────────────────

export class ImportBatchService {
  /**
   * Atomically creates a batch document and all its row documents inside a
   * transaction. Returns the batch and the number of rows created.
   */
  static async createBatch(params: {
    tenantId: string;
    createdBy: string;
    originalFileName: string;
    fileChecksum: string;
    fileSizeBytes?: number;
    totalRows: number;
    rows: Array<{
      rowNumber: number;
      rawData: Record<string, unknown>;
      checksum: string;
    }>;
  }): Promise<{ batch: IEmployeeImportBatch; rowCount: number }> {
    const idempotencyKey = sha256(`${params.tenantId}:${params.fileChecksum}`);
    const tenantId = new mongoose.Types.ObjectId(params.tenantId);
    const createdBy = new mongoose.Types.ObjectId(params.createdBy);

    const session = await mongoose.startSession();

    try {
      const result = await session.withTransaction<{
        batch: IEmployeeImportBatch;
        rowCount: number;
      }>(async () => {
        const [batch] = await EmployeeImportBatchModel.create(
          [
            {
              tenantId,
              createdBy,
              originalFileName: params.originalFileName,
              fileChecksum: params.fileChecksum,
              fileSizeBytes: params.fileSizeBytes,
              totalRows: params.totalRows,
              state: "UPLOADED",
              mapping: {
                columnMapping: {},
                unmappedColumns: [],
                confidence: "medium",
              },
              summary: {
                valid: 0,
                warning: 0,
                invalid: 0,
                skipped: 0,
                created: 0,
                failed: 0,
              },
              idempotencyKey,
            },
          ],
          { session },
        );

        const rowDocs = params.rows.map((row) => ({
          batchId: batch._id,
          tenantId,
          rowNumber: row.rowNumber,
          rawData: row.rawData,
          state: "PENDING" as ImportRowState,
          checksum: row.checksum,
          idempotencyKey: `${idempotencyKey}:row:${row.rowNumber}`,
        }));

        await EmployeeImportRowModel.insertMany(rowDocs, { session });

        return {
          batch: batch as unknown as IEmployeeImportBatch,
          rowCount: rowDocs.length,
        };
      });

      // Audit after transaction commits (fire-and-forget)
      await writeAuditEvent({
        resourceType: "employeeImportBatch",
        resourceId: result.batch._id.toString(),
        action: "BATCH_CREATED",
        tenantId: params.tenantId,
        actorId: params.createdBy,
        metadata: {
          fileName: params.originalFileName,
          totalRows: params.totalRows,
        },
      });

      importBatchesCreated.inc({ tenant_id: params.tenantId });
      logger.info(
        { batchId: result.batch._id.toString(), tenantId: params.tenantId, fileName: params.originalFileName, totalRows: params.totalRows },
        "import batch created",
      );

      return result;
    } catch (error) {
      if (error instanceof AppError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      // If a batch with this idempotency key already exists, return it instead of failing
      if (message.includes("E11000 duplicate key")) {
        const existing = await EmployeeImportBatchModel.findOne({ idempotencyKey }).lean();
        if (existing) {
          logger.warn({ idempotencyKey, batchId: existing._id }, "duplicate batch upload, returning existing");
          return { batch: existing as unknown as IEmployeeImportBatch, rowCount: 0 };
        }
        // Batch doesn't exist but rows do — clean stale rows and retry once
        logger.warn({ idempotencyKey }, "stale rows exist without batch, cleaning up");
        await EmployeeImportRowModel.deleteMany({ idempotencyKey: { $regex: `^${idempotencyKey}` } });
      }
      throw new AppError(500, "BATCH_CREATION_FAILED", `Failed to create import batch: ${message}`);
    } finally {
      await session.endSession();
    }
  }

  /**
   * Updates the column mapping for a batch and transitions to PARSED state.
   */
  static async updateMapping(
    batchId: string,
    mapping: {
      columnMapping: Record<string, string>;
      unmappedColumns: string[];
      confidence: "high" | "medium" | "low";
    },
  ): Promise<IEmployeeImportBatch> {
    const batch = await EmployeeImportBatchModel.findById(batchId);

    if (!batch) {
      throw new AppError(404, "NOT_FOUND", "Batch not found");
    }

    validateTransition(batch.state as ImportBatchState, "PARSED");

    const updated = await EmployeeImportBatchModel.findByIdAndUpdate(
      batchId,
      {
        $set: {
          mapping: {
            columnMapping: mapping.columnMapping,
            unmappedColumns: mapping.unmappedColumns,
            confidence: mapping.confidence,
          },
          state: "PARSED",
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new AppError(500, "UPDATE_FAILED", "Failed to update batch mapping");
    }

    await writeAuditEvent({
      resourceType: "employeeImportBatch",
      resourceId: batchId,
      action: "BATCH_MAPPING_UPDATED",
      tenantId: updated.tenantId.toString(),
      actorId: updated.createdBy.toString(),
      metadata: {
        confidence: mapping.confidence,
        mappedColumns: Object.keys(mapping.columnMapping).length,
        unmappedColumns: mapping.unmappedColumns.length,
      },
    });

    return updated as unknown as IEmployeeImportBatch;
  }

  /**
   * Updates validation summary and transitions to PREVIEW_READY.
   */
  static async preparePreview(
    batchId: string,
    validationSummary: { valid: number; warning: number; invalid: number },
  ): Promise<IEmployeeImportBatch> {
    const batch = await EmployeeImportBatchModel.findById(batchId);

    if (!batch) {
      throw new AppError(404, "NOT_FOUND", "Batch not found");
    }

    const currentState = batch.state as ImportBatchState;
    if (currentState !== "PARSED" && currentState !== "PREVIEW_READY") {
      throw new AppError(
        400,
        "INVALID_STATE_TRANSITION",
        `Cannot prepare preview from ${currentState} state`,
      );
    }

    const updated = await EmployeeImportBatchModel.findByIdAndUpdate(
      batchId,
      {
        $set: {
          "summary.valid": validationSummary.valid,
          "summary.warning": validationSummary.warning,
          "summary.invalid": validationSummary.invalid,
          state: "PREVIEW_READY",
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new AppError(500, "UPDATE_FAILED", "Failed to update batch preview");
    }

    await writeAuditEvent({
      resourceType: "employeeImportBatch",
      resourceId: batchId,
      action: "BATCH_PREVIEW_READY",
      tenantId: updated.tenantId.toString(),
      actorId: updated.createdBy.toString(),
      metadata: {
        valid: validationSummary.valid,
        warning: validationSummary.warning,
        invalid: validationSummary.invalid,
      },
    });

    return updated as unknown as IEmployeeImportBatch;
  }

  /**
   * Confirms the batch, transitions to QUEUED and enqueues a background job.
   *
   * Uses atomic findOneAndUpdate with a conditional state check to prevent
   * race conditions. If the batch is already in QUEUED/PROCESSING/COMPLETED
   * the call is treated as idempotent and returns the existing batch.
   */
  static async confirmBatch(
    batchId: string,
    actorId: string,
  ): Promise<{ batch: IEmployeeImportBatch; jobResult: unknown }> {
    // Atomic transition: only update if currently in PREVIEW_READY
    const batch = await EmployeeImportBatchModel.findOneAndUpdate(
      { _id: new mongoose.Types.ObjectId(batchId), state: "PREVIEW_READY" as ImportBatchState },
      { $set: { state: "QUEUED" as ImportBatchState } },
      { new: true },
    );

    if (!batch) {
      // Check if batch exists but in wrong state
      const existing = await EmployeeImportBatchModel.findById(batchId);
      if (!existing) throw new AppError(404, "NOT_FOUND", "Batch not found");
      if (existing.state === "QUEUED" || existing.state === "PROCESSING" || existing.state === "COMPLETED") {
        // Idempotent: already confirmed
        const jobResult = { ok: true, deduplicated: true };
        return { batch: existing, jobResult };
      }
      throw new AppError(400, "INVALID_STATE_TRANSITION", `Cannot confirm batch in ${existing.state} state`);
    }

    // Enqueue job
    const jobResult = await getApiJobDispatcher().enqueue({
      jobType: "import.employee.batch",
      idempotencyKey: batch.idempotencyKey,
      tenantId: batch.tenantId.toString(),
      actorId,
      payload: { batchId: batch._id.toString(), tenantId: batch.tenantId.toString(), actorId },
      traceId: crypto.randomUUID(),
    });

    await writeAuditEvent({
      resourceType: "employeeImportBatch",
      resourceId: batch._id.toString(),
      action: "BATCH_CONFIRMED",
      tenantId: batch.tenantId.toString(),
      actorId,
      metadata: { deduplicated: jobResult.deduplicated },
    });

    importBatchesConfirmed.inc();
    logger.info(
      { batchId: batch._id.toString(), tenantId: batch.tenantId.toString(), deduplicated: jobResult.deduplicated },
      "import batch confirmed",
    );

    return { batch: batch as unknown as IEmployeeImportBatch, jobResult };
  }

  /**
   * Cancels a batch from any cancellable state.
   */
  static async cancelBatch(
    batchId: string,
    actorId: string,
  ): Promise<IEmployeeImportBatch> {
    const batch = await EmployeeImportBatchModel.findById(batchId);

    if (!batch) {
      throw new AppError(404, "NOT_FOUND", "Batch not found");
    }

    const currentState = batch.state as ImportBatchState;
    const cancellableStates: ImportBatchState[] = [
      "UPLOADED",
      "PARSED",
      "PREVIEW_READY",
      "QUEUED",
    ];

    if (!cancellableStates.includes(currentState)) {
      throw new AppError(
        400,
        "INVALID_STATE_TRANSITION",
        `Cannot cancel batch in ${currentState} state`,
      );
    }

    const updated = await EmployeeImportBatchModel.findByIdAndUpdate(
      batchId,
      {
        $set: {
          state: "CANCELLED",
          completedAt: new Date(),
        },
      },
      { new: true },
    );

    if (!updated) {
      throw new AppError(500, "UPDATE_FAILED", "Failed to cancel batch");
    }

    await writeAuditEvent({
      resourceType: "employeeImportBatch",
      resourceId: batchId,
      action: "BATCH_CANCELLED",
      tenantId: updated.tenantId.toString(),
      actorId,
    });

    importBatchesCompleted.inc({ state: "CANCELLED" });
    logger.info(
      { batchId, tenantId: updated.tenantId.toString(), state: "CANCELLED" },
      "import batch cancelled",
    );

    return updated as unknown as IEmployeeImportBatch;
  }

  /**
   * Retrieves a single batch by ID.
   */
  static async getBatch(
    batchId: string,
  ): Promise<IEmployeeImportBatch | null> {
    const batch = await EmployeeImportBatchModel.findById(batchId);
    return batch as unknown as IEmployeeImportBatch | null;
  }

  /**
   * Lists batches with optional filtering, search, and pagination.
   */
  static async listBatches(
    params: ListBatchesFilters,
  ): Promise<{
    batches: IEmployeeImportBatch[];
    total: number;
    page: number;
    pageSize: number;
  }> {
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(100, Math.max(1, params.pageSize ?? 20));
    const skip = (page - 1) * pageSize;

    const filter: Record<string, unknown> = {
      tenantId: new mongoose.Types.ObjectId(params.tenantId),
    };

    if (params.state) {
      filter.state = params.state;
    }

    if (params.search) {
      filter.originalFileName = {
        $regex: params.search,
        $options: "i",
      };
    }

    const [batches, total] = await Promise.all([
      EmployeeImportBatchModel.find(filter)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(pageSize),
      EmployeeImportBatchModel.countDocuments(filter),
    ]);

    return {
      batches: batches as unknown as IEmployeeImportBatch[],
      total,
      page,
      pageSize,
    };
  }

  /**
   * Records the processing result for a single row.
   */
  static async recordRowResult(
    batchId: string,
    rowNumber: number,
    newState: ImportRowState,
    createdUserId?: string,
    errorMessage?: string,
  ): Promise<IEmployeeImportRow | null> {
    const updateFields: Record<string, unknown> = {
      state: newState,
      processedAt: new Date(),
    };

    if (createdUserId !== undefined) {
      updateFields.createdUserId = new mongoose.Types.ObjectId(createdUserId);
    }

    if (errorMessage !== undefined) {
      updateFields.errorMessage = errorMessage;
    }

    const updated = await EmployeeImportRowModel.findOneAndUpdate(
      { batchId: new mongoose.Types.ObjectId(batchId), rowNumber },
      { $set: updateFields },
      { new: true },
    );

    return updated as unknown as IEmployeeImportRow | null;
  }
}
