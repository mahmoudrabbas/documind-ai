import type {
  FieldDefinition,
  ColumnMappingProposal,
} from "../ports/spreadsheetMappingAgent.port.js";
import { EMPLOYEE_IMPORT_FIELDS } from "../ports/spreadsheetMappingAgent.port.js";

// ---------------------------------------------------------------------------
// Deterministic header-to-field map — English + Arabic
// Direct copy from fakeSpreadsheetMappingAgent.ts (production service —
// the fake is for testing only, so we keep an independent copy here).
// ---------------------------------------------------------------------------
const HEADER_MAP: Record<string, string> = {
  "first name": "firstName",
  "firstname": "firstName",
  "fname": "firstName",
  "last name": "lastName",
  "lastname": "lastName",
  "lname": "lastName",
  "name": "firstName",           // treat bare "name" as firstName (not ideal but better than unmapped)
  "full name": "firstName",
  "email": "email",
  "e-mail": "email",
  "email address": "email",
  "department": "department",
  "dept": "department",
  "job title": "jobTitle",
  "jobtitle": "jobTitle",
  "title": "jobTitle",
  "position": "jobTitle",
  "custom role": "customRole",
  "customrole": "customRole",
  "role": "customRole",
  "language": "language",
  "lang": "language",
  "preferred language": "language",
  "prefered language": "language",
  "preferredlanguage": "language",
  "preferedlanguage": "language",
  "manager email": "managerEmail",
  "manageremail": "managerEmail",
  "manager": "managerEmail",
  "employee id": "employeeId",
  "employeeid": "employeeId",
  "employee id ": "employeeId", // handle extra space
  "id": "employeeId",
  "phone": "phone",
  "telephone": "phone",
  "mobile": "phone",
  "hire date": "hireDate",
  "hiredate": "hireDate",
  "start date": "hireDate",
  // Arabic
  "الاسم الأول": "firstName",
  "اسم العائلة": "lastName",
  "البريد الإلكتروني": "email",
  "القسم": "department",
  "المسمى الوظيفي": "jobTitle",
  "الدور المخصص": "customRole",
  "اللغة": "language",
};

