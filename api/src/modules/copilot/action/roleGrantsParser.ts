import {
  getPermissionDefinition,
  type PermissionValue,
} from "../../permissions/permissions.catalog.js";
import type {
  PermissionGrant,
  PermissionScopes,
} from "../../permissions/permissions.types.js";
export type { PermissionGrant } from "../../permissions/permissions.types.js";
import { fetchRoleScopeOptions } from "../../roles/roles.taxonomy.js";
import { normalizeTaxonomyName } from "../../document-taxonomy/documentTaxonomy.normalization.js";

/**
 * Natural-language parsing for role permission grants. Turns free-text chat
 * answers ("view users and edit documents in the Finance department") into the
 * canonical PermissionGrant[] the roles service accepts, and drives the
 * incremental draft loop (permission list → per-permission scope refinement →
 * done).
 *
 * Authoritative server-side validation (delegable set, scope compatibility,
 * taxonomy existence) always runs in `createRole` — this parser only shapes
 * valid input and gives friendly feedback in chat.
 */

export interface RejectedGrantPhrase {
  phrase: string;
  permission: PermissionValue;
  label: string;
}

export interface ParseGrantsResult {
  /** Grants recognized in this answer (scopes resolved where mentioned). */
  grants: PermissionGrant[];
  /** Phrases that matched a known-but-not-delegable permission. */
  rejected: RejectedGrantPhrase[];
  /** The user signaled the end of the list ("that's all", "none", ...). */
  done: boolean;
  /** Permissions whose segment explicitly said unrestricted ("everything") —
   * their scope question counts as answered. */
  unrestrictedPermissions: PermissionValue[];
}

interface PermissionMatch {
  permission: PermissionValue;
  phrase: string;
  index: number;
}

interface ScopeTokens {
  unrestricted: boolean;
  selfOnly: boolean;
  departments: string[];
  categories: string[];
  classifications: string[];
}

interface ScopeOptionSet {
  departments: { id: string; name: string; normalizedName: string }[];
  categories: { name: string; normalizedName: string }[];
  classifications: { name: string; normalizedName: string }[];
}

const DONE_PHRASES = [
  "that's all", "that is all", "nothing else", "no more", "all set",
  "no thanks", "not now", "done", "skip", "none",
  "هذا كل شيء", "لا شيء", "لا يوجد", "انتهيت", "كفاية", "لا",
];

/** Recognized-but-not-delegable phrases → friendly rejection with a hint. */
const NON_DELEGABLE_PHRASES: { phrases: string[]; permission: PermissionValue; label: string; hint: string }[] = [
  { phrases: ["delete users", "remove users", "delete user", "remove user"], permission: "users:delete", label: "Remove Users", hint: "view/edit/invite users" },
  { phrases: ["assign roles", "assign role", "assign roles to users"], permission: "users:assign-role", label: "Assign Roles", hint: "view roles" },
  { phrases: ["create roles", "create role", "edit roles", "delete roles", "manage roles", "manage role"], permission: "roles:create", label: "Manage Roles", hint: "view roles" },
  { phrases: ["edit company settings", "change company settings", "update company settings", "change settings"], permission: "company-settings:update", label: "Edit Company Settings", hint: "view company settings" },
  { phrases: ["manage billing", "edit billing", "update billing", "cancel subscription", "change plan", "manage subscription"], permission: "billing:manage", label: "Manage Billing", hint: "view billing" },
  { phrases: ["audit logs", "view audit", "view audit logs", "see audit logs"], permission: "audit:read", label: "View Audit Logs", hint: "view billing" },
];

