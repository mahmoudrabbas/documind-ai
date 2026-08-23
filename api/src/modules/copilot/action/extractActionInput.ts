import type { ModelAdapter } from "../../agents/agents.types.js";

export interface ToolInputValidation {
  ok: boolean;
  /** Top-level field paths that are missing or invalid. */
  missing: string[];
}

/**
 * The copilot action tools whose input can be filled from free text, and the
 * question catalog each one exposes for the interactive action-input flow.
 * Every question maps to a deterministic extractor that also runs against the
 * original utterance, so answers and typed requests are parsed identically.
 */
export interface ActionInputQuestion {
  field: string;
  type: "text" | "email" | "enum" | "document" | "user" | "settings" | "grants";
  labelKey: string;
  /** Human-readable fallback label (English). */
  label: string;
  options?: { value: string; label: string }[];
}

const BASE_ROLE_OPTIONS: { value: string; label: string }[] = [
  { value: "COMPANY_ADMIN", label: "Company Admin" },
  { value: "EMPLOYEE", label: "Employee" },
];

export function getActionInputQuestions(
  toolName: string,
  input: Record<string, unknown>,
  missing: string[],
): ActionInputQuestion[] {
  const targetQuestion = (field: string, type: ActionInputQuestion["type"], labelKey: string, label: string) =>
    missing.includes(field) ||
    typeof input[field] !== "string" ||
    (input[field] as string).trim().length === 0
      ? [{ field, type, labelKey, label }]
      : [];

  switch (toolName) {
    case "user.invite":
      return [
        ...targetQuestion("name", "text", "copilot.action.input.field.user.invite.name", "What is the new user's full name?"),
        ...targetQuestion("email", "email", "copilot.action.input.field.user.invite.email", "What is the new user's email address?"),
        ...targetQuestion("role", "enum", "copilot.action.input.field.user.invite.role", "Which role should the new user have?").map((q) => ({
          ...q,
          options: BASE_ROLE_OPTIONS,
        })),
      ];

    case "roles.create":
      return [
        ...targetQuestion("name", "text", "copilot.action.input.field.roles.create.name", "What should the role be called?"),
        ...targetQuestion("baseRole", "enum", "copilot.action.input.field.roles.create.baseRole", "Which base role should the new role build on?").map((q) => ({
          ...q,
          options: BASE_ROLE_OPTIONS,
        })),
        ...targetQuestion("grants", "grants", "copilot.action.input.field.roles.create.grants", "What should this role be able to do? Describe the permissions in plain language, e.g. \"view users\", \"upload and edit documents\", \"view analytics\"."),
      ];

    case "document.get":
    case "document.archive":
    case "document.restore":
    case "document.softDelete":
    case "document.permanentDelete":
      return targetQuestion(
        "documentId",
        "document",
        "copilot.action.input.field.document.target",
        "Which document? Please type the document name.",
      );

    case "document.updateMetadata": {
      const documentQuestion = targetQuestion(
        "documentId",
        "document",
        "copilot.action.input.field.document.target",
        "Which document? Please type the document name.",
      );
      const changesQuestion = hasMetadataChange(input)
        ? []
        : [
            {
              field: "changes",
              type: "text" as const,
              labelKey: "copilot.action.input.field.document.updateMetadata.changes",
              label:
                "What should I change? For example: \"title: New title\" or \"category: HR\".",
            },
          ];
      return [...documentQuestion, ...changesQuestion];
    }

    case "user.resendInvitation":
    case "user.revokeInvitation":
    case "user.delete":
      return targetQuestion(
        "targetUserId",
        "user",
        "copilot.action.input.field.user.target",
        "Which user? Please type the user's email address or name.",
      );

    case "settings.update":
      return missing.includes("settings")
        ? [
            {
              field: "settings",
              type: "settings",
              labelKey: "copilot.action.input.field.settings.update.settings",
              label:
                "What setting would you like to change? For example: \"company name\", \"language to Arabic\", or \"turn off citations\".",
            },
          ]
        : [];

    default:
      return [];
  }
}

