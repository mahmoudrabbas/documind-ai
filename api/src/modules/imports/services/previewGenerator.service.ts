// ---------------------------------------------------------------------------
// Read-only preview generator.
// Combines parsed rows, validation results, and mapping into a structured
// preview for the frontend confirmation screen.
// No side effects, no DB calls — pure computation.
// ---------------------------------------------------------------------------

import type { ParsedRow } from "../services/xlsxParser.service.js";
import type {
  BatchValidationResult,
  RowValidationResult,
  ValidationIssue,
  ResolvedMapping,
} from "../services/validationEngine.service.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface PreviewRow {
  rowNumber: number;
  mapped: Record<string, string>; // fieldName → value (after mapping resolution)
  state: "VALID" | "WARNING" | "INVALID";
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface QuotaImpact {
  currentUsers: number;
  planLimit: number;
  wouldExceed: boolean;
}

export interface ImportPreview {
  batchId: string;
  fileName: string;
  totalRows: number;
  summary: {
    valid: number;
    warning: number;
    invalid: number;
    total: number;
  };
  rows: PreviewRow[];
  mapping: ResolvedMapping;
  quotaImpact: QuotaImpact;
}

// ---------------------------------------------------------------------------
// generatePreview
// ---------------------------------------------------------------------------

/**
 * Build a structured preview for the frontend confirmation screen.
 *
 * For each parsed row:
 *  1. Resolve the mapping: reverse-lookup the excel header for each target
 *     field in `mapping.fieldMap` and extract the raw value.
 *  2. Match validation results to the correct row by `rowNumber`.
 *  3. Produce a `PreviewRow` with the mapped data, row state, errors, and
 *     warnings.
 *
 * Then compute summary counts and quota impact.  This function is pure and
 * does **not** mutate any of its input arrays or objects.
 */
export function generatePreview(params: {
  batchId: string;
  fileName: string;
  rows: ParsedRow[];
  validation: BatchValidationResult;
  mapping: ResolvedMapping;
  existingUserCount: number;
  planLimit: number;
}): ImportPreview {
  // ── 1. Build a rowNumber → RowValidationResult lookup ─────────────────
  const validationByRow = new Map<number, RowValidationResult>();
  for (const vr of params.validation.rows) {
    validationByRow.set(vr.rowNumber, vr);
  }

  // ── 2. Map each parsed row to a PreviewRow ────────────────────────────
  const rows: PreviewRow[] = params.rows.map((row) => {
    // For each entry in fieldMap (excelHeader → targetField), look up the
    // excel header in the row's rawData and store by target field name.
    const mapped: Record<string, string> = {};
    for (const [excelHeader, targetField] of Object.entries(
      params.mapping.fieldMap,
    )) {
      mapped[targetField] = row.rawData[excelHeader] ?? "";
    }

    const validation = validationByRow.get(row.rowNumber);

    return {
      rowNumber: row.rowNumber,
      mapped,
      state: validation?.state ?? "INVALID",
      // Spread to avoid sharing references with input validation results
      errors: [...(validation?.errors ?? [])],
      warnings: [...(validation?.warnings ?? [])],
    };
  });

  // ── 3. Compute summary counts from validation results ─────────────────
  let valid = 0;
  let warning = 0;
  let invalid = 0;
  for (const vr of params.validation.rows) {
    if (vr.state === "VALID") valid++;
    else if (vr.state === "WARNING") warning++;
    else invalid++;
  }

  // ── 4. Compute quota impact ───────────────────────────────────────────
  // Count rows that would proceed (VALID + WARNING) as "pending".
  const pendingRowCount = rows.filter((r) => r.state !== "INVALID").length;
  const wouldExceed =
    params.existingUserCount + pendingRowCount >= params.planLimit;

  return {
    batchId: params.batchId,
    fileName: params.fileName,
    totalRows: params.rows.length,
    summary: { valid, warning, invalid, total: params.rows.length },
    rows,
    mapping: params.mapping,
    quotaImpact: {
      currentUsers: params.existingUserCount,
      planLimit: params.planLimit,
      wouldExceed,
    },
  };
}
