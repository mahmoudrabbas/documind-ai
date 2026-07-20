import * as XLSX from "xlsx";
import { EMPLOYEE_IMPORT_FIELDS } from "../ports/spreadsheetMappingAgent.port.js";

/**
 * Generate a blank XLSX template workbook for employee imports.
 *
 * The workbook contains:
 * - A header row built from the `label` property of each field in
 *   `EMPLOYEE_IMPORT_FIELDS`.
 * - One empty data row with a cell comment in the first cell reminding
 *   the user to delete it before uploading.
 * - A single sheet named "Employees".
 *
 * @param includeOptionalHeaders - When `false` (default) only REQUIRED
 *   fields (firstName, lastName, email) are included.  When `true` every
 *   field from EMPLOYEE_IMPORT_FIELDS is included.
 * @returns A Buffer of the generated XLSX workbook.  Never throws.
 */
export function generateEmployeeTemplate(
  includeOptionalHeaders = false,
): Buffer {
  const fields = includeOptionalHeaders
    ? EMPLOYEE_IMPORT_FIELDS
    : EMPLOYEE_IMPORT_FIELDS.filter((f) => f.required);

  const headerLabels = fields.map((f) => f.label);

  // ── Build worksheet ──────────────────────────────────────────────────────
  // Row 1: header row with human-readable field labels
  const ws = XLSX.utils.aoa_to_sheet([headerLabels]);

  // Row 2: empty data row with a cell comment as in-file guidance.
  // The comment text is stored separately so the cell value remains empty,
  // and the parser's isEmptyRow filter will correctly skip it.
  const commentCellRef = XLSX.utils.encode_cell({ r: 1, c: 0 });
  ws[commentCellRef] = {
    t: "s",
    v: "",
    c: [{ a: "DocuMind", t: "Delete this row before uploading" }],
  };

  // Extend the sheet range to cover the guidance row
  ws["!ref"] = XLSX.utils.encode_range({
    s: { r: 0, c: 0 },
    e: { r: 1, c: headerLabels.length - 1 },
  });

  // ── Build workbook ───────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Employees");

  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}
