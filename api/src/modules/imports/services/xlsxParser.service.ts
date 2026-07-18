import { createHash } from "node:crypto";
import * as XLSX from "xlsx";
import { AppError } from "../../../common/errors/AppError.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ParsedRow {
  rowNumber: number;
  rawData: Record<string, string>;
  checksum: string;
}

export interface ParsedSpreadsheet {
  headers: string[];
  rows: ParsedRow[];
  totalRows: number;
  fileChecksum: string;
}

export interface ParserOptions {
  maxFileSizeBytes?: number;
  maxRows?: number;
  maxColumns?: number;
  maxCellLength?: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEFAULT_MAX_FILE_SIZE_BYTES = 5 * 1024 * 1024; // 5 MB
const DEFAULT_MAX_ROWS = 5000;
const DEFAULT_MAX_COLUMNS = 100;
const DEFAULT_MAX_CELL_LENGTH = 1000;

const SUPPORTED_EXTENSIONS = [".xlsx", ".xls", ".csv"];

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Extract the file extension from a file name (case-insensitive).
 */
function getExtension(fileName: string): string | null {
  const dotIndex = fileName.lastIndexOf(".");
  if (dotIndex === -1) return null;
  return fileName.slice(dotIndex).toLowerCase();
}

/**
 * Extract a string value from a parsed cell.
 *
 * - null / undefined → ""
 * - Object (formula cells found even with cellFormula: false) → .v (raw
 *   value) or .w (formatted text), defaulting to ""
 * - Everything else → String(value)
 */
function extractCellValue(cell: unknown, maxLength: number): string {
  if (cell === null || cell === undefined) return "";

  let value: string;

  if (typeof cell === "object") {
    const obj = cell as Record<string, unknown>;
    const raw = obj.v ?? obj.w;
    value = raw !== null && raw !== undefined ? String(raw) : "";
  } else {
    value = String(cell);
  }

  return value.length > maxLength ? value.slice(0, maxLength) : value;
}

/**
 * Compute a SHA-256 checksum over a sorted-key-normalised object.
 */
function computeRowChecksum(rawData: Record<string, string>): string {
  const sorted = Object.keys(rawData).sort();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const normalised = sorted.reduce<Record<string, any>>((acc, key) => {
    acc[key] = rawData[key];
    return acc;
  }, {});
  return createHash("sha256")
    .update(JSON.stringify(normalised))
    .digest("hex");
}

/**
 * Detect whether a row array is completely empty (all cells are empty /
 * null / undefined).
 */
function isEmptyRow(row: unknown[]): boolean {
  return row.every((cell) => {
    if (cell === null || cell === undefined) return true;
    if (typeof cell === "object") {
      // Object cells represent formula objects or other structured cells.
      // Even without a cached value the cell has content (a formula), so
      // the row should NOT be treated as empty.
      return false;
    }
    if (typeof cell === "string") return cell.trim() === "";
    // numbers, booleans — always content
    return false;
  });
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export function parseEmployeeSpreadsheet(
  buffer: Buffer,
  originalFileName: string,
  options?: ParserOptions,
): ParsedSpreadsheet {
  // ── 1. Validate file extension ─────────────────────────────────────────────
  const ext = getExtension(originalFileName);
  if (!ext || !SUPPORTED_EXTENSIONS.includes(ext)) {
    throw new AppError(
      400,
      "INVALID_FILE_FORMAT",
      "Only .xlsx, .xls, and .csv files are supported",
    );
  }

  // ── 2. File size checks ────────────────────────────────────────────────────
  const maxFileSize = options?.maxFileSizeBytes ?? DEFAULT_MAX_FILE_SIZE_BYTES;

  if (buffer.length === 0) {
    throw new AppError(400, "INVALID_FILE_FORMAT", "File is empty");
  }

  if (buffer.length > maxFileSize) {
    throw new AppError(
      400,
      "FILE_TOO_LARGE",
      `File exceeds maximum size of ${maxFileSize} bytes`,
    );
  }

  // ── 3. File checksum ───────────────────────────────────────────────────────
  const fileChecksum = createHash("sha256").update(buffer).digest("hex");

  // ── 4. Parse workbook ──────────────────────────────────────────────────────
  let workbook: XLSX.WorkBook;
  try {
    workbook = XLSX.read(buffer, {
      type: "buffer",
      cellFormula: false,
      cellHTML: false,
    });
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Unknown parse error";
    throw new AppError(
      400,
      "INVALID_FILE_FORMAT",
      `Could not parse file: ${message}`,
    );
  }

  // Read the first sheet only
  const firstSheetName = workbook.SheetNames[0];
  if (!firstSheetName) {
    return { headers: [], rows: [], totalRows: 0, fileChecksum };
  }

  const firstSheet = workbook.Sheets[firstSheetName];
  const rawData: unknown[][] = XLSX.utils.sheet_to_json(firstSheet, {
    header: 1,
    defval: "",
  });

  // ── 5. Find the first non-empty row for headers ────────────────────────────
  let headerRowIndex = -1;
  for (let i = 0; i < rawData.length; i++) {
    const row = rawData[i] as unknown[];
    if (!isEmptyRow(row)) {
      headerRowIndex = i;
      break;
    }
  }

  if (headerRowIndex === -1) {
    // No non-empty rows → return empty result
    return { headers: [], rows: [], totalRows: 0, fileChecksum };
  }

  // ── 6. Extract headers ─────────────────────────────────────────────────────
  const rawHeaders = rawData[headerRowIndex] as unknown[];
  const headerCount = rawHeaders.length;

  // Enforce column limit
  const maxColumns = options?.maxColumns ?? DEFAULT_MAX_COLUMNS;
  if (headerCount > maxColumns) {
    throw new AppError(
      400,
      "COLUMN_LIMIT_EXCEEDED",
      `Spreadsheet has ${headerCount} columns, which exceeds the maximum of ${maxColumns}`,
    );
  }

  const maxCellLength = options?.maxCellLength ?? DEFAULT_MAX_CELL_LENGTH;

  let headers: string[] = rawHeaders.map((cell) =>
    extractCellValue(cell, maxCellLength).trim(),
  );

  // Strip BOM from first header if present
  if (headers.length > 0 && headers[0].charCodeAt(0) === 0xfeff) {
    headers[0] = headers[0].slice(1);
  }

  // Filter to non-empty headers after trimming
  headers = headers.filter((h) => h.length > 0);

  // ── 7. Process data rows ───────────────────────────────────────────────────
  const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
  const dataRows = rawData.slice(headerRowIndex + 1);
  const nonEmptyDataRows = dataRows.filter(
    (row) => !isEmptyRow(row as unknown[]),
  );

  if (nonEmptyDataRows.length > maxRows) {
    throw new AppError(
      400,
      "ROW_LIMIT_EXCEEDED",
      `Spreadsheet has ${nonEmptyDataRows.length} data rows, which exceeds the maximum of ${maxRows}`,
    );
  }

  const rows: ParsedRow[] = nonEmptyDataRows.map(
    (row: unknown, index: number) => {
      const rowArray = row as unknown[];

      // Build rawData using header positions
      const rawDataMap: Record<string, string> = {};
      for (let i = 0; i < headers.length; i++) {
        const header = headers[i];
        if (header) {
          const cellValue =
            i < rowArray.length ? extractCellValue(rowArray[i], maxCellLength) : "";
          rawDataMap[header] = cellValue;
        }
      }

      const rowNumber = headerRowIndex + index + 2; // 1-based, skip header row

      return {
        rowNumber,
        rawData: rawDataMap,
        checksum: computeRowChecksum(rawDataMap),
      };
    },
  );

  return {
    headers,
    rows,
    totalRows: rows.length,
    fileChecksum,
  };
}
