import { Types as MongooseTypes } from "mongoose";
import { AppError } from "../../../common/errors/AppError.js";
import {
  ACTION_ANSWER_INVALID,
  ACTION_DRAFT_EXPIRED,
  ACTION_DRAFT_NOT_FOUND,
  BAD_REQUEST,
} from "../../../common/errors/errorCodes.js";
import type { ModelAdapter } from "../../agents/agents.types.js";
import type { ActionDraft, ActionQuestion } from "../action/action.contracts.js";
import type { ToolInputValidation } from "../action/extractActionInput.js";
import {
  extractEmail,
  extractMetadataChanges,
  extractRole,
  extractSettings,
  getActionInputQuestions,
  llmExtractToolInput,
} from "../action/extractActionInput.js";
import {
  grantsNeedScope,
  grantsSummary,
  isUnrestrictedAnswer,
  loadScopeOptions,
  mergeGrants,
  parseGrantsUtterance,
  pendingScopeGrant,
  resolveScopeFromText,
  stripPermissionKeywords,
  type PermissionGrant,
} from "../action/roleGrantsParser.js";
import { getPermissionDefinition } from "../../permissions/permissions.catalog.js";
import {
  extractDocumentNameFromUtterance,
  extractUserIdentityFromUtterance,
  resolveTargetFromUtterance,
} from "../action/resolveActionTarget.js";
import CopilotActionDraftModel, {
  type CopilotActionDraftDocument,
} from "./actionDraft.model.js";

const DRAFT_TTL_MS = 15 * 60 * 1000;
const MAX_QUESTION_RETRIES = 3;
const MAX_QUESTIONS = 10;

