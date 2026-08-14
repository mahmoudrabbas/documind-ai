import { getAuditWriter } from "../../common/observability/index.js";
import type { AgentExecutionContext } from "../agents/agentExecutionContext.js";

export type CopilotActionAuditOutcome = "EXECUTED" | "FAILED" | "REJECTED";

interface WriteCopilotActionAuditInput {
  outcome: CopilotActionAuditOutcome;
  context: Pick<
    AgentExecutionContext,
    "tenantId" | "actorId" | "actorEmail" | "actorRole"
  >;
  runId: string;
  toolName: string;
  toolInput?: Record<string, unknown>;
  error?: Record<string, unknown> | null;
  approvalId?: string | null;
}

/**
 * Emits a dedicated COPILOT_* audit row after a copilot tool execution (or a
 * rejected approval). Every row carries metadata.source="copilot" so copilot
 * activity can be filtered in the audit trail. Best-effort: a failing audit
 * write must never break the action run.
 */
export async function writeCopilotActionAudit(
  input: WriteCopilotActionAuditInput,
): Promise<void> {
  const action =
    input.outcome === "EXECUTED"
      ? "COPILOT_ACTION_EXECUTED"
      : input.outcome === "FAILED"
        ? "COPILOT_ACTION_FAILED"
        : "COPILOT_ACTION_REJECTED";
  const outcome =
    input.outcome === "EXECUTED"
      ? "SUCCESS"
      : input.outcome === "FAILED"
        ? "FAILURE"
        : "DENIED";

  try {
    await getAuditWriter().write({
      action,
      resourceType: "CopilotAction",
      resourceId: input.runId,
      tenantId: input.context.tenantId,
      actorId: input.context.actorId,
      actorEmail: input.context.actorEmail ?? null,
      actorRole: input.context.actorRole,
      actorKind: "USER",
      outcome,
      changes: {
        toolName: input.toolName,
        toolInput: input.toolInput ?? {},
      },
      metadata: {
        source: "copilot",
        runId: input.runId,
        toolName: input.toolName,
        approvalId: input.approvalId ?? null,
        error: input.error ?? null,
      },
    });
  } catch {
    // Best-effort observability — never fail the copilot run on an audit error.
  }
}