// ---------------------------------------------------------------------------
// Levenshtein distance — deterministic, O(n*m), no external dependencies
// ---------------------------------------------------------------------------
function levenshtein(a: string, b: string): number {
  const an = a.length;
  const bn = b.length;

  // Short-circuit for identical strings
  if (a === b) return 0;
  if (an === 0) return bn;
  if (bn === 0) return an;

  // Use two-row technique to keep memory O(min(n,m))
  const [rowA, rowB] = an < bn ? [a, b] : [b, a];
  const [na, nb] = [rowA.length, rowB.length];

  let prev = new Uint32Array(na + 1);
  let curr = new Uint32Array(na + 1);

  for (let i = 0; i <= na; i++) prev[i] = i;

  for (let j = 1; j <= nb; j++) {
    curr[0] = j;
    for (let i = 1; i <= na; i++) {
      const cost = rowA[i - 1] === rowB[j - 1] ? 0 : 1;
      curr[i] = Math.min(
        prev[i] + 1,     // deletion
        curr[i - 1] + 1, // insertion
        prev[i - 1] + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }

  return prev[na];
}

// ---------------------------------------------------------------------------
// Fuzzy helpers
// ---------------------------------------------------------------------------

/** Returns the HEADER_MAP key with the smallest Levenshtein distance ≤ 2,
 *  or `null` when nothing qualifies. Filters by available fields. */
function bestFuzzyKey(
  header: string,
  availableFieldNames: Set<string>,
): string | null {
  let best: string | null = null;
  let bestDist = 3; // anything > 2 is rejected

  for (const key of Object.keys(HEADER_MAP)) {
    const target = HEADER_MAP[key];
    if (!availableFieldNames.has(target)) continue;

    const dist = levenshtein(header, key);
    if (dist < bestDist) {
      bestDist = dist;
      best = key;
    }
  }

  return best;
}

/** Returns the first HEADER_MAP key whose entry contains or is contained by
 *  the header string. Filters by available fields.
 *  Only called when exact and Levenshtein matching failed. */
function firstContainsKey(
  header: string,
  availableFieldNames: Set<string>,
): string | null {
  for (const key of Object.keys(HEADER_MAP)) {
    const target = HEADER_MAP[key];
    if (!availableFieldNames.has(target)) continue;

    if (header.includes(key) || key.includes(header)) {
      return key;
    }
  }
  return null;
}

/** Splits a header into alphanumeric words (by whitespace, hyphens,
 *  underscores). */
function splitWords(value: string): string[] {
  return value
    .split(/[\s_-]+/)
    .map((w) => w.trim())
    .filter((w) => w.length > 0);
}

/** Picks field names from `availableFields` whose name contains at least one
 *  word from the given header. */
function computeAlternatives(
  header: string,
  availableFields: FieldDefinition[],
): string[] {
  const words = splitWords(header.toLowerCase());
  if (words.length === 0) return [];

  return availableFields
    .filter((f) => words.some((w) => f.name.toLowerCase().includes(w)))
    .map((f) => f.name);
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolves raw XLSX headers (from `parseEmployeeSpreadsheet`) to known field
 * definitions using deterministic matching logic:
 *
 * 1. Exact trimmed case-insensitive match                 → "high" confidence
 * 2. Levenshtein distance ≤ 2                               → "medium" confidence
 * 3. Contains / substring match                             → "medium" confidence
 * 4. No match                                               → "low" confidence
 *
 * This is a pure synchronous function — it only resolves header-to-field
 * mappings. It does **not** need sample rows, roles, or departments.
 */
export function resolveColumnMappings(
  headers: string[],
  availableFields?: FieldDefinition[],
): ColumnMappingProposal {
  const fields = availableFields ?? EMPLOYEE_IMPORT_FIELDS;
  const availableFieldNames = new Set(fields.map((f) => f.name));

  const columnMappings: ColumnMappingProposal["columnMappings"] = [];
  const unmappedHeaders: string[] = [];

  for (const rawHeader of headers) {
    // -- null / undefined / empty → low confidence, no target ----------------
    if (rawHeader == null || rawHeader === "") {
      const normalized = rawHeader ?? "";
      columnMappings.push({
        excelHeader: normalized,
        targetField: null,
        confidence: "low",
        alternatives: [],
      });
      unmappedHeaders.push(normalized);
      continue;
    }

    const trimmed = rawHeader.trim();
    const lowered = trimmed.toLowerCase();

    // -- 1) Exact match (case-insensitive, trimmed) → high confidence --------
    const exactTarget = HEADER_MAP[lowered];
    if (exactTarget !== undefined && availableFieldNames.has(exactTarget)) {
      columnMappings.push({
        excelHeader: rawHeader,
        targetField: exactTarget,
        confidence: "high",
        alternatives: [],
      });
      continue;
    }

    // -- 2) Fuzzy — Levenshtein distance ≤ 2 → medium confidence -------------
    const fuzzyKey = bestFuzzyKey(lowered, availableFieldNames);
    if (fuzzyKey !== null) {
      columnMappings.push({
        excelHeader: rawHeader,
        targetField: HEADER_MAP[fuzzyKey],
        confidence: "medium",
        alternatives: [],
      });
      continue;
    }

    // -- 3) Contains match → medium confidence -------------------------------
    const containsKey = firstContainsKey(lowered, availableFieldNames);
    if (containsKey !== null) {
      columnMappings.push({
        excelHeader: rawHeader,
        targetField: HEADER_MAP[containsKey],
        confidence: "medium",
        alternatives: [],
      });
      continue;
    }

    // -- 4) No match → low confidence ----------------------------------------
    const alternatives = computeAlternatives(trimmed, fields);
    columnMappings.push({
      excelHeader: rawHeader,
      targetField: null,
      confidence: "low",
      alternatives,
    });
    unmappedHeaders.push(rawHeader);
  }

  // NOTE: suggestedRoleId and suggestedDepartmentId are intentionally left
  // undefined — they require sample-row / role / department context that is
  // outside the scope of this pure header resolver. The calling agent is
  // responsible for filling those fields.

  return {
    columnMappings,
    unmappedHeaders,
  };
}
