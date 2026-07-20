import * as XLSX from "xlsx";
import mongoose from "mongoose";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "../../common/errors/AppError.js";
import { generateEmployeeTemplate } from "./services/templateGenerator.service.js";
import { parseEmployeeSpreadsheet, type ParsedRow } from "./services/xlsxParser.service.js";
import { resolveColumnMappings } from "./services/mappingResolver.service.js";
import { validateBatch, type ResolvedMapping, type ValidationContext } from "./services/validationEngine.service.js";
import { generatePreview } from "./services/previewGenerator.service.js";
import { ImportBatchService } from "./services/importBatch.service.js";
import { getApiJobDispatcher } from "../jobs/jobDispatcher.js";
import User from "../../db/models/user.model.js";
import {
  uploadMappingUpdateSchema,
  confirmImportSchema,
  listBatchesQuerySchema,
  retryRowsSchema,
  exportQuerySchema,
} from "./imports.validator.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function extractBatchId(params: Record<string, string | string[]>): string {
  const id = Array.isArray(params.batchId) ? params.batchId[0] : params.batchId;
  if (!id) {
    throw new AppError(400, "BAD_REQUEST", "Missing batchId parameter");
  }
  return id;
}

function toBatchDTO(batch: Record<string, unknown>): Record<string, unknown> {
  const raw = batch;
  const s = (raw.summary ?? {}) as Record<string, number>;
  const mapping = raw.mapping as Record<string, unknown> | undefined;
  return {
    id: String(raw._id ?? raw.id ?? ""),
    status: String(raw.state ?? ""),
    originalFileName: String(raw.originalFileName ?? raw.fileName ?? ""),
    fileChecksum: String(raw.fileChecksum ?? ""),
    fileSizeBytes: (raw.fileSizeBytes as number) ?? 0,
    totalRows: (raw.totalRows as number) ?? 0,
    state: String(raw.state ?? ""),
    idempotencyKey: String(raw.idempotencyKey ?? ""),
    columnMapping: (mapping?.columnMapping as Record<string, string>) ?? {},
    unmappedColumns: (mapping?.unmappedColumns as string[]) ?? [],
    confidence: String(mapping?.confidence ?? ""),
    createdAt: raw.createdAt,
    updatedAt: raw.updatedAt,
    summary: {
      totalRows: raw.totalRows ?? 0,
      validRows: s.valid ?? 0,
      warningRows: s.warning ?? 0,
      invalidRows: s.invalid ?? 0,
      createdCount: s.created ?? 0,
      failedCount: s.failed ?? 0,
    },
  };
}

// ---------------------------------------------------------------------------
// 1. downloadTemplate — GET /template
// ---------------------------------------------------------------------------

export async function downloadTemplate(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    const buffer = generateEmployeeTemplate(true);

    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="employee-import-template.xlsx"',
    );
    res.status(200).send(buffer);
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 2. uploadAndPreview — POST /upload
// ---------------------------------------------------------------------------