const ROLE_NAME_CHARSET = /^[\p{L}\p{N}\s'&.()-]+$/u;
const RESERVED_ROLE_NAMES = new Set(["super admin", "company admin", "employee"]);

/** Mirrors roles.validator.ts nameSchema so the draft catches bad names before
 * execution; returns a friendly message or null when the name is usable. */
function validateRoleName(raw: string): string | null {
  const name = raw.trim();
  if (name.length < 2 || name.length > 50)
    return "Role names must be 2-50 characters long.";
  if (!ROLE_NAME_CHARSET.test(name))
    return "Role names can only use letters, numbers, spaces and & . ' ( ) -.";
  if (RESERVED_ROLE_NAMES.has(name.toLowerCase().replaceAll("_", " ")))
    return "That name is reserved by the system. Try a different one.";
  return null;
}

/**
 * Incremental grants collection for roles.create. Each answer may (a) finish
 * the list ("that's all"), (b) add grants, (c) resolve the scope of a pending
 * grant ("their own data", "everything", "in the Finance department"), or
 * (d) be unparseable (soft retry). The accumulated grants persist in
 * `toolInput.grants` and the scope-resolved permissions in
 * `grantScopesResolved` between turns; `needsMore` keeps the field unanswered
 * so the question is re-posed until the user says they are done.
 */
async function collectRoleGrants(opts: {
  answer: string;
  tenantId: string;
  toolInput: Record<string, unknown>;
  locale: "en" | "ar";
  resolved: string[];
}): Promise<
  | { ok: true; value: unknown; display: string; needsMore?: boolean; message?: string; resolvedAdditions?: string[] }
  | { ok: false; display: string; message: string }
> {
  const { answer, tenantId, toolInput, locale, resolved } = opts;
  const accumulated: PermissionGrant[] = Array.isArray(toolInput.grants)
    ? (toolInput.grants as PermissionGrant[])
    : [];
  const resolvedSet = new Set(resolved);
  const parsed = await parseGrantsUtterance({ text: answer, tenantId });

  if (parsed.done) {
    return {
      ok: true,
      value: accumulated,
      display: grantsSummary(accumulated),
      needsMore: false,
    };
  }

  let merged: PermissionGrant[];
  let resolvedAdditions: string[] = [];

  const allParsedAlreadyAccumulated =
    parsed.grants.length > 0 &&
    parsed.grants.every((g) =>
      accumulated.some((a) => a.permission === g.permission),
    );
  const parsedGrantsCarryNoNewScope = !parsed.grants.some((g) => g.scopes);

  if (parsed.grants.length === 0 && parsed.rejected.length === 0) {
    // No permission phrases: this turn resolves the scope of the pending grant.
    const pending = pendingScopeGrant(accumulated, resolvedSet);
    if (!pending) {
      return {
        ok: false,
        display: answer,
        message:
          locale === "ar"
            ? "لم أتمكن من العثور على أي صلاحيات في هذه الجملة. جرّب صيغة مثل \"عرض المستخدمين\" أو \"تحميل المستندات\"، أو قل \"لا شيء\" إذا لم تكن هناك صلاحيات."
            : 'I couldn\'t find any permissions in that. Try something like "view users" or "upload documents", or say "none" for no permissions.',
      };
    }
    if (isUnrestrictedAnswer(answer)) {
      const targets = accumulated.filter(
        (g) => grantsNeedScope(g) && !resolvedSet.has(g.permission),
      );
      merged = accumulated;
      resolvedAdditions = targets.map((g) => g.permission);
    } else {
      const options = await loadScopeOptions(tenantId);
      const scopes = resolveScopeFromText({ text: answer, options });
      if (!scopes) {
        return {
          ok: false,
          display: answer,
          message:
            locale === "ar"
              ? "لم أتمكن من فهم النطاق. اذكر مثلاً \"كل شيء\"، أو \"بياناتهم الخاصة فقط\"، أو قسم/فئة/تصنيف محدد."
              : "I couldn't understand the scope. Mention e.g. \"everything\", \"only their own data\", or a specific department / category / classification.",
        };
      }
      merged = mergeGrants(accumulated, [
        { permission: pending.permission, scopes },
      ]);
      resolvedAdditions = [pending.permission];
    }
  } else if (
    allParsedAlreadyAccumulated &&
    parsedGrantsCarryNoNewScope &&
    parsed.rejected.length === 0
  ) {
    // The answer echoed permission keywords already in the list (e.g. "all
    // analytics") but named no new scopes. Treat it as scope resolution for the
    // pending grant(s); strip the echoed keywords so a leading scope word
    // ("all") is not lost to segment slicing.
    const options = await loadScopeOptions(tenantId);
    const remainder = stripPermissionKeywords(answer);
    const mentionedPending = accumulated.filter(
      (g) =>
        grantsNeedScope(g) &&
        !resolvedSet.has(g.permission) &&
        parsed.grants.some((pg) => pg.permission === g.permission),
    );
    const globalUnrestricted =
      isUnrestrictedAnswer(remainder) || isUnrestrictedAnswer(answer);
    if (globalUnrestricted) {
      const targets =
        mentionedPending.length > 0
          ? mentionedPending
          : accumulated.filter(
              (g) => grantsNeedScope(g) && !resolvedSet.has(g.permission),
            );
      merged = accumulated;
      resolvedAdditions = targets.map((g) => g.permission);
    } else {
      const target =
        mentionedPending[0] ?? pendingScopeGrant(accumulated, resolvedSet);
      if (!target) {
        return {
          ok: false,
          display: answer,
          message:
            locale === "ar"
              ? "لم أتمكن من العثور على أي صلاحيات في هذه الجملة."
              : "I could not find any permissions in that.",
        };
      }
      const scopes = resolveScopeFromText({ text: remainder, options });
      if (!scopes) {
        return {
          ok: false,
          display: answer,
          message:
            locale === "ar"
              ? "لم أتمكن من فهم النطاق. اذكر مثلا كل شيء، أو بياناتهم الخاصة فقط، أو قسم أو فئة أو تصنيف محدد."
              : "I could not understand the scope. Mention e.g. everything, only their own data, or a specific department, category, or classification.",
        };
      }
      merged = mergeGrants(accumulated, [
        { permission: target.permission, scopes },
      ]);
      resolvedAdditions = [target.permission];
    }
  } else {
    merged = mergeGrants(accumulated, parsed.grants);
    resolvedAdditions = [
      ...parsed.unrestrictedPermissions,
      ...parsed.rejected.map((item) => item.permission),
    ];
  }

  const display = grantsSummary(merged);
  const nextResolved = new Set([...resolvedSet, ...resolvedAdditions]);
  let message = "";
  if (parsed.rejected.length > 0) {
    const items = parsed.rejected.map((item) => item.label).join(", ");
    message +=
      locale === "ar"
        ? `لا يمكن تفويض بعض الصلاحيات ولم تتم إضافتها: ${items}. `
        : `Some permissions can't be delegated and were not added: ${items}. `;
  }
  const pendingList = [...merged]
    .sort((a, b) => a.permission.localeCompare(b.permission))
    .filter((g) => grantsNeedScope(g) && !nextResolved.has(g.permission));

  if (pendingList.length > 0) {
    const header =
      locale === "ar"
        ? "حدد النطاق لكل صلاحية:\n"
        : "Set the scope for each permission:\n";
    const bullets = pendingList
      .map((grant) => {
        const definition = getPermissionDefinition(grant.permission);
        const label = definition ? definition.label : grant.permission;
        const compatible = definition?.compatibleScopes ?? [];
        const opts: string[] = [locale === "ar" ? "كل شيء" : "everything"];
        if (compatible.includes("selfOnly")) {
          opts.push(
            locale === "ar" ? "بياناتهم الخاصة فقط" : "only their own data",
          );
        }
        if (
          compatible.includes("departmentIds") ||
          compatible.includes("documentCategories") ||
          compatible.includes("documentClassifications")
        ) {
          opts.push(
            locale === "ar"
              ? "أقسام أو فئات أو تصنيفات محددة"
              : "specific departments / categories / classifications",
          );
        }
        return locale === "ar"
          ? `• ${label} — ${opts.join("، ")}؟`
          : `• ${label} — ${opts.join(", ")}?`;
      })
      .join("\n");
    message += header + bullets;
  } else {
    message +=
      locale === "ar"
        ? "هل هناك أي صلاحيات أخرى؟ قل \u201cانتهى\u201d عندما تنتهي."
        : 'Anything else? Say "that is all" when you are done.';
  }

  return {
    ok: true,
    value: merged,
    display,
    needsMore: true,
    message,
    resolvedAdditions,
  };
}

export interface ActionDraftDeps {
  /** Validates a (possibly partial) tool input; the toolName is passed so one
   * validator factory can serve every draft. */
  validate: (
    input: Record<string, unknown>,
    toolName: string,
  ) => ToolInputValidation;
  schemaFields: Record<string, string>;
  model?: ModelAdapter;
}

export interface CreateActionDraftInput {
  toolName: string;
  toolInput: Record<string, unknown>;
  utterance: string;
  locale: "en" | "ar";
  tenantId: string;
  actorId: string;
  missing: string[];
  deps: ActionDraftDeps;
}

export interface ActionDraftAnswer {
  draftId: string;
  answer: string;
  tenantId: string;
  actorId: string;
  deps: ActionDraftDeps;
}

export type AnswerActionDraftResult =
  | { completed: false; draft: ActionDraft }
  | {
      completed: true;
      toolName: string;
      toolInput: Record<string, unknown>;
      locale: "en" | "ar";
      utterance: string;
    };

/**
 * Interactive parameter collection for copilot actions (guider.md §12/§16).
 * A draft holds a partially-filled tool input and asks for the remaining
 * fields in a stable order; answers are extracted deterministically and, when
 * a free-text answer yields nothing, with a bounded LLM fallback.
 */
export async function createActionDraft(
  input: CreateActionDraftInput,
): Promise<ActionDraft> {
  const fields = orderedQuestionFields(input.toolName, input.toolInput, input.missing);
  if (fields.length === 0) {
    throw new AppError(
      400,
      BAD_REQUEST,
      "No missing parameters to collect for this action",
    );
  }
  if (fields.length > MAX_QUESTIONS) {
    throw new AppError(
      400,
      BAD_REQUEST,
      "Action requires too many parameters",
    );
  }

  const now = new Date();
  const doc = await CopilotActionDraftModel.create({
    tenantId: new MongooseTypes.ObjectId(input.tenantId),
    actorId: new MongooseTypes.ObjectId(input.actorId),
    toolName: input.toolName,
    utterance: input.utterance,
    locale: input.locale,
    toolInput: input.toolInput,
    questionFields: fields,
    answered: [],
    retries: 0,
    status: "active",
    createdAt: now,
    updatedAt: now,
    expiresAt: new Date(now.getTime() + DRAFT_TTL_MS),
  });

  return toDraftDto(doc, input.toolName);
}

export async function answerActionDraft(
  input: ActionDraftAnswer,
): Promise<AnswerActionDraftResult> {
  const draft = await loadOwnedDraft(
    input.draftId,
    input.tenantId,
    input.actorId,
  );
  if (draft.status !== "active") {
    throw new AppError(400, BAD_REQUEST, "Action draft is already completed");
  }

  const currentField = nextUnansweredField(draft);
  if (!currentField) {
    return finalizeDraft(draft, input.deps);
  }

  const question = questionForField(draft, currentField);
  if (!question) {
    // The stable field list references a field the catalog no longer knows;
    // treat it as answered so the draft cannot stall on a phantom question.
    draft.answered = [...(draft.answered ?? []), { field: currentField, value: input.answer.trim() }];
    draft.updatedAt = new Date();
    await draft.save();
    return continueOrFinalize(draft, input.deps);
  }

  const extracted = await extractQuestionValue({
    question,
    toolName: draft.toolName,
    answer: input.answer,
    tenantId: input.tenantId,
    toolInput: draft.toolInput ?? {},
    locale: (draft.locale as "en" | "ar") ?? "en",
    resolvedGrants: draft.grantScopesResolved ?? [],
    deps: input.deps,
  });

  if (!extracted.ok) {
    draft.retries = (draft.retries ?? 0) + 1;
    if (draft.retries > MAX_QUESTION_RETRIES) {
      throw new AppError(400, ACTION_ANSWER_INVALID, extracted.message);
    }
    draft.updatedAt = new Date();
    await draft.save();
    return {
      completed: false,
      draft: toDraftDto(draft, draft.toolName, extracted.message),
    };
  }

  const toolInput = { ...(draft.toolInput ?? {}) };
  if (question.field === "changes" && extracted.value !== null && typeof extracted.value === "object") {
    // The metadata-changes question yields a patch object; merge it at the
    // top level (title/description/tags/...) so the result matches what the
    // deterministic extractor produces for the same request.
    Object.assign(toolInput, extracted.value);
  } else {
    toolInput[question.field] = extracted.value;
  }
  draft.toolInput = toolInput;
  if (question.field === "grants" && extracted.needsMore) {
    // Keep the grants field unanswered so the next question re-poses it with
    // the accumulated value; the (partially filled) grants persist in
    // toolInput between turns, and scope-resolved permissions in
    // grantScopesResolved.
    const resolvedAdditions = extracted.resolvedAdditions ?? [];
    if (resolvedAdditions.length > 0) {
      await CopilotActionDraftModel.findOneAndUpdate(
        { _id: draft._id, tenantId: draft.tenantId, actorId: draft.actorId, status: "active" },
        {
          $set: { toolInput: toolInput, updatedAt: new Date() },
          $addToSet: { grantScopesResolved: { $each: resolvedAdditions } },
        },
      );
    } else {
      draft.toolInput = toolInput;
      draft.retries = 0;
      draft.updatedAt = new Date();
      await draft.save();
    }
    draft.toolInput = toolInput;
    draft.grantScopesResolved = [
      ...new Set([...(draft.grantScopesResolved ?? []), ...resolvedAdditions]),
    ];
    draft.retries = 0;
    return {
      completed: false,
      draft: toDraftDto(draft, draft.toolName, extracted.message ?? null),
    };
  }
  draft.answered = [
    ...(draft.answered ?? []),
    { field: question.field, value: extracted.display },
  ];
  draft.retries = 0;
  draft.updatedAt = new Date();
  await draft.save();

  return continueOrFinalize(draft, input.deps);
}

export async function cancelActionDraft(input: {
  draftId: string;
  tenantId: string;
  actorId: string;
}): Promise<void> {
  await CopilotActionDraftModel.deleteOne({
    _id: new MongooseTypes.ObjectId(input.draftId),
    tenantId: new MongooseTypes.ObjectId(input.tenantId),
    actorId: new MongooseTypes.ObjectId(input.actorId),
  });
}

async function continueOrFinalize(
  draft: CopilotActionDraftDocument,
  deps: ActionDraftDeps,
): Promise<AnswerActionDraftResult> {
  if (nextUnansweredField(draft)) {
    return { completed: false, draft: toDraftDto(draft, draft.toolName) };
  }
  return finalizeDraft(draft, deps);
}

async function finalizeDraft(
  draft: CopilotActionDraftDocument,
  deps: ActionDraftDeps,
): Promise<AnswerActionDraftResult> {
  const toolInput = draft.toolInput ?? {};
  const validation = deps.validate(toolInput, draft.toolName);
  if (!validation.ok) {
    const retryField = validation.missing[0] ?? null;
    const retryQuestion = retryField
      ? questionForField(draft, retryField)
      : null;
    if (!retryQuestion) {
      // The retry field is outside the draft's question catalog — try to
      // auto-satisfy it from existing toolInput so the draft doesn't stall.
      const autoValue = retryField ? toolInput[retryField] : undefined;
      if (autoValue !== undefined && autoValue !== null && autoValue !== "") {
        draft.retries = (draft.retries ?? 0) + 1;
        if (draft.retries > MAX_QUESTION_RETRIES) {
          throw new AppError(
            400,
            ACTION_ANSWER_INVALID,
            "Unable to complete this action with the provided information. Please start over.",
          );
        }
        draft.answered = [
          ...(draft.answered ?? []),
          { field: retryField!, value: String(autoValue) },
        ];
        draft.updatedAt = new Date();
        await draft.save();
        return continueOrFinalize(draft, deps);
      }
      throw new AppError(
        400,
        ACTION_ANSWER_INVALID,
        "The provided information is not usable for this action. Please start over.",
      );
    }
    draft.retries = (draft.retries ?? 0) + 1;
    if (draft.retries > MAX_QUESTION_RETRIES) {
      throw new AppError(
        400,
        ACTION_ANSWER_INVALID,
        "Unable to complete this action with the provided information. Please start over.",
      );
    }
    draft.updatedAt = new Date();
    await draft.save();
    return { completed: false, draft: toDraftDto(draft, draft.toolName) };
  }

  // Atomic transition: only one concurrent answer can mark this draft as
  // completed. If findOneAndUpdate returns null, another request already won
  // the race — the draft is completed or expired.
  const updated = await CopilotActionDraftModel.findOneAndUpdate(
    {
      _id: draft._id,
      tenantId: draft.tenantId,
      actorId: draft.actorId,
      status: "active",
    },
    { $set: { status: "completed", updatedAt: new Date() } },
    { returnDocument: "after" },
  );
  if (!updated) {
    throw new AppError(410, ACTION_DRAFT_EXPIRED, "Action draft expired");
  }

  return {
    completed: true,
    toolName: draft.toolName,
    toolInput,
    locale: (draft.locale as "en" | "ar") ?? "en",
    utterance: draft.utterance || draft.toolName,
  };
}

async function loadOwnedDraft(
  draftId: string,
  tenantId: string,
  actorId: string,
): Promise<CopilotActionDraftDocument> {
  let objectId: MongooseTypes.ObjectId;
  try {
    objectId = new MongooseTypes.ObjectId(draftId);
  } catch {
    throw new AppError(404, ACTION_DRAFT_NOT_FOUND, "Action draft not found");
  }

  const draft = await CopilotActionDraftModel.findOne({
    _id: objectId,
    tenantId: new MongooseTypes.ObjectId(tenantId),
    actorId: new MongooseTypes.ObjectId(actorId),
  });
  if (!draft) {
    throw new AppError(404, ACTION_DRAFT_NOT_FOUND, "Action draft not found");
  }
  if (draft.expiresAt < new Date()) {
    await draft.deleteOne();
    throw new AppError(410, ACTION_DRAFT_EXPIRED, "Action draft expired");
  }
  return draft;
}

/**
 * The ordered set of fields still to collect. Computed once at creation so the
 * question order is stable even as earlier answers are merged into the input.
 */
function orderedQuestionFields(
  toolName: string,
  toolInput: Record<string, unknown>,
  missing: string[],
): string[] {
  const seen = new Set<string>();
  const fields: string[] = [];
  for (const question of getActionInputQuestions(toolName, toolInput, missing)) {
    if (!seen.has(question.field)) {
      seen.add(question.field);
      fields.push(question.field);
    }
  }
  return fields;
}

function nextUnansweredField(draft: CopilotActionDraftDocument): string | null {
  const answered = new Set((draft.answered ?? []).map((entry) => entry.field));
  for (const field of draft.questionFields ?? []) {
    if (!answered.has(field)) return field;
  }
  return null;
}

function questionForField(
  draft: CopilotActionDraftDocument,
  field: string,
): ActionQuestion | null {
  const questions = getActionInputQuestions(
    draft.toolName,
    draft.toolInput ?? {},
    draft.questionFields ?? [],
  );
  return questions.find((question) => question.field === field) ?? null;
}

async function extractQuestionValue(opts: {
  question: ActionQuestion;
  toolName: string;
  answer: string;
  tenantId: string;
  toolInput: Record<string, unknown>;
  locale: "en" | "ar";
  resolvedGrants: string[];
  deps: ActionDraftDeps;
}): Promise<
  | { ok: true; value: unknown; display: string; needsMore?: boolean; message?: string; resolvedAdditions?: string[] }
  | { ok: false; display: string; message: string }
> {
  const { question, toolName, answer, tenantId, toolInput, locale, resolvedGrants, deps } = opts;
  const trimmed = answer.trim();

  switch (question.type) {
    case "email": {
      const email = extractEmail(trimmed);
      if (!email)
        return {
          ok: false,
          display: trimmed,
          message: "I couldn't find an email address in that answer.",
        };
      return { ok: true, value: email, display: email };
    }
    case "enum": {
      const role = extractRole(trimmed) ?? matchEnumOption(question, trimmed);
      if (!role)
        return {
          ok: false,
          display: trimmed,
          message: "That doesn't match one of the available options.",
        };
      const label =
        question.options?.find((option) => option.value === role)?.label ?? role;
      return { ok: true, value: role, display: label };
    }
    case "text": {
      if (question.field === "changes") {
        const changes = extractMetadataChanges(trimmed);
        if (changes) {
          return { ok: true, value: changes, display: trimmed };
        }
        const llm = await llmFallbackForField(
          deps,
          toolName,
          trimmed,
          question.field,
        );
        if (llm && typeof llm[question.field] !== "undefined") {
          return {
            ok: true,
            value: llm[question.field],
            display: trimmed,
          };
        }
        return {
          ok: false,
          display: trimmed,
          message: 'I couldn\'t parse that. Try something like "title: New title".',
        };
      }
      if (trimmed.length === 0)
        return { ok: false, display: trimmed, message: "Please type an answer." };
      if (toolName === "roles.create" && question.field === "name") {
        const roleNameError = validateRoleName(trimmed);
        if (roleNameError)
          return { ok: false, display: trimmed, message: roleNameError };
      }
      return { ok: true, value: trimmed, display: trimmed };
    }
    case "document": {
      return resolveNamedTarget({
        toolName,
        answer: trimmed,
        tenantId,
        identityExtractor: extractDocumentNameFromUtterance,
        idField: "documentId",
      });
    }
    case "user": {
      return resolveNamedTarget({
        toolName,
        answer: trimmed,
        tenantId,
        identityExtractor: extractUserIdentityFromUtterance,
        idField: "targetUserId",
      });
    }
    case "settings": {
      const settings = extractSettings(trimmed);
      if (!settings)
        return {
          ok: false,
          display: trimmed,
          message: "I couldn't turn that into a setting change.",
        };
      return { ok: true, value: settings, display: trimmed };
    }
    case "grants": {
      return collectRoleGrants({ answer: trimmed, tenantId, toolInput, locale, resolved: resolvedGrants });
    }
    default:
      return {
        ok: false,
        display: trimmed,
        message: "I couldn't understand that answer.",
      };
  }
}

function matchEnumOption(
  question: ActionQuestion,
  answer: string,
): string | null {
  const lower = answer.toLowerCase();
  for (const option of question.options ?? []) {
    if (
      lower === option.value.toLowerCase() ||
      lower.includes(option.label.toLowerCase())
    ) {
      return option.value;
    }
  }
  return null;
}

async function resolveNamedTarget(opts: {
  toolName: string;
  answer: string;
  tenantId: string;
  identityExtractor: (text: string) => string | null;
  idField: string;
}): Promise<
  | { ok: true; value: unknown; display: string }
  | { ok: false; display: string; message: string }
> {
  const { toolName, answer, tenantId, identityExtractor, idField } = opts;
  const trimmed = answer.trim();
  // A draft answer is a direct answer to "Which document?" — when no quoted
  // name / "named X" / file-like token is present, treat the whole answer as
  // the name so bare words ("rules") are actually searched.
  const identity =
    identityExtractor(trimmed) ?? (trimmed.length > 0 ? trimmed : null);
  if (!identity) {
    return {
      ok: false,
      display: answer,
      message: "Please type the document or user name.",
    };
  }

  const resolved = await resolveTargetFromUtterance({
    toolName,
    utterance: identity,
    tenantId,
    bareName: true,
  });
  if (!resolved || resolved.idField !== idField) {
    return {
      ok: false,
      display: answer,
      message: "I couldn't find a matching document or user.",
    };
  }
  return { ok: true, value: resolved.id, display: identity };
}

async function llmFallbackForField(
  deps: ActionDraftDeps,
  toolName: string,
  answer: string,
  field: string,
): Promise<Record<string, unknown> | null> {
  if (!deps.model) return null;
  try {
    const result = await llmExtractToolInput({
      model: deps.model,
      toolName,
      utterance: answer,
      locale: "en",
      schemaFields: { [field]: deps.schemaFields[field] ?? field },
    });
    return typeof result[field] !== "undefined"
      ? { [field]: result[field] }
      : null;
  } catch {
    return null;
  }
}

function toDraftDto(
  doc: CopilotActionDraftDocument,
  toolName: string,
  message?: string | null,
): ActionDraft {
  const answered = doc.answered ?? [];
  const field = nextUnansweredField(doc);
  const question = field ? questionForField(doc, field) : null;
  const remaining = doc.questionFields?.length ?? 0;
  // During the grants sub-loop, show the real number of permissions still
  // waiting for a scope answer instead of the frozen "1 questions remaining".
  const accumulatedGrants = Array.isArray(doc.toolInput?.grants)
    ? (doc.toolInput!.grants as PermissionGrant[])
    : [];
  const resolvedScopes = doc.grantScopesResolved ?? [];
  const pendingScopeCount = accumulatedGrants.filter(
    (g) => grantsNeedScope(g) && !resolvedScopes.includes(g.permission),
  ).length;
  const baseRemaining = Math.max(remaining - answered.length, 0);
  const questionsRemaining =
    field === "grants" && pendingScopeCount > 0 ? pendingScopeCount : baseRemaining;
  return {
    draftId: String(doc._id),
    toolName,
    summary: doc.utterance || toolName,
    answered,
    question,
    questionsRemaining,
    ...(message ? { message } : {}),
  };
}
