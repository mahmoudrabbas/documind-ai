import { describe, it, expect } from "vitest";
import type { ParsedRow } from "../xlsxParser.service.js";
import type {
  BatchValidationResult,
  RowValidationResult,
  ResolvedMapping,
} from "../validationEngine.service.js";
import { generatePreview } from "../previewGenerator.service.js";
import type {
  PreviewRow,
  ImportPreview,
  QuotaImpact,
} from "../previewGenerator.service.js";

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

function buildRow(
  rawData: Record<string, string>,
  rowNumber: number = 1,
): ParsedRow {
  return {
    rowNumber,
    rawData,
    checksum: `mock-${rowNumber}`,
  };
}

function buildMapping(
  fieldMap: Record<string, string>,
): ResolvedMapping {
  const headers = Object.keys(fieldMap);
  return {
    fieldMap,
    unmappedHeaders: [],
    mappedCount: headers.length,
    totalHeaders: headers.length,
    confidence: "high",
  };
}

function buildValidationResult(
  rowNumber: number,
  overrides?: Partial<Omit<RowValidationResult, "rowNumber">>,
): RowValidationResult {
  const base: RowValidationResult = {
    rowNumber,
    state: "VALID",
    errors: [],
    warnings: [],
  };
  return overrides ? { ...base, ...overrides, rowNumber } : base;
}

function buildBatchResult(
  rowResults: RowValidationResult[],
): BatchValidationResult {
  let valid = 0;
  let warning = 0;
  let invalid = 0;
  for (const r of rowResults) {
    if (r.state === "VALID") valid++;
    else if (r.state === "WARNING") warning++;
    else invalid++;
  }

  return {
    rows: rowResults,
    summary: { valid, warning, invalid },
  };
}

/** Standard full-name + email mapping used by most tests. */
const FULL_MAPPING = buildMapping({
  "First Name": "firstName",
  "Last Name": "lastName",
  "Email": "email",
  "Language": "language",
  "Manager Email": "managerEmail",
  "Phone": "phone",
  "Hire Date": "hireDate",
});

/** Minimal mapping with only required fields. */
const MIN_MAPPING = buildMapping({
  "First Name": "firstName",
  "Email": "email",
});

// ---------------------------------------------------------------------------
// Tests — generatePreview
// ---------------------------------------------------------------------------