const PERMISSION_PHRASES: { permission: PermissionValue; phrases: string[] }[] = [
  {
    permission: "users:read",
    phrases: ["view users", "see users", "list users", "view the users", "view user", "see user", "عرض المستخدمين", "مشاهدة المستخدمين", "قائمة المستخدمين"],
  },
  {
    permission: "users:create",
    phrases: ["invite users", "invite user", "add users", "add user", "invite people", "invite new users", "create users", "create user", "دعوة مستخدمين", "دعوة مستخدم", "إضافة مستخدمين", "إضافة مستخدم"],
  },
  {
    permission: "users:update",
    phrases: ["edit users", "update users", "modify users", "edit user", "تعديل المستخدمين", "تحديث المستخدمين"],
  },
  {
    permission: "roles:read",
    phrases: ["view roles", "see roles", "view role", "عرض الأدوار", "مشاهدة الأدوار"],
  },
  {
    permission: "documents:read",
    phrases: ["view documents", "see documents", "read documents", "view document", "read document", "view files", "see files", "read files", "عرض المستندات", "مشاهدة المستندات", "قراءة المستندات"],
  },
  {
    permission: "documents:create",
    phrases: ["upload documents", "upload document", "create documents", "create document", "add documents", "add document", "upload files", "add files", "رفع المستندات", "إضافة مستندات", "إنشاء مستندات", "رفع مستندات"],
  },
  {
    permission: "documents:update",
    phrases: ["edit documents", "update documents", "modify documents", "edit document", "rename documents", "تعديل المستندات", "تحديث المستندات"],
  },
  {
    permission: "documents:delete",
    phrases: ["delete documents", "remove documents", "delete document", "remove document", "trash documents", "حذف المستندات", "إزالة المستندات"],
  },
  {
    permission: "documents:download",
    phrases: ["download documents", "download document", "download files", "تنزيل المستندات", "تحميل المستندات"],
  },
  {
    permission: "documents:archive",
    phrases: ["archive documents", "archive document", "restore documents", "restore document", "أرشفة المستندات", "استعادة المستندات"],
  },
  {
    permission: "documents:manage-access",
    phrases: ["manage access", "manage document access", "access control", "manage sharing", "control access", "إدارة الوصول", "التحكم بالوصول", "إدارة الصلاحيات"],
  },
  {
    permission: "documents:use-in-ai",
    phrases: ["use in ai", "use documents in ai", "use with ai", "use in the ai", "ai access", "استخدام في الذكاء الاصطناعي", "استخدام في ai"],
  },
  {
    permission: "documents:ocr-process",
    phrases: ["run ocr", "process ocr", "ocr processing", "ocr", "معالجة أو سي آر"],
  },
  {
    permission: "documents:quality-review",
    phrases: ["quality review", "review document quality", "quality control", "مراجعة الجودة", "مراجعة جودة"],
  },
  {
    permission: "chat:read",
    phrases: ["view conversations", "read conversations", "view chats", "view chat", "view messages", "view chat history", "read messages", "عرض المحادثات", "مشاهدة المحادثات", "قراءة المحادثات"],
  },
  {
    permission: "chat:create",
    phrases: ["create conversations", "start conversations", "create chats", "start chats", "send messages", "send chats", "chat", "إنشاء محادثات", "بدء محادثات", "إرسال رسائل", "محادثة"],
  },
  {
    permission: "chat:delete",
    phrases: ["delete conversations", "delete chats", "delete messages", "remove conversations", "حذف المحادثات", "حذف الرسائل"],
  },
  {
    permission: "analytics:read",
    phrases: ["view analytics", "see analytics", "view reports", "view insights", "view statistics", "analytics", "عرض التحليلات", "مشاهدة التحليلات", "عرض التقارير", "تحليلات"],
  },
  {
    permission: "analytics:export",
    phrases: ["export analytics", "export reports", "export insights", "تصدير التحليلات", "تصدير التقارير"],
  },
  {
    permission: "knowledge-gaps:read",
    phrases: ["view knowledge gaps", "see knowledge gaps", "knowledge gaps", "عرض الفجوات المعرفية", "فجوات المعرفة"],
  },
  {
    permission: "knowledge-gaps:update",
    phrases: ["resolve knowledge gaps", "update knowledge gaps", "fix knowledge gaps", "manage knowledge gaps", "حل الفجوات المعرفية", "معالجة الفجوات المعرفية"],
  },
  {
    permission: "feedback:create",
    phrases: ["submit feedback", "give feedback", "send feedback", "leave feedback", "تقديم ملاحظات", "إرسال ملاحظات"],
  },
  {
    permission: "feedback:read",
    phrases: ["view feedback", "see feedback", "read feedback", "عرض الملاحظات", "مشاهدة الملاحظات"],
  },
  {
    permission: "company-settings:read",
    phrases: ["view company settings", "view settings", "see company settings", "view tenant settings", "عرض إعدادات الشركة", "مشاهدة إعدادات الشركة"],
  },
  {
    permission: "billing:read",
    phrases: ["view billing", "see billing", "view bills", "view invoices", "billing", "عرض الفواتير", "مشاهدة الفواتير"],
  },
  {
    permission: "imports:create",
    phrases: ["create imports", "start imports", "run imports", "start an import", "import documents", "إنشاء عمليات استيراد", "بدء استيراد"],
  },
  {
    permission: "imports:read",
    phrases: ["view imports", "see imports", "read imports", "imports", "عرض عمليات الاستيراد", "مشاهدة عمليات الاستيراد"],
  },
  {
    permission: "notifications:read",
    phrases: ["view notifications", "see notifications", "read notifications", "notifications", "عرض الإشعارات", "مشاهدة الإشعارات"],
  },
  {
    permission: "notifications:update",
    phrases: ["manage notifications", "update notifications", "dismiss notifications", "notification settings", "إدارة الإشعارات", "تحديث الإشعارات"],
  },
];

