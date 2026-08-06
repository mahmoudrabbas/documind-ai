import { z } from "zod";
import { BASE_ROLES, type BaseRole } from "../../common/auth/baseRoles.js";
import { chatWorkflowIdSchema, type ChatWorkflowId } from "./chatWorkflow.js";
import { objectIdSchema } from "./chatWorkflowContracts.js";

/**
 * Framework-neutral execution context for agents. Never an Express Request,
 * never defaults a role, and tenantId/actorId are server-authoritative: they
 * are sourced from the trusted request context, never from a model or handoff
 * payload.
 */
export interface AgentExecutionContext {
  readonly requestId: string;
  readonly traceId: string;
  readonly tenantId: string;
  readonly actorId: string;
  readonly actorRole: BaseRole;
  readonly actorEmail?: string;
  readonly conversationId: string;
  readonly workflowId: ChatWorkflowId;
  readonly permissions: readonly string[];
  readonly locale?: string;
}

export const baseRoleSchema = z.enum(BASE_ROLES);

export const agentExecutionContextSchema = z
  .object({
    requestId: z.string().trim().min(1).max(128),
    traceId: z.string().trim().min(1).max(128),
    tenantId: objectIdSchema,
    actorId: objectIdSchema,
    actorRole: baseRoleSchema,
    actorEmail: z.string().trim().email().max(320).optional(),
    conversationId: objectIdSchema,
    workflowId: chatWorkflowIdSchema,
    permissions: z.array(z.string().trim().min(1).max(128)).max(100).default([]),
    locale: z.string().trim().min(2).max(20).optional(),
  })
  .strict();

export type AgentExecutionContextInput = z.infer<
  typeof agentExecutionContextSchema
>;

export function normalizeAgentExecutionContext(
  input: unknown,
): AgentExecutionContext {
  const parsed = agentExecutionContextSchema.parse(input);
  return deepFreeze({ ...parsed, permissions: [...parsed.permissions] });
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const nested of Object.values(value as Record<string, unknown>)) {
      if (nested && typeof nested === "object") {
        deepFreeze(nested);
      }
    }
    return Object.freeze(value);
  }
  return value;
}
