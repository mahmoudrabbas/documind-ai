import { describe, it, expect } from "vitest";
import type { ParsedRow } from "../xlsxParser.service.js";
import {
  validateRow,
  validateBatch,
  type ResolvedMapping,
  type ValidationContext,
} from "../validationEngine.service.js";

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

function buildContext(overrides: Partial<ValidationContext> = {}): ValidationContext {
  return {
    tenantId: "tenant-1",
    existingEmails: new Set(),
    existingUserIds: new Map(),
    tenantUserLimit: 100,
    ...overrides,
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
// Tests — validateRow
// ---------------------------------------------------------------------------

describe("validateRow", () => {
  // ── Valid row ──────────────────────────────────────────────────────────
  it("returns VALID for a row with all valid fields", () => {
    const row = buildRow({
      "First Name": "Alice",
      "Last Name": "Smith",
      "Email": "alice@co.com",
      "Language": "en",
      "Phone": "+966501234567",
      "Hire Date": "2024-01-15",
    });

    const result = validateRow({
      row,
      mapping: FULL_MAPPING,
      context: buildContext(),
    });

    expect(result.state).toBe("VALID");
    expect(result.errors).toEqual([]);
    expect(result.warnings).toEqual([]);
  });

  // ── Missing required fields ────────────────────────────────────────────
  it("returns INVALID with REQUIRED_FIELD_MISSING when email is empty", () => {
    const row = buildRow({
      "First Name": "Alice",
      "Email": "",
    });

    const result = validateRow({
      row,
      mapping: MIN_MAPPING,
      context: buildContext(),
    });

    expect(result.state).toBe("INVALID");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("REQUIRED_FIELD_MISSING");
    expect(result.errors[0].field).toBe("email");
  });

  it("returns INVALID with REQUIRED_FIELD_MISSING when firstName is empty", () => {
    const row = buildRow({
      "First Name": "",
      "Email": "alice@co.com",
    });

    const result = validateRow({
      row,
      mapping: MIN_MAPPING,
      context: buildContext(),
    });

    expect(result.state).toBe("INVALID");
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].code).toBe("REQUIRED_FIELD_MISSING");
    expect(result.errors[0].field).toBe("firstName");
  });

  // ── Invalid email format ───────────────────────────────────────────────
  it("returns INVALID with INVALID_EMAIL_FORMAT for malformed email", () => {
    const row = buildRow({
      "First Name": "Alice",
      "Email": "notanemail",
    });

    const result = validateRow({
      row,
      mapping: MIN_MAPPING,
      context: buildContext(),
    });

    expect(result.state).toBe("INVALID");
    expect(result.errors.some((e) => e.code === "INVALID_EMAIL_FORMAT")).toBe(
      true,
    );
  });

  // ── Duplicate email in file ────────────────────────────────────────────
  it("marks 1st occurrence VALID, 2nd WARNING, 3rd INVALID for same email via occurrence-index map", () => {
    const mapping = MIN_MAPPING;
    const context = buildContext();
    const email = "dupe@co.com";

    // validateRow expects the map value for this row's email to be the
    // 1-based occurrence index (assigned by validateBatch as it iterates
    // sequentially).  Here we test each position directly:
    const r1 = validateRow({
      row: buildRow({ "First Name": "Person1", "Email": email }, 1),
      mapping,
      context,
      existingEmailsInFile: new Map([[email, 1]]), // 1st occurrence
    });
    expect(r1.state).toBe("VALID");

    const r2 = validateRow({
      row: buildRow({ "First Name": "Person2", "Email": email }, 2),
      mapping,
      context,
      existingEmailsInFile: new Map([[email, 2]]), // 2nd occurrence
    });
    expect(r2.state).toBe("WARNING");
    expect(r2.warnings[0].code).toBe("DUPLICATE_EMAIL_IN_FILE");

    const r3 = validateRow({
      row: buildRow({ "First Name": "Person3", "Email": email }, 3),
      mapping,
      context,
      existingEmailsInFile: new Map([[email, 3]]), // 3rd occurrence
    });
    expect(r3.state).toBe("INVALID");
    expect(r3.errors[0].code).toBe("DUPLICATE_EMAIL_IN_FILE");
  });

  it("returns WARNING for threshold-2 (2nd occurrence) via total-count map", () => {
    const email = "border@co.com";
    const result = validateRow({
      row: buildRow({ "First Name": "Person", "Email": email }),
      mapping: MIN_MAPPING,
      context: buildContext(),
      existingEmailsInFile: new Map([[email, 2]]), // 2nd occurrence = threshold
    });
    expect(result.state).toBe("WARNING");
    expect(result.warnings[0].code).toBe("DUPLICATE_EMAIL_IN_FILE");
  });

  it("returns INVALID for threshold+1 (3rd+ occurrence) via total-count map", () => {
    const email = "many@co.com";
    const result = validateRow({
      row: buildRow({ "First Name": "Person", "Email": email }),
      mapping: MIN_MAPPING,
      context: buildContext(),
      existingEmailsInFile: new Map([[email, 3]]), // 3rd occurrence > threshold
    });
    expect(result.state).toBe("INVALID");
    expect(result.errors[0].code).toBe("DUPLICATE_EMAIL_IN_FILE");
  });

  // ── Existing user ──────────────────────────────────────────────────────
  it("returns WARNING with USER_ALREADY_EXISTS when email already exists in system", () => {
    const row = buildRow({
      "First Name": "Bob",
      "Email": "bob@co.com",
    });
    const context = buildContext({
      existingEmails: new Set(["bob@co.com"]),
    });

    const result = validateRow({
      row,
      mapping: MIN_MAPPING,
      context,
    });

    expect(result.state).toBe("WARNING");
    expect(result.warnings[0].code).toBe("USER_ALREADY_EXISTS");
  });

  // ── Name length ────────────────────────────────────────────────────────
  it("returns INVALID with INVALID_NAME_LENGTH for firstName that is too short", () => {
    const row = buildRow({
      "First Name": "A",
      "Email": "alice@co.com",
    });

    const result = validateRow({
      row,
      mapping: MIN_MAPPING,
      context: buildContext(),
    });

    expect(result.state).toBe("INVALID");
    expect(result.errors[0].code).toBe("INVALID_NAME_LENGTH");
    expect(result.errors[0].field).toBe("firstName");
  });

  it("returns INVALID with INVALID_NAME_LENGTH for name longer than 120 chars", () => {
    const row = buildRow({
      "First Name": "A".repeat(121),
      "Email": "alice@co.com",
    });

    const result = validateRow({
      row,
      mapping: MIN_MAPPING,
      context: buildContext(),
    });

    expect(result.state).toBe("INVALID");
    expect(result.errors[0].code).toBe("INVALID_NAME_LENGTH");
  });

  // ── Unicode name ───────────────────────────────────────────────────────
  it("accepts Unicode names (Arabic / Chinese) as VALID", () => {
    const row = buildRow({
      "First Name": "أحمد",
      "Last Name": "محمد",
      "Email": "ahmed@co.com",
    });

    const result = validateRow({
      row,
      mapping: buildMapping({
        "First Name": "firstName",
        "Last Name": "lastName",
        "Email": "email",
      }),
      context: buildContext(),
    });

    expect(result.state).toBe("VALID");
  });

  // ── Language ───────────────────────────────────────────────────────────
  it("returns WARNING with INVALID_LANGUAGE for unsupported language", () => {
    const row = buildRow({
      "First Name": "Alice",
      "Email": "alice@co.com",
      "Language": "fr",
    });

    const result = validateRow({
      row,
      mapping: FULL_MAPPING,
      context: buildContext(),
    });

    expect(result.state).toBe("WARNING");
    expect(result.warnings[0].code).toBe("INVALID_LANGUAGE");
    expect(result.warnings[0].message).toContain("Defaulting to 'en'");
  });

  it("passes silently when language is missing (optional field)", () => {
    const row = buildRow({
      "First Name": "Alice",
      "Email": "alice@co.com",
    });

    const result = validateRow({
      row,
      mapping: MIN_MAPPING,
      context: buildContext(),
    });

    expect(result.state).toBe("VALID");
    expect(result.warnings).toHaveLength(0);
  });

  // ── Manager email ──────────────────────────────────────────────────────
  it("returns WARNING with MANAGER_NOT_FOUND when manager email not in existingUserIds", () => {
    const row = buildRow({
      "First Name": "Alice",
      "Email": "alice@co.com",
      "Manager Email": "manager@co.com",
    });

    const result = validateRow({
      row,
      mapping: FULL_MAPPING,
      context: buildContext({
        existingUserIds: new Map(),
      }),
    });

    expect(result.state).toBe("WARNING");
    expect(result.warnings[0].code).toBe("MANAGER_NOT_FOUND");
  });

  it("returns INVALID with INVALID_MANAGER_EMAIL for malformed manager email", () => {
    const row = buildRow({
      "First Name": "Alice",
      "Email": "alice@co.com",
      "Manager Email": "not-a-valid-email",
    });

    const result = validateRow({
      row,
      mapping: FULL_MAPPING,
      context: buildContext(),
    });

    expect(result.state).toBe("INVALID");
    expect(result.errors[0].code).toBe("INVALID_MANAGER_EMAIL");
  });

  // ── Quota exceeded ─────────────────────────────────────────────────────
  it("returns WARNING with QUOTA_EXCEEDED when batch + existing exceeds tenant limit", () => {
    const row = buildRow({
      "First Name": "Alice",
      "Email": "alice@co.com",
    });

    // 10 rows in batch + 95 existing = 105 > 100 limit
    // The empty-string sentinel holds the total batch row count (set by
    // validateBatch) so validateRow can compute the quota check.
    const existingEmailsInFile = new Map<string, number>([
      ["", 10], // sentinel: total batch rows
      ["alice@co.com", 1],
      ["bob@co.com", 1],
      ["carol@co.com", 1],
      ["dave@co.com", 1],
      ["eve@co.com", 1],
      ["frank@co.com", 1],
      ["grace@co.com", 1],
      ["heidi@co.com", 1],
      ["ivan@co.com", 1],
      ["judy@co.com", 1],
    ]);

    const context = buildContext({
      existingEmails: new Set(
        Array.from({ length: 95 }, (_, i) => `user${i}@co.com`),
      ),
      tenantUserLimit: 100,
    });

    const result = validateRow({
      row,
      mapping: MIN_MAPPING,
      context,
      existingEmailsInFile,
    });

    expect(result.state).toBe("WARNING");
    expect(result.warnings[0].code).toBe("QUOTA_EXCEEDED");
  });

  it("does NOT emit quota warning when batch + existing are within limit", () => {
    const row = buildRow({
      "First Name": "Alice",
      "Email": "alice@co.com",
    });

    const existingEmailsInFile = new Map<string, number>([
      ["", 3], // sentinel: 3 total batch rows
      ["alice@co.com", 1],
      ["bob@co.com", 1],
      ["carol@co.com", 1],
    ]);

    const context = buildContext({
      existingEmails: new Set(
        Array.from({ length: 95 }, (_, i) => `user${i}@co.com`),
      ),
      tenantUserLimit: 100,
    });

    const result = validateRow({
      row,
      mapping: MIN_MAPPING,
      context,
      existingEmailsInFile,
    });

    expect(result.state).toBe("VALID");
    const quotaWarning = result.warnings.find(
      (w) => w.code === "QUOTA_EXCEEDED",
    );
    expect(quotaWarning).toBeUndefined();
  });

  // ── Phone format ───────────────────────────────────────────────────────
  it("returns WARNING with INVALID_PHONE_FORMAT for invalid phone", () => {
    const row = buildRow({
      "First Name": "Alice",
      "Email": "alice@co.com",
      "Phone": "abc",
    });

    const result = validateRow({
      row,
      mapping: FULL_MAPPING,
      context: buildContext(),
    });

    expect(result.state).toBe("WARNING");
    expect(result.warnings[0].code).toBe("INVALID_PHONE_FORMAT");
  });

  it("passes phone validation for a valid Saudi mobile number", () => {
    const row = buildRow({
      "First Name": "Alice",
      "Email": "alice@co.com",
      "Phone": "+966501234567",
    });

    const result = validateRow({
      row,
      mapping: FULL_MAPPING,
      context: buildContext(),
    });

    expect(result.state).toBe("VALID");
    const phoneWarning = result.warnings.find(
      (w) => w.code === "INVALID_PHONE_FORMAT",
    );
    expect(phoneWarning).toBeUndefined();
  });

  // ── Date format ────────────────────────────────────────────────────────
  it("returns WARNING with INVALID_DATE_FORMAT for unparseable date", () => {
    const row = buildRow({
      "First Name": "Alice",
      "Email": "alice@co.com",
      "Hire Date": "not-a-date",
    });

    const result = validateRow({
      row,
      mapping: FULL_MAPPING,
      context: buildContext(),
    });

    expect(result.state).toBe("WARNING");
    expect(result.warnings[0].code).toBe("INVALID_DATE_FORMAT");
  });

  it("passes date validation for a valid ISO date", () => {
    const row = buildRow({
      "First Name": "Alice",
      "Email": "alice@co.com",
      "Hire Date": "2024-01-15",
    });

    const result = validateRow({
      row,
      mapping: FULL_MAPPING,
      context: buildContext(),
    });

    expect(result.state).toBe("VALID");
    const dateWarning = result.warnings.find(
      (w) => w.code === "INVALID_DATE_FORMAT",
    );
    expect(dateWarning).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Tests — validateBatch
// ---------------------------------------------------------------------------

describe("validateBatch", () => {
  it("validates a mixed batch with VALID, WARNING, and INVALID rows", async () => {
    const context = buildContext({
      existingEmails: new Set(["bob@co.com"]), // row 2 already exists
      tenantUserLimit: 100,
    });

    const rows: ParsedRow[] = [
      // Row 1: valid
      buildRow({ "First Name": "Alice", "Email": "alice@co.com" }, 2),
      // Row 2: already exists → warning
      buildRow({ "First Name": "Bob", "Email": "bob@co.com" }, 3),
      // Row 3: missing email → invalid
      buildRow({ "First Name": "Carol", "Email": "" }, 4),
      // Row 4: short name → invalid
      buildRow({ "First Name": "X", "Email": "xavier@co.com" }, 5),
      // Row 5: warning from language
      buildRow(
        {
          "First Name": "Diana",
          "Email": "diana@co.com",
          "Language": "fr",
        },
        6,
      ),
    ];

    // Build mapping that covers language for row 5
    const extendedMapping = buildMapping({
      "First Name": "firstName",
      "Email": "email",
      "Language": "language",
    });

    const result = await validateBatch({
      tenantId: "tenant-1",
      rows,
      mapping: extendedMapping,
      context,
    });

    expect(result.rows).toHaveLength(5);

    // Row states
    expect(result.rows[0].state).toBe("VALID");
    expect(result.rows[1].state).toBe("WARNING");
    expect(result.rows[1].warnings[0].code).toBe("USER_ALREADY_EXISTS");
    expect(result.rows[2].state).toBe("INVALID");
    expect(result.rows[2].errors[0].code).toBe("REQUIRED_FIELD_MISSING");
    expect(result.rows[3].state).toBe("INVALID");
    expect(result.rows[3].errors[0].code).toBe("INVALID_NAME_LENGTH");
    expect(result.rows[4].state).toBe("WARNING");
    expect(result.rows[4].warnings[0].code).toBe("INVALID_LANGUAGE");

    // Summary
    expect(result.summary).toEqual({
      valid: 1,
      warning: 2,
      invalid: 2,
    });
  });

  it("returns empty results for an empty row array", async () => {
    const result = await validateBatch({
      tenantId: "tenant-1",
      rows: [],
      mapping: MIN_MAPPING,
      context: buildContext(),
    });

    expect(result.rows).toEqual([]);
    expect(result.summary).toEqual({ valid: 0, warning: 0, invalid: 0 });
  });

  it("does not mutate input rows or context", async () => {
    const rows: ParsedRow[] = [
      buildRow({ "First Name": "Alice", "Email": "alice@co.com" }, 2),
      buildRow({ "First Name": "Bob", "Email": "bob@co.com" }, 3),
    ];
    const originalRows = JSON.parse(JSON.stringify(rows));
    const context = buildContext();
    const originalContext = JSON.parse(JSON.stringify(context));

    await validateBatch({
      tenantId: "tenant-1",
      rows,
      mapping: MIN_MAPPING,
      context,
    });

    expect(JSON.parse(JSON.stringify(rows))).toEqual(originalRows);
    expect(JSON.parse(JSON.stringify(context))).toEqual(originalContext);
  });
});