const UNRESTRICTED_PHRASES = [
  "everything", "all", "full access", "everywhere", "entire company", "whole company",
  "كل شيء", "الكل", "كله", "جميع المستندات", "الشركة كاملة",
];

const SELF_ONLY_PHRASES = [
  "their own", "own data", "own work", "own records", "own files", "only themselves",
  "their own documents", "themselves only",
  "بياناتهم فقط", "محتواهم فقط", "أعمالهم فقط", "فقط أعمالهم", "خاصة بهم",
];

const SELF_ONLY_CONTEXT_PHRASES = [
  "only their own", "just their own", "only their", "just their",
  "فقط", "فقط ما يخصهم",
];

/** Sorted phrase table (longest first) for deterministic matching. */
const MATCH_TABLE: { permission: PermissionValue; phrase: string }[] = [
  ...PERMISSION_PHRASES.flatMap((entry) =>
    entry.phrases.map((phrase) => ({ permission: entry.permission, phrase }))),
  ...NON_DELEGABLE_PHRASES.flatMap((entry) =>
    entry.phrases.map((phrase) => ({ permission: entry.permission, phrase }))),
].sort((left, right) => right.phrase.length - left.phrase.length);

const DONE_SET = new Set(DONE_PHRASES.map((phrase) => phrase.toLowerCase()));

function findPermissionMatches(text: string): PermissionMatch[] {
  const lower = text.toLowerCase();
  const matches: PermissionMatch[] = [];
  const consumed: { start: number; end: number }[] = [];
  for (const entry of MATCH_TABLE) {
    let searchFrom = 0;
    while (searchFrom < lower.length) {
      const index = lower.indexOf(entry.phrase, searchFrom);
      if (index < 0) break;
      const start = index;
      const end = index + entry.phrase.length;
      const overlaps = consumed.some(
        (region) => start < region.end && end > region.start,
      );
      if (!overlaps) {
        consumed.push({ start, end });
        matches.push({ permission: entry.permission, phrase: entry.phrase, index: start });
      }
      searchFrom = end;
    }
  }
  return matches.sort((left, right) => left.index - right.index);
}

/** Removes every recognized permission phrase from a string, returning the
 * remaining scope-bearing text. Used when a scope answer echoes a permission
 * keyword (e.g. "all analytics" → "all") so the leading scope word is not
 * lost to segment slicing. */
export function stripPermissionKeywords(text: string): string {
  let result = text;
  const matches = findPermissionMatches(text).sort(
    (left, right) => right.index - left.index,
  );
  for (const match of matches) {
    result =
      result.slice(0, match.index) + result.slice(match.index + match.phrase.length);
  }
  return result.trim();
}

function isDoneAnswer(text: string): boolean {
  const lower = text.trim().toLowerCase();
  if (lower.length === 0) return false;
  return DONE_SET.has(lower) || DONE_SET.has(lower.replace(/[.!?]+$/, ""));
}

function hasSelfOnlyContext(text: string): boolean {
  const lower = text.toLowerCase();
  return SELF_ONLY_CONTEXT_PHRASES.some((phrase) => lower.includes(phrase));
}

