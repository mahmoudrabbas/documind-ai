// ---------------------------------------------------------------------------
// Pure deterministic validation engine for employee import rows.
// No AI, no side effects, no DB calls — all rules are synchronous.
// ---------------------------------------------------------------------------

import type { ParsedRow } from "../services/xlsxParser.service.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ResolvedMapping {
  fieldMap: Record<string, string>; // excelHeader → targetField (e.g. "First Name" → "firstName")
  unmappedHeaders: string[];
  mappedCount: number;
  totalHeaders: number;
  confidence: "high" | "medium" | "low";
}

export interface ValidationIssue {
  field: string;
  code: string;
  message: string;
}

export type RowState = "VALID" | "WARNING" | "INVALID";

export interface RowValidationResult {
  rowNumber: number;
  state: RowState;
  errors: ValidationIssue[];
  warnings: ValidationIssue[];
}

export interface BatchValidationResult {
  rows: RowValidationResult[];
  summary: {
    valid: number;
    warning: number;
    invalid: number;
  };
}

export interface ValidationContext {
  tenantId: string;
  existingEmails: Set<string>; // email → exists as active user
  existingUserIds: Map<string, string>; // email → userId for manager lookup
  tenantUserLimit: number;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^[\d\s+\-()]{7,20}$/;
const VALID_LANGUAGES = new Set(["en", "ar"]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Look up the raw value for a target field by walking the field map.
 * Returns `undefined` when the field isn't mapped or the header doesn't
 * exist in the row's raw data.
 */
function getMappedValue(
  row: ParsedRow,
  mapping: ResolvedMapping,
  targetField: string,
): string | undefined {
  for (const [excelHeader, field] of Object.entries(mapping.fieldMap)) {
    if (field === targetField) {
      return row.rawData[excelHeader];
    }
  }
  return undefined;
}

// ---------------------------------------------------------------------------
// validateRow — 10 deterministic rules
// ---------------------------------------------------------------------------

/**
 * Validate a single parsed row against the resolved mapping and tenant
 * context.  Returns the row's validation result with all errors and
 * warnings.
 *
 * Rules are applied in order.  Error states always take priority over
 * warning states.
 */
export function validateRow(params: {
  row: ParsedRow;
  mapping: ResolvedMapping;
  context: ValidationContext;
  existingEmailsInFile?: Map<string, number>;
  duplicateThreshold?: number;
}): RowValidationResult {
  const errors: ValidationIssue[] = [];
  const warnings: ValidationIssue[] = [];
  const threshold = params.duplicateThreshold ?? 2;

  // Pre-extract mapped values (all optional except email/firstName)
  const email = getMappedValue(params.row, params.mapping, "email");
  const firstName = getMappedValue(params.row, params.mapping, "firstName");
  const lastName = getMappedValue(params.row, params.mapping, "lastName");
  const language = getMappedValue(params.row, params.mapping, "language");
  const managerEmail = getMappedValue(params.row, params.mapping, "managerEmail");
  const phone = getMappedValue(params.row, params.mapping, "phone");
  const hireDate = getMappedValue(params.row, params.mapping, "hireDate");

  // ── Rule 1: Required fields ────────────────────────────────────────────────
  if (!email || email.trim() === "") {
    errors.push({
      field: "email",
      code: "REQUIRED_FIELD_MISSING",
      message: "Email is required",
    });
  }

  if (!firstName || firstName.trim() === "") {
    errors.push({
      field: "firstName",
      code: "REQUIRED_FIELD_MISSING",
      message: "First name is required",
    });
  }

  // ── Rule 2: Email format ───────────────────────────────────────────────────
  if (email && email.trim() !== "" && !EMAIL_REGEX.test(email.trim())) {
    errors.push({
      field: "email",
      code: "INVALID_EMAIL_FORMAT",
      message: `Email "${email}" is not a valid email format`,
    });
  }

  // ── Rule 3: Duplicate rows in file ─────────────────────────────────────────
  // The existingEmailsInFile value for this row's email is the 1-based
  // occurrence index (1 = first occurrence, 2 = second, etc.), assigned by
  // validateBatch as it iterates rows sequentially.
  if (email && params.existingEmailsInFile) {
    const occurrence = params.existingEmailsInFile.get(email) ?? 0;
    if (occurrence > threshold) {
      // 3rd+ occurrence with default threshold=2 → INVALID
      errors.push({
        field: "email",
        code: "DUPLICATE_EMAIL_IN_FILE",
        message: `Email "${email}" appears ${occurrence} times in the file`,
      });
    } else if (occurrence === threshold) {
      // 2nd occurrence with default threshold=2 → WARNING
      warnings.push({
        field: "email",
        code: "DUPLICATE_EMAIL_IN_FILE",
        message: `Email "${email}" appears multiple times in the file`,
      });
    }
    // 1st occurrence → passes silently
  }

  // ── Rule 4: Existing user ──────────────────────────────────────────────────
  if (email && params.context.existingEmails.has(email)) {
    warnings.push({
      field: "email",
      code: "USER_ALREADY_EXISTS",
      message: `User with email "${email}" already exists in the system`,
    });
  }

  // ── Rule 5: Name length (firstName / lastName) ─────────────────────────────
  for (const [field, value] of [
    ["firstName", firstName] as const,
    ["lastName", lastName] as const,
  ]) {
    if (value && value.trim() !== "") {
      const trimmed = value.trim();
      if (trimmed.length < 2 || trimmed.length > 120) {
        errors.push({
          field,
          code: "INVALID_NAME_LENGTH",
          message: `${field} must be between 2 and 120 characters`,
        });
      }
    }
  }

  // ── Rule 6: Language ───────────────────────────────────────────────────────
  if (language && language.trim() !== "") {
    if (!VALID_LANGUAGES.has(language.trim())) {
      warnings.push({
        field: "language",
        code: "INVALID_LANGUAGE",
        message: "Language must be 'en' or 'ar'. Defaulting to 'en'",
      });
    }
  }

  // ── Rule 7: Manager email ──────────────────────────────────────────────────
  if (managerEmail && managerEmail.trim() !== "") {
    const trimmedManager = managerEmail.trim();
    if (!EMAIL_REGEX.test(trimmedManager)) {
      errors.push({
        field: "managerEmail",
        code: "INVALID_MANAGER_EMAIL",
        message: `Manager email "${trimmedManager}" is not a valid email format`,
      });
    } else if (!params.context.existingUserIds.has(trimmedManager)) {
      warnings.push({
        field: "managerEmail",
        code: "MANAGER_NOT_FOUND",
        message: `Manager with email "${trimmedManager}" not found in the system`,
      });
    }
  }

  // ── Rule 8: Quota check ────────────────────────────────────────────────────
  // The total batch row count is injected into the map under an empty-string
  // sentinel key by validateBatch (empty strings are never valid email).
  if (params.existingEmailsInFile) {
    const totalBatchRows = params.existingEmailsInFile.get("") ?? 0;
    if (
      totalBatchRows > 0 &&
      totalBatchRows + params.context.existingEmails.size > params.context.tenantUserLimit
    ) {
      warnings.push({
        field: "email",
        code: "QUOTA_EXCEEDED",
        message: `Importing would exceed the tenant user limit of ${params.context.tenantUserLimit}`,
      });
    }
  }

  // ── Rule 9: Hire date format ───────────────────────────────────────────────
  if (hireDate && hireDate.trim() !== "") {
    const parsed = new Date(hireDate.trim());
    if (isNaN(parsed.getTime())) {
      warnings.push({
        field: "hireDate",
        code: "INVALID_DATE_FORMAT",
        message: `Hire date "${hireDate}" is not a valid date`,
      });
    }
  }

  // ── Rule 10: Phone format ──────────────────────────────────────────────────
  if (phone && phone.trim() !== "") {
    if (!PHONE_REGEX.test(phone.trim())) {
      warnings.push({
        field: "phone",
        code: "INVALID_PHONE_FORMAT",
        message: `Phone "${phone}" is not a valid phone number`,
      });
    }
  }

  // ── Determine row state ────────────────────────────────────────────────────
  // Error states take priority over warning states.
  const state: RowState =
    errors.length > 0 ? "INVALID" : warnings.length > 0 ? "WARNING" : "VALID";

  return {
    rowNumber: params.row.rowNumber,
    state,
    errors,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// validateBatch
// ---------------------------------------------------------------------------

/**
 * Validate a batch of parsed rows.  First counts email occurrences across
 * all rows for duplicate detection, then validates each row individually.
 *
 * Returns a `BatchValidationResult` with per-row results and summary counts.
 *
 * NOTE: This function is async to allow pre-fetching data in future versions.
 * For now, the caller is responsible for providing the `context` directly.
 */
export async function validateBatch(params: {
  tenantId: string;
  rows: ParsedRow[];
  mapping: ResolvedMapping;
  context: ValidationContext;
}): Promise<BatchValidationResult> {
  // ── 1. Count total email occurrences across all rows ────────────────────
  const totalCounts = new Map<string, number>();
  for (const row of params.rows) {
    const email = getMappedValue(row, params.mapping, "email");
    if (email) {
      totalCounts.set(email, (totalCounts.get(email) ?? 0) + 1);
    }
  }

  // ── 2. Validate each row sequentially, tracking occurrence index ────────
  // For duplicate detection, each row needs its 1-based occurrence index
  // (1st=VALID, 2nd=WARNING, 3rd+=INVALID).  We build a per-row map where
  // this row's email value is the occurrence index while other emails keep
  // their total count.
  const seenCounts = new Map<string, number>();
  const rows: RowValidationResult[] = [];

  for (const row of params.rows) {
    const email = getMappedValue(row, params.mapping, "email");
    let occurrenceIndex = 0;
    if (email) {
      const seen = seenCounts.get(email) ?? 0;
      occurrenceIndex = seen + 1;
      seenCounts.set(email, occurrenceIndex);
    }

    // Build a fresh map for this row.  We keep total counts for other emails
    // so the quota check can still compute total batch rows.  An empty-string
    // sentinel holds the exact total row count for the quota check.
    const totalBatchRows = params.rows.length;
    const perRowCounts = new Map(totalCounts);
    perRowCounts.set("", totalBatchRows);
    if (email) {
      perRowCounts.set(email, occurrenceIndex);
    }

    rows.push(
      validateRow({
        row,
        mapping: params.mapping,
        context: {
          tenantId: params.tenantId,
          existingEmails: params.context.existingEmails,
          existingUserIds: params.context.existingUserIds,
          tenantUserLimit: params.context.tenantUserLimit,
        },
        existingEmailsInFile: perRowCounts,
      }),
    );
  }

  // ── 3. Build summary ───────────────────────────────────────────────────
  let valid = 0;
  let warning = 0;
  let invalid = 0;

  for (const r of rows) {
    if (r.state === "VALID") valid++;
    else if (r.state === "WARNING") warning++;
    else invalid++;
  }

  return {
    rows,
    summary: { valid, warning, invalid },
  };
}