export async function uploadAndPreview(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const file = req.file;
    if (!file) {
      throw new AppError(400, "BAD_REQUEST", "No file uploaded");
    }

    const parsed = parseEmployeeSpreadsheet(file.buffer, file.originalname);

    const proposal = resolveColumnMappings(parsed.headers);

    const fieldMap: Record<string, string> = {};
    let mappedCount = 0;
    let confidence: "high" | "medium" | "low" = "high";

    for (const mapping of proposal.columnMappings) {
      if (mapping.targetField) {
        fieldMap[mapping.excelHeader] = mapping.targetField;
        mappedCount++;
        if (mapping.confidence === "low") confidence = "low";
        else if (mapping.confidence === "medium" && confidence !== "low") confidence = "medium";
      }
    }

    const resolvedMapping: ResolvedMapping = {
      fieldMap,
      unmappedHeaders: proposal.unmappedHeaders,
      mappedCount,
      totalHeaders: proposal.columnMappings.length,
      confidence,
    };

    const tenantUsers = await User.find({ tenantId: req.tenantId }).lean();
    const existingEmails = new Set<string>();
    const existingUserIds = new Map<string, string>();
    for (const u of tenantUsers) {
      if (u.email) existingEmails.add(u.email);
      if (u.email && u._id) existingUserIds.set(u.email, u._id.toString());
    }

    const validationContext: ValidationContext = {
      tenantId: req.tenantId,
      existingEmails,
      existingUserIds,
      tenantUserLimit: Number.MAX_SAFE_INTEGER,
    };

    const validation = await validateBatch({
      tenantId: req.tenantId,
      rows: parsed.rows,
      mapping: resolvedMapping,
      context: validationContext,
    });

    const { batch, rowCount } = await ImportBatchService.createBatch({
      tenantId: req.tenantId,
      createdBy: req.auth.userId,
      originalFileName: file.originalname,
      fileChecksum: parsed.fileChecksum,
      fileSizeBytes: file.size,
      totalRows: parsed.totalRows,
      rows: parsed.rows.map((row) => ({
        rowNumber: row.rowNumber,
        rawData: row.rawData,
        checksum: row.checksum,
      })),
    });

    const batchId = batch._id.toString();

    if (rowCount === 0) {
      const RowModel = (await import("../../db/models/employeeImportRow.model.js")).default;
      const existingRows = await RowModel.find({ batchId: new mongoose.Types.ObjectId(batchId) }).sort({ rowNumber: 1 }).lean();
      const columns = existingRows[0] ? Object.keys(existingRows[0].rawData ?? {}) : [];

      res.status(200).json({
        success: true,
        data: {
          batchId,
          originalFileName: batch.originalFileName ?? file.originalname,
          totalRows: batch.totalRows ?? 0,
          suggestedMapping: (batch.mapping as Record<string, unknown>)?.columnMapping ?? {},
          columns,
          rows: existingRows.map((row) => ({
            rowNumber: row.rowNumber,
            state: row.state,
            data: row.rawData,
            errors: row.validationErrors?.length > 0 ? row.validationErrors : undefined,
            warnings: row.validationWarnings?.length > 0 ? row.validationWarnings : undefined,
          })),
          summary: {
            totalRows: (batch.summary?.valid ?? 0) + (batch.summary?.warning ?? 0) + (batch.summary?.invalid ?? 0),
            validRows: batch.summary?.valid ?? 0,
            warningRows: batch.summary?.warning ?? 0,
            invalidRows: batch.summary?.invalid ?? 0,
            createdCount: 0,
            failedCount: 0,
          },
        },
      });
      return;
    }

    // New batch — save mapping and transition to PARSED
    await ImportBatchService.updateMapping(batchId, {
      columnMapping: fieldMap,
      unmappedColumns: proposal.unmappedHeaders,
      confidence,
    });

    const rawPreview = generatePreview({
      batchId,
      fileName: file.originalname,
      rows: parsed.rows,
      validation,
      mapping: resolvedMapping,
      existingUserCount: 0,
      planLimit: Number.MAX_SAFE_INTEGER,
    });

    // Transition to PREVIEW_READY so confirmImport can proceed
    await ImportBatchService.preparePreview(batchId, rawPreview.summary);

    const columns = parsed.headers;

    const suggestedMapping: Record<string, string> = {};
    for (const mapping of proposal.columnMappings) {
      if (mapping.targetField) {
        suggestedMapping[mapping.excelHeader] = mapping.targetField;
      }
    }

    const rows = rawPreview.rows.map((row) => ({
      rowNumber: row.rowNumber,
      state: row.state,
      data: row.mapped,
      errors: row.errors.length > 0 ? row.errors.map((e) => (typeof e === "string" ? e : e.message ?? String(e))) : undefined,
      warnings: row.warnings.length > 0 ? row.warnings.map((w) => (typeof w === "string" ? w : w.message ?? String(w))) : undefined,
    }));

    res.status(201).json({
      success: true,
      data: {
        batchId: rawPreview.batchId,
        originalFileName: file.originalname,
        totalRows: rawPreview.totalRows,
        suggestedMapping,
        columns,
        rows,
        summary: {
          totalRows: rawPreview.summary.total,
          validRows: rawPreview.summary.valid,
          warningRows: rawPreview.summary.warning,
          invalidRows: rawPreview.summary.invalid,
          createdCount: 0,
          failedCount: 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 3. updateMapping — PUT /:batchId/mapping
// ---------------------------------------------------------------------------

export async function updateMapping(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const parsed = uploadMappingUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid mapping update", parsed.error.issues);
    }

    const batchId = extractBatchId(req.params);
    const columnMapping: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed.data)) {
      if (value !== null) {
        columnMapping[key] = value;
      }
    }
    const updatedBatch = await ImportBatchService.updateMapping(batchId, {
      columnMapping,
      unmappedColumns: [],
      confidence: "medium",
    });

    // ── Build fresh ResolvedMapping from the new columnMapping ─────────────
    const resolvedMapping: ResolvedMapping = {
      fieldMap: columnMapping,
      unmappedHeaders: [],
      mappedCount: Object.keys(columnMapping).length,
      totalHeaders: Object.keys(columnMapping).length,
      confidence: "medium",
    };

    // ── Fetch stored rows ──────────────────────────────────────────────────
    const EmployeeImportRowModel = (await import("../../db/models/employeeImportRow.model.js")).default;
    const storedRows = await EmployeeImportRowModel.find({ batchId: new mongoose.Types.ObjectId(batchId) }).sort({ rowNumber: 1 }).lean();

    // ── Reconstruct ParsedRow[] from stored rawData ────────────────────────
    const parsedRows: ParsedRow[] = storedRows.map((row) => ({
      rowNumber: row.rowNumber,
      rawData: (row.rawData ?? {}) as Record<string, string>,
      checksum: row.checksum ?? "",
    }));

    // ── Build validation context from DB users ─────────────────────────────
    const tenantUsers = await User.find({ tenantId: req.tenantId }).lean();
    const existingEmails = new Set<string>();
    const existingUserIds = new Map<string, string>();
    for (const u of tenantUsers) {
      if (u.email) existingEmails.add(u.email);
      if (u.email && u._id) existingUserIds.set(u.email, u._id.toString());
    }

    const validationContext: ValidationContext = {
      tenantId: req.tenantId,
      existingEmails,
      existingUserIds,
      tenantUserLimit: Number.MAX_SAFE_INTEGER,
    };

    // ── Re-validate every row with the new mapping ────────────────────────
    const validation = await validateBatch({
      tenantId: req.tenantId,
      rows: parsedRows,
      mapping: resolvedMapping,
      context: validationContext,
    });

    const columns = Object.keys(columnMapping);
    const rows = validation.rows.map((vr) => {
      const stored = storedRows.find((s) => s.rowNumber === vr.rowNumber);
      return {
        rowNumber: vr.rowNumber,
        state: vr.state,
        data: (stored?.rawData ?? {}) as Record<string, string>,
        errors: vr.errors.length > 0 ? vr.errors.map((e) => e.message) : undefined,
        warnings: vr.warnings.length > 0 ? vr.warnings.map((w) => w.message) : undefined,
      };
    });

    // Transition back to PREVIEW_READY so confirmImport can proceed
    await ImportBatchService.preparePreview(batchId, validation.summary);

    res.status(200).json({
      success: true,
      data: {
        batchId,
        originalFileName: updatedBatch.originalFileName,
        totalRows: rows.length,
        suggestedMapping: columnMapping,
        columns,
        rows,
        summary: {
          totalRows: rows.length,
          validRows: validation.summary.valid,
          warningRows: validation.summary.warning,
          invalidRows: validation.summary.invalid,
          createdCount: 0,
          failedCount: 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 4. confirmImport — POST /:batchId/confirm
// ---------------------------------------------------------------------------

export async function confirmImport(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const parsed = confirmImportSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid confirm request", parsed.error.issues);
    }

    const batchId = extractBatchId(req.params);
    const result = await ImportBatchService.confirmBatch(batchId, req.auth.userId);

    res.status(200).json({
      success: true,
      data: {
        ...toBatchDTO(result.batch as unknown as Record<string, unknown>),
        jobResult: result.jobResult,
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 5. getBatchStatus — GET /:batchId
// ---------------------------------------------------------------------------

export async function getBatchStatus(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const batchId = extractBatchId(req.params);
    const batch = await ImportBatchService.getBatch(batchId);

    if (!batch) {
      throw new AppError(404, "NOT_FOUND", "Batch not found");
    }

    res.status(200).json({
      success: true,
      data: toBatchDTO(batch as unknown as Record<string, unknown>),
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 6. listBatches — GET /
// ---------------------------------------------------------------------------

export async function listBatches(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const parsed = listBatchesQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid query parameters", parsed.error.issues);
    }

    const { page, pageSize, state, fromDate, toDate } = parsed.data;

    let search: string | undefined;
    if (fromDate || toDate) {
      const parts: string[] = [];
      if (fromDate) parts.push(`from:${fromDate}`);
      if (toDate) parts.push(`to:${toDate}`);
      search = parts.join(" ");
    }

    const result = await ImportBatchService.listBatches({
      tenantId: req.tenantId,
      page,
      pageSize,
      state,
      search,
    });

    res.status(200).json({
      success: true,
      data: {
        batches: (result.batches ?? []).map((b) => toBatchDTO(b as unknown as Record<string, unknown>)),
        pagination: {
          page: result.page,
          pageSize: result.pageSize,
          totalPages: Math.ceil((result.total ?? 0) / result.pageSize),
          totalRecords: result.total ?? 0,
        },
      },
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 7. cancelBatch — POST /:batchId/cancel
// ---------------------------------------------------------------------------

export async function cancelBatch(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const batchId = extractBatchId(req.params);
    const batch = await ImportBatchService.cancelBatch(batchId, req.auth.userId);

    res.status(200).json({
      success: true,
      data: toBatchDTO(batch as unknown as Record<string, unknown>),
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 8. retryFailedRows — POST /:batchId/retry
// ---------------------------------------------------------------------------

export async function retryFailedRows(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const parsed = retryRowsSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid retry request", parsed.error.issues);
    }

    const batchId = extractBatchId(req.params);
    const rowNumbers = parsed.data.rowNumbers;

    // ── 1. Load batch and validate state ───────────────────────────────────
    const batch = await ImportBatchService.getBatch(batchId);
    if (!batch) {
      throw new AppError(404, "NOT_FOUND", "Batch not found");
    }

    const state = batch.state as string;
    const RETRYABLE_STATES = ["PARTIALLY_COMPLETED", "FAILED", "COMPLETED"];
    if (!RETRYABLE_STATES.includes(state)) {
      throw new AppError(
        400,
        "INVALID_STATE_TRANSITION",
        `Cannot retry batch in ${state} state. Must be PARTIALLY_COMPLETED, FAILED, or COMPLETED`,
      );
    }

    // ── 2. Reset failed rows to PENDING ────────────────────────────────────
    const mongoose = (await import("mongoose")).default;
    const EmployeeImportRowModel = (await import("../../db/models/employeeImportRow.model.js")).default;
    const EmployeeImportBatchModel = (await import("../../db/models/employeeImportBatch.model.js")).default;

    const filter: Record<string, unknown> = {
      batchId: new mongoose.Types.ObjectId(batchId),
      state: "FAILED",
    };
    if (rowNumbers && rowNumbers.length > 0) {
      filter.rowNumber = { $in: rowNumbers };
    }

    const _updateResult = await EmployeeImportRowModel.updateMany(
      filter,
      { $set: { state: "PENDING", errorMessage: null, processedAt: null } },
    );

    // ── 3. Reset batch state to QUEUED (from terminal states) ──────────────
    if (state === "COMPLETED" || state === "PARTIALLY_COMPLETED") {
      await EmployeeImportBatchModel.findByIdAndUpdate(batchId, {
        $set: {
          state: "QUEUED",
          completedAt: null,
          processingStartedAt: null,
          errorMessage: null,
        },
      });
    }

    // ── 4. Enqueue a new import.employee.batch job ──────────────────────────
    const retryIdempotencyKey = `${batch.idempotencyKey}-retry-${Date.now()}`;
    const _jobResult = await getApiJobDispatcher().enqueue({
      jobType: "import.employee.batch",
      idempotencyKey: retryIdempotencyKey,
      tenantId: req.tenantId,
      actorId: req.auth.userId,
      payload: {
        batchId,
        tenantId: req.tenantId,
        actorId: req.auth.userId,
      },
      traceId: crypto.randomUUID(),
    });

    const updatedBatch = await ImportBatchService.getBatch(batchId);

    res.status(200).json({
      success: true,
      data: toBatchDTO(updatedBatch as unknown as Record<string, unknown>),
    });
  } catch (error) {
    next(error);
  }
}

// ---------------------------------------------------------------------------
// 9. exportResults — GET /:batchId/export
// ---------------------------------------------------------------------------

export async function exportResults(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  try {
    if (!req.auth || !req.tenantId) {
      throw new AppError(401, "UNAUTHORIZED", "Authentication required");
    }

    const parsed = exportQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      throw new AppError(400, "VALIDATION_ERROR", "Invalid export parameters", parsed.error.issues);
    }

    const batchId = extractBatchId(req.params);
    const { format, status } = parsed.data;

    const EmployeeImportRowModel = (await import("../../db/models/employeeImportRow.model.js")).default;
    const mongoose = (await import("mongoose")).default;

    const rowFilter: Record<string, unknown> = {
      batchId: new mongoose.Types.ObjectId(batchId),
    };
    if (status) {
      rowFilter.state = status;
    }

    const rows = await EmployeeImportRowModel.find(rowFilter).sort({ rowNumber: 1 }).lean();

    if (format === "csv") {
      const headers = rows.length > 0 ? Object.keys(rows[0].rawData as Record<string, unknown>) : [];
      const csvLines: string[] = [];

      csvLines.push(headers.join(","));

      for (const row of rows) {
        const values = headers.map((h) => {
          const val = (row.rawData as Record<string, unknown>)[h];
          if (val == null) return "";
          const str = String(val);
          if (str.includes(",") || str.includes('"') || str.includes("\n")) {
            return `"${str.replace(/"/g, '""')}"`;
          }
          return str;
        });
        csvLines.push(values.join(","));
      }

      const csvBuffer = Buffer.from(csvLines.join("\n"), "utf-8");

      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="import-results-${batchId}.csv"`,
      );
      res.status(200).send(csvBuffer);
    } else {
      const wb = XLSX.utils.book_new();

      const allHeaders = rows.length > 0 ? Object.keys(rows[0].rawData as Record<string, unknown>) : [];
      const wsData: unknown[][] = [allHeaders];

      for (const row of rows) {
        const values = allHeaders.map((h) => (row.rawData as Record<string, unknown>)[h] ?? "");
        wsData.push(values);
      }

      const ws = XLSX.utils.aoa_to_sheet(wsData);
      XLSX.utils.book_append_sheet(wb, ws, "Results");

      const xlsxBuffer = Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));

      res.setHeader(
        "Content-Type",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      );
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="import-results-${batchId}.xlsx"`,
      );
      res.status(200).send(xlsxBuffer);
    }
  } catch (error) {
    next(error);
  }
}