function parseScopeTokens(
  segment: string,
  options: ScopeOptionSet,
): ScopeTokens {
  const lower = segment.toLowerCase();
  const tokens: ScopeTokens = {
    unrestricted: false,
    selfOnly: false,
    departments: [],
    categories: [],
    classifications: [],
  };
  if (UNRESTRICTED_PHRASES.some((phrase) => lower.includes(phrase))) {
    tokens.unrestricted = true;
    return tokens;
  }
  if (SELF_ONLY_PHRASES.some((phrase) => lower.includes(phrase)) || hasSelfOnlyContext(segment)) {
    tokens.selfOnly = true;
    return tokens;
  }
  for (const option of options.departments) {
    if (lower.includes(option.normalizedName) || lower.includes(option.name.toLowerCase())) {
      tokens.departments.push(option.id);
    }
  }
  for (const option of options.categories) {
    if (lower.includes(option.normalizedName) || lower.includes(option.name.toLowerCase())) {
      tokens.categories.push(option.name);
    }
  }
  for (const option of options.classifications) {
    if (lower.includes(option.normalizedName) || lower.includes(option.name.toLowerCase())) {
      tokens.classifications.push(option.name);
    }
  }
  return tokens;
}

function scopesFromTokens(tokens: ScopeTokens): PermissionScopes | undefined {
  const hasAny =
    tokens.selfOnly ||
    tokens.departments.length > 0 ||
    tokens.categories.length > 0 ||
    tokens.classifications.length > 0;
  if (!hasAny) return undefined;
  return {
    selfOnly: tokens.selfOnly,
    departmentIds: [...new Set(tokens.departments)].sort(),
    documentCategories: [...new Set(tokens.categories.map((name) => normalizeTaxonomyName(name)))].sort(),
    documentClassifications: [...new Set(tokens.classifications.map((name) => normalizeTaxonomyName(name)))].sort(),
  };
}

export function grantsNeedScope(grant: PermissionGrant): boolean {
  if (grant.scopes) return false;
  return (getPermissionDefinition(grant.permission)?.compatibleScopes.length ?? 0) > 0;
}

/** The first grant (catalog order) whose scope still needs to be resolved.
 * `resolved` lists permissions whose scope question was already answered
 * (needed because an explicit "everything" leaves the grant unrestricted,
 * which is otherwise indistinguishable from an unanswered one). */
export function pendingScopeGrant(
  grants: readonly PermissionGrant[],
  resolved: ReadonlySet<string> = new Set(),
): PermissionGrant | null {
  for (const grant of [...grants].sort((left, right) => left.permission.localeCompare(right.permission))) {
    if (grantsNeedScope(grant) && !resolved.has(grant.permission)) return grant;
  }
  return null;
}

export function mergeGrants(
  accumulated: readonly PermissionGrant[],
  additions: readonly PermissionGrant[],
): PermissionGrant[] {
  const merged = new Map<string, PermissionGrant>();
  for (const grant of accumulated) merged.set(grant.permission, grant);
  for (const grant of additions) {
    const existing = merged.get(grant.permission);
    if (existing && !grant.scopes) {
      // An unrestricted mention clears any previously attached scope.
      merged.set(grant.permission, { permission: grant.permission });
    } else if (existing) {
      // A scoped mention refines an unrestricted grant or extends an existing
      // scoped grant with the new constraints (arrays union, selfOnly ORs).
      const current = existing.scopes;
      const added = grant.scopes!;
      merged.set(grant.permission, {
        permission: grant.permission,
        scopes: {
          selfOnly: Boolean((current?.selfOnly ?? false) || added.selfOnly),
          departmentIds: [...new Set([...(current?.departmentIds ?? []), ...(added.departmentIds ?? [])])].sort(),
          documentCategories: [...new Set([...(current?.documentCategories ?? []), ...(added.documentCategories ?? [])])].sort(),
          documentClassifications: [...new Set([...(current?.documentClassifications ?? []), ...(added.documentClassifications ?? [])])].sort(),
        },
      });
    } else {
      merged.set(grant.permission, grant);
    }
  }
  return [...merged.values()].sort((left, right) =>
    left.permission.localeCompare(right.permission));
}