export function hasMetadataChange(input: Record<string, unknown>): boolean {
  return ["title", "description", "tags", "category", "department", "classification"]
    .some((key) => {
      const value = input[key];
      return (
        value !== undefined &&
        value !== null &&
        (typeof value !== "string" || value.trim().length > 0)
      );
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Deterministic extractors
// ─────────────────────────────────────────────────────────────────────────────

const EMAIL_PATTERN = /[\w.+-]+@[\w-]+\.[\w.]+/;

const ROLE_WORDS: Record<string, "COMPANY_ADMIN" | "EMPLOYEE"> = {
  admin: "COMPANY_ADMIN",
  administrator: "COMPANY_ADMIN",
  "company admin": "COMPANY_ADMIN",
  "company administrator": "COMPANY_ADMIN",
  manager: "COMPANY_ADMIN",
  employee: "EMPLOYEE",
  member: "EMPLOYEE",
  staff: "EMPLOYEE",
  regular: "EMPLOYEE",
  مسؤول: "COMPANY_ADMIN",
  مدير: "COMPANY_ADMIN",
  موظف: "EMPLOYEE",
  عضو: "EMPLOYEE",
};

export function extractEmail(text: string): string | null {
  const match = text.match(EMAIL_PATTERN);
  return match ? match[0] : null;
}

export function extractRole(text: string): "COMPANY_ADMIN" | "EMPLOYEE" | null {
  const lower = text.toLowerCase();
  for (const [keyword, role] of Object.entries(ROLE_WORDS)) {
    if (lower.includes(keyword)) return role;
  }
  if (/\b(admin|administrators?)\b/.test(lower)) return "COMPANY_ADMIN";
  return null;
}

/** Pull a plausible full name out of an invite utterance (quoted or pre-email). */
export function extractInviteName(
  utterance: string,
  email: string | null,
): string | null {
  const quoted = utterance.match(/["“"]([^"“”]{1,120})["”]/);
  if (quoted) return quoted[1].trim();

  const withoutEmail = email
    ? utterance.replace(new RegExp(EMAIL_PATTERN.source, "i"), "").trim()
    : utterance.trim();

  // "invite <name> as admin" / "invite <name>" / "دعوة <name>"
  const asMatch = withoutEmail.match(
    /^(?:invite|add|create|دعوة|أضف|أنشئ)\s+([^,;]+?)(?:\s+(?:as|with role|with the role)\s+.*)?$/i,
  );
  if (asMatch) {
    const candidate = asMatch[1].trim();
    if (candidate && candidate.length > 0) {
      return candidate.replace(/\s+$/, "").trim();
    }
  }

  return null;
}

/**
 * Pull a role name out of a "create a role" utterance. Returns null when no
 * plausible name is present — critically, the bare chip utterance "Create a
 * role" must NOT yield "a role" as a name.
 */
export function extractRoleName(text: string): string | null {
  const quoted = text.match(/["“"]([^"“”]{1,120})["”]/);
  if (quoted) return quoted[1].trim();

  const trimmed = text.trim();
  // "create (a|new) role named X" / "create a role called X"
  const named = trimmed.match(
    /^(?:create|add|new|أنشئ|أضف|إنشاء)\s+(?:a\s+)?(?:new\s+)?role\s+(?:named|called|called\s+the|with\s+name|باسم|يُسمى|يسمى)\s+["“]?([^"“”!?;,.]+)["”]?$/i,
  );
  if (named) {
    const candidate = named[1].trim();
    if (candidate && !/^role$/i.test(candidate)) return candidate;
  }
  // "role named X" / "role called X"
  const bare = trimmed.match(
    /^role\s+(?:named|called|باسم)\s+["“]?([^"“”!?;,.]+)["”]?$/i,
  );
  if (bare) {
    const candidate = bare[1].trim();
    if (candidate && !/^role$/i.test(candidate)) return candidate;
  }
  // Arabic: "أنشئ دورًا باسم X" / "أنشئ دور X" / "إنشاء دور باسم X"
  const arabic = trimmed.match(
    /^(?:أنشئ|إنشاء|أضف)\s+دور(?:ًا|ا)?\s+(?:باسم\s+)?["“]?([^"“”!?;,.]+)["”]?$/i,
  );
  if (arabic) {
    const candidate = arabic[1].trim();
    if (candidate && !/^دور$/i.test(candidate)) return candidate;
  }
  return null;
}

export function extractSettings(text: string): Record<string, unknown> | null {
  const lower = text.toLowerCase();
  const patch: Record<string, unknown> = {};

  // Language: require word boundaries AND a verb context to avoid false
  // positives (e.g. 'non-english contractor' should NOT trigger).
  if (/(?:\b(?:english|إنجليزي)\b|(?:make|set|change|اللغة)\s*(?:to|الى|إلى)?\s*(?:english)\b)/.test(lower)) {
    patch.defaultLanguage = "en";
  }
  if (/(?:\b(?:arabic|عربي|عربية)\b(?=.*(?:make|set|change|اللغة)))|(?:\b(?:make|set|change|اللغة)\s*(?:to|الى|إلى)?\s*(?:arabic)\b)/.test(lower)) {
    patch.defaultLanguage = "ar";
  }

  // Company name: require the phrase 'company name', not bare 'company'.
  const companyName = lower.match(/(?:set the company name to|company name)\s+(?:to|as|:)?\s*[“”"]?([^"!,;]{2,60})[“”"]?/i);
  if (companyName) {
    patch.profile = { ...(patch.profile as object | undefined), companyName: companyName[1].trim() };
  }

  const timezone = lower.match(/\btimezone\s*(?:to|as|:)?\s*[“”"]?([a-z/_-]{2,60})[“”"]?/i);
  if (timezone) {
    patch.profile = { ...(patch.profile as object | undefined), timezone: timezone[1].trim() };
  }

  if (/\b(?:disable|turn off|stop|deactivate|إيقاف|تعطيل)\b/.test(lower) && /\bcitations?\b/.test(lower)) {
    patch.aiRuntimePreferences = { ...(patch.aiRuntimePreferences as object | undefined), citationsEnabled: false };
  }
  if (/\b(?:enable|turn on|activate|تفعيل)\b/.test(lower) && /\bcitations?\b/.test(lower)) {
    patch.aiRuntimePreferences = { ...(patch.aiRuntimePreferences as object | undefined), citationsEnabled: true };
  }

  const style = lower.match(/(?:response style|style|أسلوب)\s*(?:to|as|:)?\s*[“”"]?(?:to\s+)?(concise|balanced|detailed)[“”"]?/i);
  if (style) {
    patch.aiRuntimePreferences = { ...(patch.aiRuntimePreferences as object | undefined), responseStyle: style[1] };
  }

  return Object.keys(patch).length > 0 ? patch : null;
}

/** Parse "title: X, description: Y" style changes into a metadata patch. */
export function extractMetadataChanges(text: string): Record<string, unknown> | null {
  const changes: Record<string, unknown> = {};
  const pairs = text.match(/(title|description|category|department|classification|tags)\s*[:=]\s*["“"]?([^"“”,;]+)["”]?/gi);
  if (pairs) {
    for (const pair of pairs) {
      const [, key, raw] = pair.match(/(title|description|category|department|classification|tags)\s*[:=]\s*["“"]?([^"“”,;]+)["”]?/i) ?? [];
      if (!key) continue;
      const value = raw.trim();
      if (key.toLowerCase() === "tags") {
        changes.tags = value.split(/[,،]/).map((tag) => tag.trim()).filter(Boolean);
      } else if (key.toLowerCase() === "classification") {
        if (["internal", "restricted", "confidential", "highly_confidential"].includes(value.toLowerCase())) {
          changes.classification = value.toLowerCase();
        }
      } else {
        changes[key.toLowerCase()] = value;
      }
    }
  }
  return Object.keys(changes).length > 0 ? changes : null;
}

export function extractSearchText(text: string): string | null {
  const lower = text.toLowerCase();
  const match = text.match(/(?:search|find|look for|ابحث|بحث)\s+["“]?([^"“”]{1,120})["”]?/i);
  if (match) return match[1].trim();
  if (lower.includes("search") || lower.includes("find") || lower.includes("بحث") || lower.includes("ابحث")) {
    const rest = text.replace(/(search|find|look for|ابحث|بحث)/i, "").trim();
    return rest.length > 0 ? rest : null;
  }
  return null;
}

export interface DeterministicExtractionResult {
  input: Record<string, unknown>;
}

/**
 * Deterministic, synchronous extraction of tool input fields from an
 * utterance. Synchronous because the supervisor's resolveToolInput hook runs
 * in the hot path; document/user target resolution needs the tenant and a DB
 * lookup, so it lives in the async answer flow instead.
 */
export function deterministicExtractToolInput(opts: {
  toolName: string;
  utterance: string;
}): Record<string, unknown> {
  const { toolName, utterance } = opts;
  if (!utterance || utterance.trim().length === 0) return {};
  const extracted: Record<string, unknown> = {};

  switch (toolName) {
    case "user.invite": {
      const email = extractEmail(utterance);
      if (email) extracted.email = email;
      const name = extractInviteName(utterance, email);
      if (name) extracted.name = name;
      const role = extractRole(utterance);
      if (role) extracted.role = role;
      break;
    }
    case "document.updateMetadata": {
      const changes = extractMetadataChanges(utterance);
      if (changes) Object.assign(extracted, changes);
      break;
    }
    case "document.search": {
      const search = extractSearchText(utterance);
      if (search) extracted.search = search;
      break;
    }
    case "settings.update": {
      const settings = extractSettings(utterance);
      if (settings) extracted.settings = settings;
      break;
    }
    case "roles.create": {
      const name = extractRoleName(utterance);
      if (name) extracted.name = name;
      // baseRole is always collected via the interactive draft's enum
      // question — do NOT extract it from the raw utterance to avoid
      // mis-inference (e.g. "named Manager" → COMPANY_ADMIN).
      break;
    }
    default:
      break;
  }

  return extracted;
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM fallback
// ─────────────────────────────────────────────────────────────────────────────

const LLM_EXTRACTION_PROMPT = `
You are a parameter-extraction helper for the DocuMind copilot. Given a user request and a target tool, extract the tool's input fields as a single JSON object.

Rules:
1. Only output JSON, nothing else.
2. Only include fields that are explicitly or clearly implied by the request.
3. For roles use exactly "EMPLOYEE" or "COMPANY_ADMIN".
4. If a value is missing or ambiguous, omit the field.
5. For roles.create grants, output an array of { permission, scopes? } with permission values like "documents:read"; scopes may carry selfOnly (boolean), departmentIds, documentCategories, documentClassifications; omit scopes for unrestricted access.
`.trim();

export async function llmExtractToolInput(opts: {
  model: ModelAdapter;
  toolName: string;
  utterance: string;
  locale: "en" | "ar";
  schemaFields: Record<string, string>;
}): Promise<Record<string, unknown>> {
  const { model, toolName, utterance, locale, schemaFields } = opts;
  const userContent = JSON.stringify({
    toolName,
    locale,
    request: utterance,
    availableFields: schemaFields,
  });
  const response = await model.complete({
    messages: [
      { role: "system", content: LLM_EXTRACTION_PROMPT },
      { role: "user", content: userContent },
    ],
    temperature: 0,
    maxTokens: 400,
    structuredOutput: { type: "json_object" },
  });
  const content = response.choices[0]?.message?.content ?? "";
  try {
    const parsed = JSON.parse(content);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // fall through — treat an unparseable LLM response as "nothing extracted"
  }
  return {};
}
