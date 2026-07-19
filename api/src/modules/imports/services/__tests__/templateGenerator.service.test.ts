import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { generateEmployeeTemplate } from "../templateGenerator.service.js";
import { parseEmployeeSpreadsheet } from "../xlsxParser.service.js";
import { EMPLOYEE_IMPORT_FIELDS } from "../../ports/spreadsheetMappingAgent.port.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const REQUIRED_FIELD_LABELS = EMPLOYEE_IMPORT_FIELDS.filter(
  (f) => f.required,
).map((f) => f.label);

const ALL_FIELD_LABELS = EMPLOYEE_IMPORT_FIELDS.map((f) => f.label);

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateEmployeeTemplate", () => {
  describe("basic output", () => {
    it("returns a non-empty Buffer", () => {
      const buffer = generateEmployeeTemplate();
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBeGreaterThan(0);
    });

    it("always succeeds and never throws", () => {
      expect(() => generateEmployeeTemplate()).not.toThrow();
      expect(() => generateEmployeeTemplate(true)).not.toThrow();
    });
  });

  describe("workbook structure", () => {
    it("creates a workbook with exactly one sheet named 'Employees'", () => {
      const buffer = generateEmployeeTemplate();
      const wb = XLSX.read(buffer, { type: "buffer" });

      expect(wb.SheetNames).toHaveLength(1);
      expect(wb.SheetNames[0]).toBe("Employees");
    });

    it("has a sheet named 'Employees' even with optional headers", () => {
      const buffer = generateEmployeeTemplate(true);
      const wb = XLSX.read(buffer, { type: "buffer" });

      expect(wb.SheetNames).toHaveLength(1);
      expect(wb.SheetNames[0]).toBe("Employees");
    });
  });

  describe("default mode (required fields only)", () => {
    it("includes only the required field labels as headers", () => {
      const buffer = generateEmployeeTemplate();
      const wb = XLSX.read(buffer, { type: "buffer" });
      const ws = wb.Sheets["Employees"];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // Row 0 is the header row
      const headers = (rows[0] as string[]).filter(Boolean);
      expect(headers).toEqual(REQUIRED_FIELD_LABELS);
    });

    it("has the correct number of required headers (3)", () => {
      const buffer = generateEmployeeTemplate();
      const wb = XLSX.read(buffer, { type: "buffer" });
      const ws = wb.Sheets["Employees"];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const headers = (rows[0] as string[]).filter(Boolean);
      expect(headers).toHaveLength(3);
      expect(headers).toContain("First Name");
      expect(headers).toContain("Last Name");
      expect(headers).toContain("Email");
    });
  });

  describe("optional headers mode", () => {
    it("includes all field labels as headers when includeOptionalHeaders=true", () => {
      const buffer = generateEmployeeTemplate(true);
      const wb = XLSX.read(buffer, { type: "buffer" });
      const ws = wb.Sheets["Employees"];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      const headers = (rows[0] as string[]).filter(Boolean);
      expect(headers).toEqual(ALL_FIELD_LABELS);
    });

    it("includes more headers than required mode", () => {
      const bufferRequired = generateEmployeeTemplate(false);
      const bufferAll = generateEmployeeTemplate(true);

      const wbReq = XLSX.read(bufferRequired, { type: "buffer" });
      const wbAll = XLSX.read(bufferAll, { type: "buffer" });

      const wsReq = wbReq.Sheets["Employees"];
      const wsAll = wbAll.Sheets["Employees"];

      const rowsReq: unknown[][] = XLSX.utils.sheet_to_json(wsReq, {
        header: 1,
      });
      const rowsAll: unknown[][] = XLSX.utils.sheet_to_json(wsAll, {
        header: 1,
      });

      const headersReq = (rowsReq[0] as string[]).filter(Boolean);
      const headersAll = (rowsAll[0] as string[]).filter(Boolean);

      expect(headersAll.length).toBeGreaterThan(headersReq.length);
    });
  });

  describe("guidance row", () => {
    it("includes a second row with a cell comment in the first cell", () => {
      const buffer = generateEmployeeTemplate();
      const wb = XLSX.read(buffer, { type: "buffer" });
      const ws = wb.Sheets["Employees"];
      const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });

      // There must be at least 2 rows (header + guidance)
      expect(rows.length).toBeGreaterThanOrEqual(2);
    });

    it("has a cell comment on A2 with the guidance text", () => {
      const buffer = generateEmployeeTemplate();
      const wb = XLSX.read(buffer, { type: "buffer" });
      const ws = wb.Sheets["Employees"];

      // Check the raw cell at A2 for a comment
      const a2Ref = XLSX.utils.encode_cell({ r: 1, c: 0 });
      const a2Cell = ws[a2Ref];

      expect(a2Cell).toBeDefined();
      expect(a2Cell).toHaveProperty("c");
      expect(Array.isArray(a2Cell.c)).toBe(true);
      expect(a2Cell.c.length).toBeGreaterThan(0);
      expect(a2Cell.c[0].t).toBe("Delete this row before uploading");
    });
  });

  describe("round-trip with parseEmployeeSpreadsheet", () => {
    it("returns 0 data rows when parsed back (guidance row is filtered)", () => {
      const buffer = generateEmployeeTemplate();
      const result = parseEmployeeSpreadsheet(buffer, "template.xlsx");

      // Headers should match
      expect(result.headers).toEqual(REQUIRED_FIELD_LABELS);

      // The empty guidance row should be filtered by isEmptyRow → 0 data rows
      expect(result.rows).toHaveLength(0);
      expect(result.totalRows).toBe(0);
    });

    it("returns 0 data rows with optional headers mode", () => {
      const buffer = generateEmployeeTemplate(true);
      const result = parseEmployeeSpreadsheet(buffer, "template.xlsx");

      expect(result.headers).toEqual(ALL_FIELD_LABELS);
      expect(result.rows).toHaveLength(0);
      expect(result.totalRows).toBe(0);
    });

    it("generates a deterministic checksum for identical calls", () => {
      const buf1 = generateEmployeeTemplate();
      const buf2 = generateEmployeeTemplate();

      const r1 = parseEmployeeSpreadsheet(buf1, "t.xlsx");
      const r2 = parseEmployeeSpreadsheet(buf2, "t.xlsx");

      expect(r1.fileChecksum).toBe(r2.fileChecksum);
    });
  });
});