/** Short human summary of the grants, used as the draft transcript display. */
export function grantsSummary(grants: readonly PermissionGrant[]): string {
  if (grants.length === 0) return "none";
  return grants
    .map((grant) => {
      const label = getPermissionDefinition(grant.permission)?.label ?? grant.permission;
      if (!grant.scopes) return label;
      const parts: string[] = [];
      if (grant.scopes.selfOnly) parts.push("their own data");
      if (grant.scopes.departmentIds.length > 0) parts.push(`${grant.scopes.departmentIds.length} department(s)`);
      if (grant.scopes.documentCategories.length > 0) parts.push(`${grant.scopes.documentCategories.length} category/categories`);
      if (grant.scopes.documentClassifications.length > 0) parts.push(`${grant.scopes.documentClassifications.length} classification(s)`);
      return parts.length > 0 ? `${label} (${parts.join(", ")})` : label;
    })
    .join(", ");
}

export async function parseGrantsUtterance(opts: {
  text: string;
  tenantId: string;
  options?: ScopeOptionSet;
}): Promise<ParseGrantsResult> {
  const { text, tenantId } = opts;
  if (isDoneAnswer(text)) {
    return { grants: [], rejected: [], done: true, unrestrictedPermissions: [] };
  }

  const matches = findPermissionMatches(text);
  if (matches.length === 0) {
    return { grants: [], rejected: [], done: false, unrestrictedPermissions: [] };
  }

  const options =
    opts.options ?? (await loadScopeOptions(tenantId));

  const grants: PermissionGrant[] = [];
  const rejected: RejectedGrantPhrase[] = [];
  const unrestrictedPermissions: PermissionValue[] = [];
  const seenPermissions = new Set<PermissionValue>();

  for (let index = 0; index < matches.length; index += 1) {
    const match = matches[index];
    if (seenPermissions.has(match.permission)) continue;
    const next = matches.slice(index + 1).find((candidate) => !seenPermissions.has(candidate.permission));
    const segment = text.slice(match.index, next ? next.index : text.length);

    const definition = getPermissionDefinition(match.permission);
    const isDelegable = Boolean(
      definition && definition.tenantGrantable && definition.delegableByTenantAdmin,
    );
    if (!isDelegable) {
      const label = definition?.label ?? match.permission;
      rejected.push({ phrase: match.phrase, permission: match.permission, label });
      continue;
    }

    seenPermissions.add(match.permission);
    const tokens = parseScopeTokens(segment, options);
    if (tokens.unrestricted) {
      grants.push({ permission: match.permission });
      unrestrictedPermissions.push(match.permission);
      continue;
    }
    const scopes = scopesFromTokens(tokens);
    grants.push(scopes ? { permission: match.permission, scopes } : { permission: match.permission });
  }

  return { grants, rejected, done: false, unrestrictedPermissions };
}

/**
 * Turns a standalone scope answer ("only their own data", "in the Finance
 * department", "everything") into a PermissionScopes object. Returns undefined
 * when the text names no scope constraints. Used by the draft loop to resolve
 * the scope of the pending grant when an answer contains no permission phrases.
 */
export function resolveScopeFromText(opts: {
  text: string;
  options: ScopeOptionSet;
}): PermissionScopes | undefined {
  const tokens = parseScopeTokens(opts.text, opts.options);
  return scopesFromTokens(tokens);
}

/** True when the text is an explicit unrestricted answer ("everything"). */
export function isUnrestrictedAnswer(text: string): boolean {
  const lower = text.trim().toLowerCase();
  return UNRESTRICTED_PHRASES.some((phrase) => lower.includes(phrase));
}

export interface TenantScopeOptions {
  departments: { id: string; name: string; normalizedName: string }[];
  categories: { name: string; normalizedName: string }[];
  classifications: { name: string; normalizedName: string }[];
}

export async function loadScopeOptions(
  tenantId: string,
): Promise<ScopeOptionSet> {
  const options = await fetchRoleScopeOptions(tenantId, {
    departments: [],
    categories: [],
    classifications: [],
  });
  return {
    departments: options.departments.map((option) => ({
      id: option.id,
      name: option.name,
      normalizedName: option.normalizedName,
    })),
    categories: options.categories.map((option) => ({
      name: option.name,
      normalizedName: option.normalizedName,
    })),
    classifications: options.classifications.map((option) => ({
      name: option.name,
      normalizedName: option.normalizedName,
    })),
  };
}

export type { ScopeOptionSet };