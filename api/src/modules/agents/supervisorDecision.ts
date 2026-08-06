import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { SUPERVISOR_DECISION_INVALID } from "../../common/errors/errorCodes.js";
import { BASE_ROLES } from "../../common/auth/baseRoles.js";
import { chatAgentIdSchema, type ChatAgentId } from "./chatAgents.js";

/**
 * Strict, runtime-validatable Supervisor decision contract.
 *
 * The model is only allowed to emit a single JSON object matching exactly one
 * of the five actions below. There is deliberately no free-text planning, no
 * prose extraction, and no fallback-to-current-agent behavior anywhere in this
 * contract. Malformed, fenced, or prose-wrapped output must fail closed.
 *
 * Every variant uses `.strict()`, so unknown keys are rejected. The
 * discriminated union is keyed on `action`, so unknown actions are rejected.
 * Action-specific invariants are encoded directly in each variant:
 *
 * - handoff requires `nextAgent` and rejects `toolName`/`toolInput`;
 * - tool_call requires `toolName` and `toolInput`;
 * - complete rejects any handoff target and requires `result`;
 * - fail requires a safe `error` object;
 * - await_approval requires `approval` metadata.
 */

export const SupervisorDecisionActionEnum = z.enum([
  "handoff",
  "tool_call",
  "complete",
  "fail",
  "await_approval",
]);
export type SupervisorDecisionAction = z.infer<
  typeof SupervisorDecisionActionEnum
>;

export const SupervisorDecisionErrorSchema = z
  .object({
    code: z.string().trim().min(1).max(100),
    message: z.string().trim().min(1).max(500),
  })
  .strict();

export type SupervisorDecisionError = z.infer<
  typeof SupervisorDecisionErrorSchema
>;

export const SupervisorDecisionApprovalSchema = z
  .object({
    action: z.string().trim().min(1).max(100),
    requiredRole: z.enum(BASE_ROLES),
  })
  .strict();

export type SupervisorDecisionApproval = z.infer<
  typeof SupervisorDecisionApprovalSchema
>;

const reasonCodeSchema = z.string().trim().min(1).max(100);

export const SupervisorHandoffDecisionSchema = z
  .object({
    action: z.literal("handoff"),
    currentAgent: chatAgentIdSchema,
    nextAgent: chatAgentIdSchema,
    reasonCode: reasonCodeSchema,
    payload: z.record(z.string(), z.unknown()).default({}),
    toolName: z.null().default(null),
    toolInput: z.null().default(null),
  })
  .strict();

export const SupervisorToolCallDecisionSchema = z
  .object({
    action: z.literal("tool_call"),
    currentAgent: chatAgentIdSchema,
    nextAgent: z.null().default(null),
    reasonCode: reasonCodeSchema,
    toolName: z.string().trim().min(1).max(120),
    toolInput: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const SupervisorCompleteDecisionSchema = z
  .object({
    action: z.literal("complete"),
    currentAgent: chatAgentIdSchema,
    nextAgent: z.null().default(null),
    reasonCode: reasonCodeSchema,
    result: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();

export const SupervisorFailDecisionSchema = z
  .object({
    action: z.literal("fail"),
    currentAgent: chatAgentIdSchema,
    nextAgent: z.null().default(null),
    reasonCode: reasonCodeSchema,
    error: SupervisorDecisionErrorSchema,
  })
  .strict();

export const SupervisorAwaitApprovalDecisionSchema = z
  .object({
    action: z.literal("await_approval"),
    currentAgent: chatAgentIdSchema,
    nextAgent: z.null().default(null),
    reasonCode: reasonCodeSchema,
    approval: SupervisorDecisionApprovalSchema,
  })
  .strict();

export const SupervisorDecisionSchema = z.discriminatedUnion("action", [
  SupervisorHandoffDecisionSchema,
  SupervisorToolCallDecisionSchema,
  SupervisorCompleteDecisionSchema,
  SupervisorFailDecisionSchema,
  SupervisorAwaitApprovalDecisionSchema,
]);

export type SupervisorDecision = z.infer<typeof SupervisorDecisionSchema>;
export type SupervisorHandoffDecision = z.infer<
  typeof SupervisorHandoffDecisionSchema
>;
export type SupervisorToolCallDecision = z.infer<
  typeof SupervisorToolCallDecisionSchema
>;
export type SupervisorCompleteDecision = z.infer<
  typeof SupervisorCompleteDecisionSchema
>;
export type SupervisorFailDecision = z.infer<typeof SupervisorFailDecisionSchema>;
export type SupervisorAwaitApprovalDecision = z.infer<
  typeof SupervisorAwaitApprovalDecisionSchema
>;

/**
 * Parses the trimmed model output strictly as a single JSON object and
 * validates it against the decision contract.
 *
 * Fail-closed rules:
 * - the whole trimmed response must be JSON (no prose wrapping);
 * - no Markdown code fences are accepted;
 * - no regex-based partial extraction;
 * - no silent repair of malformed JSON;
 * - no fallback to the current agent;
 * - raw malformed output is never persisted by callers.
 *
 * @throws AppError with SUPERVISOR_DECISION_INVALID on any failure.
 */
export function parseSupervisorDecision(content: string): SupervisorDecision {
  if (typeof content !== "string" || content.trim().length === 0) {
    throw new AppError(
      400,
      SUPERVISOR_DECISION_INVALID,
      "Supervisor output was empty; expected a single JSON object",
    );
  }

  const trimmed = content.trim();
  if (
    trimmed.startsWith("```") ||
    /^```json\b/i.test(trimmed) ||
    trimmed.endsWith("```")
  ) {
    throw new AppError(
      400,
      SUPERVISOR_DECISION_INVALID,
      "Supervisor output must not use Markdown code fences",
    );
  }

  if (trimmed.startsWith("{") === false) {
    throw new AppError(
      400,
      SUPERVISOR_DECISION_INVALID,
      "Supervisor output must be a single JSON object",
    );
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    throw new AppError(
      400,
      SUPERVISOR_DECISION_INVALID,
      "Supervisor output is not valid JSON",
    );
  }

  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new AppError(
      400,
      SUPERVISOR_DECISION_INVALID,
      "Supervisor output must be a JSON object",
    );
  }

  try {
    return SupervisorDecisionSchema.parse(parsed);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(
        400,
        SUPERVISOR_DECISION_INVALID,
        "Supervisor decision failed contract validation",
        error.issues,
      );
    }
    throw error;
  }
}

export function isSupervisorDecisionAction(
  value: unknown,
): value is SupervisorDecisionAction {
  return (
    typeof value === "string" &&
    (SupervisorDecisionActionEnum.options as readonly string[]).includes(value)
  );
}

export function supervisorDecisionCurrentAgent(
  decision: SupervisorDecision,
): ChatAgentId {
  return decision.currentAgent;
}
