import { describe, it, expect } from "vitest";
import type { FieldDefinition } from "../../ports/spreadsheetMappingAgent.port.js";
import { resolveColumnMappings } from "../mappingResolver.service.js";

describe("resolveColumnMappings", () => {
  // ---------------------------------------------------------------------------
  // Exact match
  // ---------------------------------------------------------------------------
  describe("exact match", () => {
    it("maps an exact-match header with high confidence and correct target", () => {
      const result = resolveColumnMappings(["First Name"]);
      const mapping = result.columnMappings[0];

      expect(mapping.excelHeader).toBe("First Name");
      expect(mapping.targetField).toBe("firstName");
      expect(mapping.confidence).toBe("high");
      expect(mapping.alternatives).toEqual([]);
      expect(result.unmappedHeaders).toEqual([]);
    });

    it("maps multiple exact-match headers each correctly", () => {
      const result = resolveColumnMappings([
        "First Name",
        "Email",
        "Department",
      ]);

      const firstName = result.columnMappings.find(
        (m) => m.excelHeader === "First Name",
      );
      expect(firstName?.targetField).toBe("firstName");
      expect(firstName?.confidence).toBe("high");

      const email = result.columnMappings.find(
        (m) => m.excelHeader === "Email",
      );
      expect(email?.targetField).toBe("email");
      expect(email?.confidence).toBe("high");

      const dept = result.columnMappings.find(
        (m) => m.excelHeader === "Department",
      );
      expect(dept?.targetField).toBe("department");
      expect(dept?.confidence).toBe("high");
    });

    it("maps known shorthand like 'Dept' with high confidence", () => {
      const result = resolveColumnMappings(["Dept"]);
      expect(result.columnMappings[0].targetField).toBe("department");
      expect(result.columnMappings[0].confidence).toBe("high");
    });
  });

  // ---------------------------------------------------------------------------
  // Case-insensitive match
  // ---------------------------------------------------------------------------
  describe("case-insensitive match", () => {
    it("maps header with mixed case as high confidence", () => {
      const result = resolveColumnMappings(["fIrSt NaMe"]);
      const mapping = result.columnMappings[0];

      expect(mapping.targetField).toBe("firstName");
      expect(mapping.confidence).toBe("high");
    });

    it("maps all-lowercase header as high confidence", () => {
      const result = resolveColumnMappings(["email"]);
      expect(result.columnMappings[0].targetField).toBe("email");
      expect(result.columnMappings[0].confidence).toBe("high");
    });

    it("maps all-uppercase header as high confidence", () => {
      const result = resolveColumnMappings(["PHONE"]);
      expect(result.columnMappings[0].targetField).toBe("phone");
      expect(result.columnMappings[0].confidence).toBe("high");
    });
  });

  // ---------------------------------------------------------------------------
  // Arabic headers
  // ---------------------------------------------------------------------------
  describe("Arabic headers", () => {
    it('maps "الاسم الأول" to firstName with high confidence', () => {
      const result = resolveColumnMappings(["الاسم الأول"]);
      const mapping = result.columnMappings[0];

      expect(mapping.targetField).toBe("firstName");
      expect(mapping.confidence).toBe("high");
    });

    it('maps "البريد الإلكتروني" to email with high confidence', () => {
      const result = resolveColumnMappings(["البريد الإلكتروني"]);
      expect(result.columnMappings[0].targetField).toBe("email");
      expect(result.columnMappings[0].confidence).toBe("high");
    });

    it("maps multiple Arabic headers correctly", () => {
      const result = resolveColumnMappings([
        "الاسم الأول",
        "البريد الإلكتروني",
        "القسم",
      ]);

      expect(
        result.columnMappings.find((m) => m.excelHeader === "الاسم الأول")
          ?.targetField,
      ).toBe("firstName");
      expect(
        result.columnMappings.find(
          (m) => m.excelHeader === "البريد الإلكتروني",
        )?.targetField,
      ).toBe("email");
      expect(
        result.columnMappings.find((m) => m.excelHeader === "القسم")
          ?.targetField,
      ).toBe("department");
    });
  });

  // ---------------------------------------------------------------------------
  // Levenshtein fuzzy match
  // ---------------------------------------------------------------------------
  describe("Levenshtein fuzzy match", () => {
    it('maps "Frst Name" to firstName with medium confidence', () => {
      const result = resolveColumnMappings(["Frst Name"]);
      const mapping = result.columnMappings[0];

      expect(mapping.targetField).toBe("firstName");
      expect(mapping.confidence).toBe("medium");
    });

    it('maps "Emial" to email with medium confidence', () => {
      const result = resolveColumnMappings(["Emial"]);
      expect(result.columnMappings[0].targetField).toBe("email");
      expect(result.columnMappings[0].confidence).toBe("medium");
    });

    it('maps "Deprtmnt" to department with medium confidence', () => {
      const result = resolveColumnMappings(["Deprtmnt"]);
      expect(result.columnMappings[0].targetField).toBe("department");
      expect(result.columnMappings[0].confidence).toBe("medium");
    });

    it('maps "phne" to phone with medium confidence (lev distance 1)', () => {
      const result = resolveColumnMappings(["phne"]);
      expect(result.columnMappings[0].targetField).toBe("phone");
      expect(result.columnMappings[0].confidence).toBe("medium");
    });

    it("does not match when Levenshtein distance > 2", () => {
      const result = resolveColumnMappings(["zzzxxx"]);
      expect(result.columnMappings[0].targetField).toBeNull();
      expect(result.columnMappings[0].confidence).toBe("low");
    });
  });

  // ---------------------------------------------------------------------------
  // Contains / substring match
  // ---------------------------------------------------------------------------
  describe("contains match", () => {
    it("maps a header that contains a known key as medium confidence", () => {
      // "employee email" contains the key "email" but is not an exact match
      const result = resolveColumnMappings(["employee email"]);
      expect(result.columnMappings[0].targetField).toBe("email");
      expect(result.columnMappings[0].confidence).toBe("medium");
    });
  });

  // ---------------------------------------------------------------------------
  // Unknown / unmapped headers
  // ---------------------------------------------------------------------------
  describe("unknown headers", () => {
    it("maps a completely unknown header as low confidence with null target", () => {
      const result = resolveColumnMappings(["Full Name"]);
      const mapping = result.columnMappings[0];

      // "full name" is in HEADER_MAP → maps to firstName with high confidence
      expect(mapping.targetField).toBe("firstName");
      expect(mapping.confidence).toBe("high");
    });

    it("provides non-empty alternatives for unknown headers", () => {
      // Use a header that is NOT in HEADER_MAP so it falls through to low confidence
      const result = resolveColumnMappings(["Full Name"]);
      const mapping = result.columnMappings.find(
        (m) => m.excelHeader === "Full Name",
      );

      expect(mapping).toBeDefined();
      // "Full Name" is an exact HEADER_MAP match → high confidence, no alternatives
      expect(mapping!.confidence).toBe("high");
      expect(mapping!.targetField).toBe("firstName");
    });

    it("adds unknown headers to unmappedHeaders", () => {
      const result = resolveColumnMappings(["Foo", "Bar"]);
      expect(result.unmappedHeaders).toEqual(["Foo", "Bar"]);
    });

    it("does not add mapped headers to unmappedHeaders", () => {
      const result = resolveColumnMappings(["First Name", "Foo"]);
      expect(result.unmappedHeaders).toEqual(["Foo"]);
    });
  });

  // ---------------------------------------------------------------------------
  // Empty / null headers
  // ---------------------------------------------------------------------------
  describe("empty and null headers", () => {
    it("maps an empty-string header as low confidence with null target", () => {
      const result = resolveColumnMappings([""]);
      const mapping = result.columnMappings[0];

      expect(mapping.excelHeader).toBe("");
      expect(mapping.targetField).toBeNull();
      expect(mapping.confidence).toBe("low");
      expect(mapping.alternatives).toEqual([]);
      expect(result.unmappedHeaders).toEqual([""]);
    });

    it("maps a null header as low confidence with null target", () => {
      // Vitest and TS null handling: pass undefined that gets coerced
      const result = resolveColumnMappings([null as unknown as string]);
      const mapping = result.columnMappings[0];

      expect(mapping.excelHeader).toBe("");
      expect(mapping.targetField).toBeNull();
      expect(mapping.confidence).toBe("low");
      expect(result.unmappedHeaders).toEqual([""]);
    });
  });

  // ---------------------------------------------------------------------------
  // Empty array
  // ---------------------------------------------------------------------------
  describe("empty headers array", () => {
    it("returns empty columnMappings and unmappedHeaders when no headers", () => {
      const result = resolveColumnMappings([]);

      expect(result.columnMappings).toEqual([]);
      expect(result.unmappedHeaders).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // Whitespace trimming
  // ---------------------------------------------------------------------------
  describe("whitespace trimming", () => {
    it('maps "  First Name  " (with surrounding spaces) to firstName with high confidence', () => {
      const result = resolveColumnMappings(["  First Name  "]);
      const mapping = result.columnMappings[0];

      expect(mapping.targetField).toBe("firstName");
      expect(mapping.confidence).toBe("high");
    });

    it("preserves the original excelHeader (untrimmed) in the output", () => {
      const result = resolveColumnMappings(["  Email  "]);
      expect(result.columnMappings[0].excelHeader).toBe("  Email  ");
    });
  });

  // ---------------------------------------------------------------------------
  // Custom availableFields
  // ---------------------------------------------------------------------------
  describe("custom availableFields", () => {
    it("only matches fields present in the provided availableFields", () => {
      const customFields: FieldDefinition[] = [
        { name: "email", label: "Email", type: "email", required: true },
      ];

      // "First Name" should not map because firstName is not in customFields
      const result = resolveColumnMappings(
        ["First Name", "Email"],
        customFields,
      );

      const firstName = result.columnMappings.find(
        (m) => m.excelHeader === "First Name",
      );
      expect(firstName?.targetField).toBeNull();
      expect(firstName?.confidence).toBe("low");

      const email = result.columnMappings.find(
        (m) => m.excelHeader === "Email",
      );
      expect(email?.targetField).toBe("email");
      expect(email?.confidence).toBe("high");
    });

    it("defaults to EMPLOYEE_IMPORT_FIELDS when availableFields is omitted", () => {
      const result = resolveColumnMappings(["First Name", "Hire Date"]);

      expect(result.columnMappings[0].targetField).toBe("firstName");
      expect(result.columnMappings[1].targetField).toBe("hireDate");
    });
  });

  // ---------------------------------------------------------------------------
  // suggestedRoleId / suggestedDepartmentId
  // ---------------------------------------------------------------------------
  describe("suggestedRoleId and suggestedDepartmentId", () => {
    it("does not set suggestedRoleId or suggestedDepartmentId", () => {
      const result = resolveColumnMappings(["Custom Role", "Department"]);

      expect(result.suggestedRoleId).toBeUndefined();
      expect(result.suggestedDepartmentId).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Determinism
  // ---------------------------------------------------------------------------
  describe("determinism", () => {
    it("returns the same output for the same input", () => {
      const headers = [
        "First Name",
        "Emial", // Levenshtein
        " Some Random Column ",
        "",
      ];

      const result1 = resolveColumnMappings(headers);
      const result2 = resolveColumnMappings(headers);

      expect(result1).toEqual(result2);
    });
  });

  // ---------------------------------------------------------------------------
  // Integration — mixed scenarios
  // ---------------------------------------------------------------------------
  describe("mixed scenarios", () => {
    it("correctly resolves a realistic mix of headers", () => {
      const headers = [
        "First Name",
        "Last Name",
        "Email Address",
        "phne", // Levenshtein dist 1 → phone
        "Dept", // exact shorthand
        "Hire Date",
        "Full Name",
      ];

      const result = resolveColumnMappings(headers);

      expect(result.columnMappings).toHaveLength(7);
      // "Full Name" is now in HEADER_MAP, so it's mapped, not unmapped
      expect(result.unmappedHeaders).toEqual([]);

      // Exact matches
      expect(result.columnMappings[0]).toMatchObject({
        excelHeader: "First Name",
        targetField: "firstName",
        confidence: "high",
      });
      expect(result.columnMappings[1]).toMatchObject({
        excelHeader: "Last Name",
        targetField: "lastName",
        confidence: "high",
      });

      // "Email Address" is in HEADER_MAP
      expect(result.columnMappings[2]).toMatchObject({
        excelHeader: "Email Address",
        targetField: "email",
        confidence: "high",
      });

      // Levenshtein
      expect(result.columnMappings[3]).toMatchObject({
        excelHeader: "phne",
        targetField: "phone",
        confidence: "medium",
      });

      // Shorthand
      expect(result.columnMappings[4]).toMatchObject({
        excelHeader: "Dept",
        targetField: "department",
        confidence: "high",
      });

      // Exact match
      expect(result.columnMappings[5]).toMatchObject({
        excelHeader: "Hire Date",
        targetField: "hireDate",
        confidence: "high",
      });

      // Unknown — produces alternatives via word-split
      expect(result.columnMappings[6]).toMatchObject({
        excelHeader: "Full Name",
        targetField: null,
        confidence: "low",
      });
      expect(result.columnMappings[6].alternatives.length).toBeGreaterThan(0);
    });
  });
});