describe("generatePreview", () => {
  // ── Basic preview ──────────────────────────────────────────────────────
  it("returns correct summary and row counts for a mix of valid/invalid rows", () => {
    const mapping = MIN_MAPPING;

    const rows: ParsedRow[] = [
      buildRow({ "First Name": "Alice", "Email": "alice@co.com" }, 1),
      buildRow({ "First Name": "Bob", "Email": "bob@co.com" }, 2),
      buildRow({ "First Name": "", "Email": "" }, 3),
    ];

    const validation = buildBatchResult([
      buildValidationResult(1, { state: "VALID" }),
      buildValidationResult(2, { state: "VALID" }),
      buildValidationResult(3, {
        state: "INVALID",
        errors: [
          {
            field: "email",
            code: "REQUIRED_FIELD_MISSING",
            message: "Email is required",
          },
        ],
      }),
    ]);

    const result = generatePreview({
      batchId: "batch-1",
      fileName: "employees.xlsx",
      rows,
      validation,
      mapping,
      existingUserCount: 10,
      planLimit: 100,
    });

    expect(result.batchId).toBe("batch-1");
    expect(result.fileName).toBe("employees.xlsx");
    expect(result.totalRows).toBe(3);
    expect(result.summary).toEqual({ valid: 2, warning: 0, invalid: 1, total: 3 });
    expect(result.rows).toHaveLength(3);

    expect(result.rows[0].state).toBe("VALID");
    expect(result.rows[1].state).toBe("VALID");
    expect(result.rows[2].state).toBe("INVALID");
    expect(result.rows[2].errors).toHaveLength(1);
    expect(result.rows[2].errors[0].code).toBe("REQUIRED_FIELD_MISSING");
  });

  // ── Row mapping ────────────────────────────────────────────────────────
  it("resolves fieldMap into mapped Record with target-field keys", () => {
    const mapping = buildMapping({
      "First Name": "firstName",
      "Last Name": "lastName",
      "Email": "email",
    });

    const rows: ParsedRow[] = [
      buildRow(
        {
          "First Name": "John",
          "Last Name": "Doe",
          "Email": "john@co.com",
        },
        1,
      ),
    ];

    const validation = buildBatchResult([
      buildValidationResult(1, { state: "VALID" }),
    ]);

    const result = generatePreview({
      batchId: "batch-1",
      fileName: "employees.xlsx",
      rows,
      validation,
      mapping,
      existingUserCount: 10,
      planLimit: 100,
    });

    const mapped = result.rows[0].mapped;
    expect(mapped.firstName).toBe("John");
    expect(mapped.lastName).toBe("Doe");
    expect(mapped.email).toBe("john@co.com");
    // Keys are target field names, not excel headers
    expect(Object.keys(mapped)).toEqual(["firstName", "lastName", "email"]);
  });

  it("fills missing mapped fields with empty string", () => {
    const mapping = buildMapping({
      "First Name": "firstName",
      "Last Name": "lastName",
      "Email": "email",
    });

    const rows: ParsedRow[] = [
      buildRow(
        {
          "First Name": "John",
          "Email": "john@co.com",
        },
        1,
      ),
    ];

    const validation = buildBatchResult([
      buildValidationResult(1, { state: "VALID" }),
    ]);

    const result = generatePreview({
      batchId: "batch-1",
      fileName: "employees.xlsx",
      rows,
      validation,
      mapping,
      existingUserCount: 10,
      planLimit: 100,
    });

    expect(result.rows[0].mapped.lastName).toBe("");
  });

  // ── Quota impact ───────────────────────────────────────────────────────
  it("sets wouldExceed=true when pending rows reach the plan limit", () => {
    const rows: ParsedRow[] = Array.from({ length: 5 }, (_, i) =>
      buildRow(
        { "First Name": `User${i}`, "Email": `user${i}@co.com` },
        i + 1,
      ),
    );

    const validation = buildBatchResult(
      rows.map((r) =>
        buildValidationResult(r.rowNumber, { state: "VALID" }),
      ),
    );

    const result = generatePreview({
      batchId: "batch-1",
      fileName: "employees.xlsx",
      rows,
      validation,
      mapping: MIN_MAPPING,
      existingUserCount: 45,
      planLimit: 50,
    });

    expect(result.quotaImpact.wouldExceed).toBe(true);
    expect(result.quotaImpact.currentUsers).toBe(45);
    expect(result.quotaImpact.planLimit).toBe(50);
  });

  it("sets wouldExceed=false when pending rows are within the plan limit", () => {
    const rows: ParsedRow[] = Array.from({ length: 5 }, (_, i) =>
      buildRow(
        { "First Name": `User${i}`, "Email": `user${i}@co.com` },
        i + 1,
      ),
    );

    const validation = buildBatchResult(
      rows.map((r) =>
        buildValidationResult(r.rowNumber, { state: "VALID" }),
      ),
    );

    const result = generatePreview({
      batchId: "batch-1",
      fileName: "employees.xlsx",
      rows,
      validation,
      mapping: MIN_MAPPING,
      existingUserCount: 40,
      planLimit: 50,
    });

    expect(result.quotaImpact.wouldExceed).toBe(false);
  });

  it("does not count INVALID rows towards pending quota", () => {
    const rows: ParsedRow[] = [
      buildRow({ "First Name": "Alice", "Email": "alice@co.com" }, 1),
      buildRow({ "First Name": "", "Email": "" }, 2),
    ];

    const validation = buildBatchResult([
      buildValidationResult(1, { state: "VALID" }),
      buildValidationResult(2, { state: "INVALID" }),
    ]);

    // 1 pending (VALID) + 0 existing = 1 < 50 → wouldExceed=false
    const result = generatePreview({
      batchId: "batch-1",
      fileName: "employees.xlsx",
      rows,
      validation,
      mapping: MIN_MAPPING,
      existingUserCount: 0,
      planLimit: 50,
    });

    expect(result.quotaImpact.wouldExceed).toBe(false);
  });

  // ── Empty rows ─────────────────────────────────────────────────────────
  it("returns empty rows array and zero summary for empty input", () => {
    const result = generatePreview({
      batchId: "batch-empty",
      fileName: "empty.xlsx",
      rows: [],
      validation: buildBatchResult([]),
      mapping: MIN_MAPPING,
      existingUserCount: 45,
      planLimit: 50,
    });

    expect(result.rows).toEqual([]);
    expect(result.totalRows).toBe(0);
    expect(result.summary).toEqual({ valid: 0, warning: 0, invalid: 0, total: 0 });
    // Quota impact computed normally with 0 pending rows
    expect(result.quotaImpact.wouldExceed).toBe(false);
    expect(result.quotaImpact.currentUsers).toBe(45);
    expect(result.quotaImpact.planLimit).toBe(50);
  });

  // ── All valid ──────────────────────────────────────────────────────────
  it("returns summary with all rows VALID and zero warnings/errors", () => {
    const rows: ParsedRow[] = [
      buildRow({ "First Name": "Alice", "Email": "alice@co.com" }, 1),
      buildRow({ "First Name": "Bob", "Email": "bob@co.com" }, 2),
      buildRow({ "First Name": "Carol", "Email": "carol@co.com" }, 3),
    ];

    const validation = buildBatchResult(
      rows.map((r) =>
        buildValidationResult(r.rowNumber, { state: "VALID" }),
      ),
    );

    const result = generatePreview({
      batchId: "batch-1",
      fileName: "employees.xlsx",
      rows,
      validation,
      mapping: MIN_MAPPING,
      existingUserCount: 10,
      planLimit: 100,
    });

    expect(result.summary).toEqual({ valid: 3, warning: 0, invalid: 0, total: 3 });
    expect(result.rows.every((r) => r.state === "VALID")).toBe(true);
    expect(result.rows.every((r) => r.errors.length === 0)).toBe(true);
    expect(result.rows.every((r) => r.warnings.length === 0)).toBe(true);
  });

  // ── No mutation ────────────────────────────────────────────────────────
  it("does not mutate input rows or validation arrays", () => {
    const inputRows: ParsedRow[] = [
      buildRow({ "First Name": "Alice", "Email": "alice@co.com" }, 1),
      buildRow({ "First Name": "Bob", "Email": "bob@co.com" }, 2),
    ];
    const originalRows = JSON.parse(JSON.stringify(inputRows));

    const validationResults: RowValidationResult[] = [
      buildValidationResult(1, { state: "VALID" }),
      buildValidationResult(2, { state: "INVALID" }),
    ];
    const inputValidation = buildBatchResult(validationResults);
    const originalValidation = JSON.parse(JSON.stringify(inputValidation));

    const mapping = MIN_MAPPING;
    const originalMapping = JSON.parse(JSON.stringify(mapping));

    generatePreview({
      batchId: "batch-1",
      fileName: "employees.xlsx",
      rows: inputRows,
      validation: inputValidation,
      mapping,
      existingUserCount: 10,
      planLimit: 100,
    });

    expect(JSON.parse(JSON.stringify(inputRows))).toEqual(originalRows);
    expect(JSON.parse(JSON.stringify(inputValidation))).toEqual(
      originalValidation,
    );
    expect(JSON.parse(JSON.stringify(mapping))).toEqual(originalMapping);
  });
});
