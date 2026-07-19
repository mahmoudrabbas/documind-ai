import { describe, it, expect } from "vitest";
import * as XLSX from "xlsx";
import { AppError } from "../../../../common/errors/AppError.js";
import { parseEmployeeSpreadsheet } from "../xlsxParser.service.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create an in-memory XLSX buffer from an array-of-arrays. */
function buildXlsxBuffer(data: unknown[][]): Buffer {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet(data);
  XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
  return Buffer.from(XLSX.write(wb, { type: "buffer", bookType: "xlsx" }));
}

/** Create an in-memory CSV buffer. */
function buildCsvBuffer(csvContent: string): Buffer {
  return Buffer.from(csvContent, "utf-8");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("parseEmployeeSpreadsheet", () => {
  describe("basic parsing", () => {
    it("parses a valid XLSX with 3 headers and 10 data rows", () => {
      const headers = ["Name", "Email", "Department"];
      const rows = Array.from({ length: 10 }, (_, i) => [
        `Person ${i + 1}`,
        `person${i + 1}@co.com`,
        i % 2 === 0 ? "Engineering" : "Marketing",
      ]);
      const buffer = buildXlsxBuffer([headers, ...rows]);

      const result = parseEmployeeSpreadsheet(buffer, "employees.xlsx");

      expect(result.headers).toEqual(headers);
      expect(result.rows).toHaveLength(10);
      expect(result.totalRows).toBe(10);

      result.rows.forEach((row, i) => {
        expect(row.rowNumber).toBe(i + 2);
        expect(row.rawData).toEqual({
          Name: `Person ${i + 1}`,
          Email: `person${i + 1}@co.com`,
          Department: i % 2 === 0 ? "Engineering" : "Marketing",
        });
        expect(row.checksum).toBeTruthy();
        expect(row.checksum).toHaveLength(64);
      });

      expect(result.fileChecksum).toBeTruthy();
      expect(result.fileChecksum).toHaveLength(64);
    });

    it("parses an XLSX with only headers and no data rows", () => {
      const headers = ["Name", "Email"];
      const buffer = buildXlsxBuffer([headers]);

      const result = parseEmployeeSpreadsheet(buffer, "headers-only.xlsx");

      expect(result.headers).toEqual(headers);
      expect(result.rows).toEqual([]);
      expect(result.totalRows).toBe(0);
    });

    it("handles an XLSX with empty rows between headers and data", () => {
      const headers = ["A", "B"];
      const data = [["1", "2"], [], ["3", "4"]];
      const buffer = buildXlsxBuffer([headers, ...data]);

      const result = parseEmployeeSpreadsheet(buffer, "test.xlsx");

      expect(result.headers).toEqual(headers);
      expect(result.rows).toHaveLength(2);
      expect(result.rows[0].rawData).toEqual({ A: "1", B: "2" });
      expect(result.rows[1].rawData).toEqual({ A: "3", B: "4" });
    });
  });

  describe("file extension validation", () => {
    it("rejects unsupported file extensions", () => {
      const buffer = buildXlsxBuffer([["a"]]);

      expect(() => parseEmployeeSpreadsheet(buffer, "data.pdf")).toThrow(
        "Only .xlsx, .xls, and .csv files are supported",
      );
    });

    it("rejects files with no extension", () => {
      const buffer = buildXlsxBuffer([["a"]]);

      expect(() => parseEmployeeSpreadsheet(buffer, "README")).toThrow(
        "Only .xlsx, .xls, and .csv files are supported",
      );
    });

    it("accepts .xls extension", () => {
      const buffer = buildXlsxBuffer([["Name"]]);
      const result = parseEmployeeSpreadsheet(buffer, "old-file.xls");
      expect(result.headers).toEqual(["Name"]);
    });

    it("accepts .csv extension", () => {
      const buffer = buildCsvBuffer("Name\nAlice");
      const result = parseEmployeeSpreadsheet(buffer, "employees.csv");
      expect(result.headers).toEqual(["Name"]);
      expect(result.rows).toHaveLength(1);
    });

    it("rejects uppercase extension correctly (case-insensitive)", () => {
      const buffer = buildXlsxBuffer([["a"]]);
      const result = parseEmployeeSpreadsheet(buffer, "DATA.XLSX");
      expect(result.headers).toEqual(["a"]);
    });
  });

  describe("empty buffer", () => {
    it("throws INVALID_FILE_FORMAT for empty buffer", () => {
      const buffer = Buffer.alloc(0);
      expect(() => parseEmployeeSpreadsheet(buffer, "empty.xlsx")).toThrow(
        "File is empty",
      );
    });
  });

  // The xlsx library is resilient with unexpected binary data — it
  // gracefully degrades rather than throwing.  The try/catch block in
  // parseEmployeeSpreadsheet is exercised indirectly by the empty buffer,
  // extension validation, and limit-enforcement tests above.

  describe("limit enforcement", () => {
    it("throws ROW_LIMIT_EXCEEDED when row count exceeds maxRows", () => {
      const headers = ["A"];
      const rows = Array.from({ length: 5 }, (_, i) => [`Row ${i + 1}`]);
      const buffer = buildXlsxBuffer([headers, ...rows]);

      try {
        parseEmployeeSpreadsheet(buffer, "too-many.xlsx", { maxRows: 3 });
        expect.unreachable("Should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe("ROW_LIMIT_EXCEEDED");
        expect((err as AppError).statusCode).toBe(400);
      }
    });

    it("throws COLUMN_LIMIT_EXCEEDED when column count exceeds maxColumns", () => {
      const headers = ["A", "B", "C"];
      const buffer = buildXlsxBuffer([headers]);

      try {
        parseEmployeeSpreadsheet(buffer, "too-wide.xlsx", { maxColumns: 2 });
        expect.unreachable("Should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe("COLUMN_LIMIT_EXCEEDED");
        expect((err as AppError).statusCode).toBe(400);
      }
    });

    it("uses default limits when options are not provided", () => {
      const headers = ["A"];
      const rows = Array.from({ length: 4999 }, (_, i) => [`Row ${i + 2}`]);
      const buffer = buildXlsxBuffer([headers, ...rows]);

      const result = parseEmployeeSpreadsheet(buffer, "big.xlsx");
      expect(result.totalRows).toBe(4999);
    });

    it("truncates cell values longer than maxCellLength", () => {
      const maxCellLength = 5;
      const headers = ["Note"];
      const longValue = "a".repeat(100);
      const buffer = buildXlsxBuffer([headers, [longValue]]);

      const result = parseEmployeeSpreadsheet(buffer, "long-cells.xlsx", {
        maxCellLength,
      });

      expect(result.rows[0].rawData.Note).toBe("a".repeat(5));
    });
  });

  describe("formula handling", () => {
    it("does not execute or return formula expressions", () => {
      // Build a workbook with a formula cell
      const wb = XLSX.utils.book_new();
      const ws: XLSX.WorkSheet = {};
      const ref = XLSX.utils.encode_range({
        s: { r: 0, c: 0 },
        e: { r: 2, c: 0 },
      });
      ws["!ref"] = ref;

      // Row 1: header
      ws.A1 = { t: "s", v: "Value" };
      // Row 2: numeric cell
      ws.A2 = { t: "n", v: 10 };
      // Row 3: formula cell (no cached value v, so xlsx may or may not keep it)
      ws.A3 = { t: "n", f: "=SUM(A1:A2)" };

      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buffer = Buffer.from(
        XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
      );

      const result = parseEmployeeSpreadsheet(buffer, "formulas.xlsx");

      expect(result.headers).toEqual(["Value"]);

      // The formula row may or may not survive the write-read round-trip
      // depending on whether xlsx keeps uncached formula cells.  In either
      // case, verify that no formula string leaks into the output.
      for (const row of result.rows) {
        expect(row.rawData.Value).not.toContain("=");
        expect(row.rawData.Value).not.toContain("SUM");
      }
    });
  });

  describe("CSV handling", () => {
    it("parses CSV files correctly", () => {
      const csv =
        "Name,Email,Department\nAlice,alice@co.com,Engineering\nBob,bob@co.com,Marketing\n";
      const buffer = buildCsvBuffer(csv);

      const result = parseEmployeeSpreadsheet(buffer, "employees.csv");

      expect(result.headers).toEqual(["Name", "Email", "Department"]);
      expect(result.totalRows).toBe(2);
      expect(result.rows[0].rawData).toEqual({
        Name: "Alice",
        Email: "alice@co.com",
        Department: "Engineering",
      });
      expect(result.rows[1].rawData).toEqual({
        Name: "Bob",
        Email: "bob@co.com",
        Department: "Marketing",
      });
    });

    it("strips BOM character from first CSV header", () => {
      const csv = "\uFEFFName,Email\nTest,test@co.com\n";
      const buffer = buildCsvBuffer(csv);

      const result = parseEmployeeSpreadsheet(buffer, "bom.csv");

      expect(result.headers).toEqual(["Name", "Email"]);
      expect(result.headers[0]).not.toContain("\uFEFF");
    });

    it("handles CSV with trailing empty lines", () => {
      const csv = "A,B\n1,2\n3,4\n\n\n";
      const buffer = buildCsvBuffer(csv);

      const result = parseEmployeeSpreadsheet(buffer, "trailing.csv");

      expect(result.headers).toEqual(["A", "B"]);
      expect(result.totalRows).toBe(2);
    });
  });

  describe("checksum consistency", () => {
    it("produces the same fileChecksum for the same buffer", () => {
      const headers = ["X"];
      const buffer = buildXlsxBuffer([headers, ["y"]]);

      const r1 = parseEmployeeSpreadsheet(buffer, "same.xlsx");
      const r2 = parseEmployeeSpreadsheet(buffer, "same.xlsx");

      expect(r1.fileChecksum).toBe(r2.fileChecksum);
    });

    it("produces the same row checksum for identical data", () => {
      const headers = ["A", "B"];
      const buffer = buildXlsxBuffer([headers, ["x", "y"]]);

      const r1 = parseEmployeeSpreadsheet(buffer, "t.xlsx");
      const r2 = parseEmployeeSpreadsheet(buffer, "t.xlsx");

      expect(r1.rows[0].checksum).toBe(r2.rows[0].checksum);
    });

    it("produces different checksums for different data", () => {
      const headers = ["A"];
      const buf1 = buildXlsxBuffer([headers, ["x"]]);
      const buf2 = buildXlsxBuffer([headers, ["y"]]);

      const r1 = parseEmployeeSpreadsheet(buf1, "a.xlsx");
      const r2 = parseEmployeeSpreadsheet(buf2, "b.xlsx");

      expect(r1.fileChecksum).not.toBe(r2.fileChecksum);
      expect(r1.rows[0].checksum).not.toBe(r2.rows[0].checksum);
    });

    it("row checksum is deterministic regardless of key order", () => {
      const bufFirst = buildXlsxBuffer([["A", "B"], ["1", "2"]]);
      const bufSecond = buildXlsxBuffer([["B", "A"], ["2", "1"]]);

      const r1 = parseEmployeeSpreadsheet(bufFirst, "order1.xlsx");
      const r2 = parseEmployeeSpreadsheet(bufSecond, "order2.xlsx");

      expect(r1.rows[0].checksum).toBe(r2.rows[0].checksum);
    });
  });

  describe("edge cases", () => {
    it("returns empty result when there is no header row", () => {
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([]);
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buffer = Buffer.from(
        XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
      );

      const result = parseEmployeeSpreadsheet(buffer, "empty.xlsx");

      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
      expect(result.totalRows).toBe(0);
      expect(result.fileChecksum).toBeTruthy();
    });

    it("returns empty result for workbook with only empty rows", () => {
      // A sheet that exists but has no data at all (created by writing a
      // single empty row that sheet_to_json returns as [""]).
      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([[""]]);
      XLSX.utils.book_append_sheet(wb, ws, "Sheet1");
      const buffer = Buffer.from(
        XLSX.write(wb, { type: "buffer", bookType: "xlsx" }),
      );

      const result = parseEmployeeSpreadsheet(buffer, "empty.xlsx");

      expect(result.headers).toEqual([]);
      expect(result.rows).toEqual([]);
      expect(result.totalRows).toBe(0);
    });

    it("handles numeric and boolean cell values by converting to strings", () => {
      const headers = ["Name", "Age", "Active"];
      const data = [["Alice", 30, true]];
      const buffer = buildXlsxBuffer([headers, ...data]);

      const result = parseEmployeeSpreadsheet(buffer, "types.xlsx");

      expect(result.rows[0].rawData).toEqual({
        Name: "Alice",
        Age: "30",
        Active: "true",
      });
    });
  });

  describe("file size enforcement", () => {
    it("throws FILE_TOO_LARGE when buffer exceeds maxFileSizeBytes", () => {
      const buffer = buildXlsxBuffer([["A"]]);
      try {
        parseEmployeeSpreadsheet(buffer, "large.xlsx", {
          maxFileSizeBytes: 1,
        });
        expect.unreachable("Should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        expect((err as AppError).code).toBe("FILE_TOO_LARGE");
        expect((err as AppError).statusCode).toBe(400);
      }
    });

    it("accepts file within size limit", () => {
      const buffer = buildXlsxBuffer([["A"]]);
      expect(() =>
        parseEmployeeSpreadsheet(buffer, "small.xlsx", {
          maxFileSizeBytes: 10 * 1024 * 1024,
        }),
      ).not.toThrow();
    });
  });

  describe("AppError codes and statuses", () => {
    it("throws AppError with INVALID_FILE_FORMAT for empty file (0 bytes)", () => {
      const buffer = Buffer.alloc(0);
      try {
        parseEmployeeSpreadsheet(buffer, "empty.xlsx");
        expect.unreachable("Should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(400);
        expect(appErr.code).toBe("INVALID_FILE_FORMAT");
        expect(appErr.message).toContain("File is empty");
      }
    });

    it("throws AppError with ROW_LIMIT_EXCEEDED from limit enforcement", () => {
      const headers = ["A"];
      const rows = Array.from({ length: 10 }, (_, i) => [`v${i}`]);
      const buffer = buildXlsxBuffer([headers, ...rows]);

      try {
        parseEmployeeSpreadsheet(buffer, "too-many.xlsx", { maxRows: 2 });
        expect.unreachable("Should have thrown");
      } catch (err: unknown) {
        expect(err).toBeInstanceOf(AppError);
        const appErr = err as AppError;
        expect(appErr.statusCode).toBe(400);
        expect(appErr.code).toBe("ROW_LIMIT_EXCEEDED");
      }
    });
  });
});
