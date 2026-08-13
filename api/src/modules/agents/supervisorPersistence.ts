import {
  completeRun,
  completeStep,
  completeToolCall,
  createApproval,
  createStep,
  createToolCall,
  getApproval as getApprovalRecord,
  getRun as getRunRecord,
  listApprovalsForRun,
  resolveApproval,
  startRun,
} from "./agents.repository.js";
import type {
  ApprovalRecord,
  RunRecord,
  RunSeed,
  RunStatus,
  StepGuardrailRecord,
  StepRecord,
  StepStatus,
  ToolCallRecord,
} from "./agents.types.js";

export type SupervisorStepAction =
  | "plan"
  | "tool_call"
  | "handoff"
  | "execute"
  | "guardrail"
  | "approval_requested"
  | "approval_resolved"
  | "completed"
  | "failed"
  | "cancelled";

export interface SupervisorStepDraft {
  runId: string;
  tenantId: string;
  stepIndex: number;
  agentName: string;
  action: SupervisorStepAction;
  input: Record<string, unknown>;
  guardrails: StepGuardrailRecord[];
  traceId: string;
  requestId: string;
}

export interface SupervisorStepPatch {
  status: StepStatus;
  output?: Record<string, unknown> | null;
  modelProvider?: string | null;
  modelName?: string | null;
  promptVersion?: string | null;
  tokensUsed?: number;
  estimatedCost?: number;
  latencyMs?: number;
  error?: Record<string, unknown> | null;
  toolCallsCount?: number;
  approvalsCount?: number;
  handoffToAgent?: string | null;
  previousAgent?: string | null;
  guardrails?: StepGuardrailRecord[];
}

export interface SupervisorToolCallDraft {
  runId: string;
  stepId: string | null;
  tenantId: string;
  toolName: string;
  toolVersion: string;
  input: Record<string, unknown>;
  traceId: string;
  requestId: string;
}

export interface SupervisorToolCallPatch {
  status: string;
  output?: Record<string, unknown> | null;
  error?: Record<string, unknown> | null;
  latencyMs?: number;
  tokensUsed?: number;
  estimatedCost?: number;
  approvalId?: string | null;
}

export interface SupervisorApprovalDraft {
  tenantId: string;
  actorId: string;
  runId: string;
  stepId?: string | null;
  toolCallId?: string | null;
  requestedBy: string;
  approverRole: string | null;
  context: Record<string, unknown>;
  ttlMs: number;
  traceId: string;
}

export interface SupervisorRunPatch {
  status: RunStatus;
  output?: Record<string, unknown> | null;
  totalSteps?: number;
  totalToolCalls?: number;
  totalTokensUsed?: number;
  estimatedCost?: number;
  latencyMs?: number;
  error?: Record<string, unknown> | null;
  guardrailResult?: Record<string, unknown> | null;
  approvalsCount?: number;
  handoffsCount?: number;
}

/**
 * Persistence boundary used by the SupervisorRuntime. The Mongo-backed
 * implementation delegates to the existing agents repository; the in-memory
 * implementation exists so the runtime is fully testable without a database.
 */
export interface SupervisorPersistence {
  /**
   * Marks an existing pending run as running, or (when a `seed` is provided)
   * materializes the run row first so supervisors that never pre-created one
   * (e.g. the copilot supervisor) still get a durable, queryable run.
   */
  startRun(
    tenantId: string,
    runId: string,
    seed?: RunSeed,
  ): Promise<RunRecord | null>;
  getRun(tenantId: string, runId: string): Promise<RunRecord | null>;
  completeRun(
    tenantId: string,
    runId: string,
    patch: SupervisorRunPatch,
  ): Promise<RunRecord | null>;
  createStep(draft: SupervisorStepDraft): Promise<StepRecord>;
  completeStep(
    tenantId: string,
    stepId: string,
    patch: SupervisorStepPatch,
  ): Promise<StepRecord | null>;
  createToolCall(draft: SupervisorToolCallDraft): Promise<ToolCallRecord>;
  completeToolCall(
    tenantId: string,
    toolCallId: string,
    patch: SupervisorToolCallPatch,
  ): Promise<ToolCallRecord | null>;
  createApproval(draft: SupervisorApprovalDraft): Promise<ApprovalRecord>;
  getApproval(
    tenantId: string,
    approvalId: string,
  ): Promise<ApprovalRecord | null>;
  listApprovals(tenantId: string, runId: string): Promise<ApprovalRecord[]>;
  resolveApproval(
    tenantId: string,
    approvalId: string,
    status: "approved" | "rejected",
    approverId: string | null,
    note: string | null,
  ): Promise<ApprovalRecord | null>;
}

export class MongoSupervisorPersistence implements SupervisorPersistence {
  startRun(
    tenantId: string,
    runId: string,
    seed?: RunSeed,
  ): Promise<RunRecord | null> {
    return startRun(tenantId, runId, seed);
  }

  getRun(tenantId: string, runId: string): Promise<RunRecord | null> {
    return getRunRecord(tenantId, runId);
  }

  completeRun(
    tenantId: string,
    runId: string,
    patch: SupervisorRunPatch,
  ): Promise<RunRecord | null> {
    return completeRun(tenantId, runId, patch);
  }

  createStep(draft: SupervisorStepDraft): Promise<StepRecord> {
    return createStep({
      runId: draft.runId,
      tenantId: draft.tenantId,
      stepIndex: draft.stepIndex,
      agentName: draft.agentName,
      action: draft.action,
      input: draft.input,
      guardrails: draft.guardrails,
      traceId: draft.traceId,
      requestId: draft.requestId,
    });
  }

  completeStep(
    tenantId: string,
    stepId: string,
    patch: SupervisorStepPatch,
  ): Promise<StepRecord | null> {
    return completeStep(tenantId, stepId, patch);
  }

  createToolCall(draft: SupervisorToolCallDraft): Promise<ToolCallRecord> {
    return createToolCall({
      runId: draft.runId,
      stepId: draft.stepId,
      tenantId: draft.tenantId,
      toolName: draft.toolName,
      toolVersion: draft.toolVersion,
      input: draft.input,
      traceId: draft.traceId,
      requestId: draft.requestId,
    });
  }

  completeToolCall(
    tenantId: string,
    toolCallId: string,
    patch: SupervisorToolCallPatch,
  ): Promise<ToolCallRecord | null> {
    return completeToolCall(tenantId, toolCallId, patch);
  }

  createApproval(draft: SupervisorApprovalDraft): Promise<ApprovalRecord> {
    return createApproval({
      tenantId: draft.tenantId,
      actorId: draft.actorId,
      runId: draft.runId,
      stepId: draft.stepId ?? null,
      toolCallId: draft.toolCallId ?? null,
      requestedBy: draft.requestedBy,
      approverRole: draft.approverRole,
      context: draft.context,
      ttlMs: draft.ttlMs,
      traceId: draft.traceId,
    });
  }

  getApproval(
    tenantId: string,
    approvalId: string,
  ): Promise<ApprovalRecord | null> {
    return getApprovalRecord(tenantId, approvalId);
  }

  listApprovals(tenantId: string, runId: string): Promise<ApprovalRecord[]> {
    return listApprovalsForRun(tenantId, runId);
  }

  resolveApproval(
    tenantId: string,
    approvalId: string,
    status: "approved" | "rejected",
    approverId: string | null,
    note: string | null,
  ): Promise<ApprovalRecord | null> {
    return resolveApproval(tenantId, approvalId, status, approverId, note);
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

function nextId(): string {
  return `mem-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
}

/**
 * Deterministic in-memory persistence for tests. Reproduces the same record
 * shapes the Mongo repository returns, including requestId/traceId continuity.
 */
export class InMemorySupervisorPersistence implements SupervisorPersistence {
  readonly runs = new Map<string, RunRecord>();
  readonly steps = new Map<string, StepRecord>();
  readonly toolCalls = new Map<string, ToolCallRecord>();
  readonly approvals = new Map<string, ApprovalRecord>();

  private seedRun(runId: string, tenantId: string): RunRecord {
    const existing = this.runs.get(runId);
    if (existing) return existing;
    const run: RunRecord = {
      id: runId,
      tenantId,
      actorId: "mem-actor",
      workflowName: "chat-rag-v1",
      agentName: "chat-supervisor",
      status: "pending",
      input: {},
      output: null,
      modelProvider: "fake",
      modelName: "fake-default",
      promptVersion: null,
      promptVersionId: null,
      toolVersionSnapshot: null,
      traceId: `trace-${runId}`,
      requestId: `request-${runId}`,
      totalSteps: 0,
      totalToolCalls: 0,
      totalTokensUsed: null,
      estimatedCost: null,
      latencyMs: null,
      error: null,
      guardrailResult: null,
      approvalsCount: 0,
      handoffsCount: 0,
      startedAt: null,
      finishedAt: null,
      createdAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.runs.set(runId, run);
    return run;
  }

  startRun(tenantId: string, runId: string): Promise<RunRecord | null> {
    const run = this.seedRun(runId, tenantId);
    if (run.status !== "pending") return Promise.resolve(null);
    const started: RunRecord = {
      ...run,
      status: "running",
      startedAt: nowIso(),
      updatedAt: nowIso(),
    };
    this.runs.set(runId, started);
    return Promise.resolve(started);
  }

  getRun(tenantId: string, runId: string): Promise<RunRecord | null> {
    const run = this.runs.get(runId);
    if (!run || run.tenantId !== tenantId) return Promise.resolve(null);
    return Promise.resolve(run);
  }

  completeRun(
    tenantId: string,
    runId: string,
    patch: SupervisorRunPatch,
  ): Promise<RunRecord | null> {
    const run = this.seedRun(runId, tenantId);
    if (run.tenantId !== tenantId) return Promise.resolve(null);
    const completed: RunRecord = {
      ...run,
      ...patch,
      updatedAt: nowIso(),
      finishedAt:
        patch.status === "completed" || patch.status === "failed"
          ? nowIso()
          : run.finishedAt,
    };
    this.runs.set(runId, completed);
    return Promise.resolve(completed);
  }

  createStep(draft: SupervisorStepDraft): Promise<StepRecord> {
    const step: StepRecord = {
      id: nextId(),
      runId: draft.runId,
      tenantId: draft.tenantId,
      stepIndex: draft.stepIndex,
      agentName: draft.agentName,
      action: draft.action,
      status: "running",
      input: draft.input,
      output: null,
      modelProvider: null,
      modelName: null,
      promptVersion: null,
      tokensUsed: null,
      estimatedCost: null,
      latencyMs: null,
      error: null,
      toolCallsCount: 0,
      approvalsCount: 0,
      handoffToAgent: null,
      previousAgent: null,
      guardrails: draft.guardrails,
      traceId: draft.traceId,
      requestId: draft.requestId,
      createdAt: nowIso(),
    };
    this.steps.set(step.id, step);
    return Promise.resolve(step);
  }

  completeStep(
    tenantId: string,
    stepId: string,
    patch: SupervisorStepPatch,
  ): Promise<StepRecord | null> {
    const step = this.steps.get(stepId);
    if (!step || step.tenantId !== tenantId) return Promise.resolve(null);
    const completed: StepRecord = { ...step, ...patch };
    this.steps.set(stepId, completed);
    return Promise.resolve(completed);
  }

  createToolCall(draft: SupervisorToolCallDraft): Promise<ToolCallRecord> {
    const toolCall: ToolCallRecord = {
      id: nextId(),
      runId: draft.runId,
      stepId: draft.stepId,
      tenantId: draft.tenantId,
      toolName: draft.toolName,
      toolVersion: draft.toolVersion,
      input: draft.input,
      output: null,
      status: "running",
      error: null,
      latencyMs: null,
      tokensUsed: null,
      estimatedCost: null,
      approvalRequired: false,
      approvalId: null,
      traceId: draft.traceId,
      requestId: draft.requestId,
      createdAt: nowIso(),
    };
    this.toolCalls.set(toolCall.id, toolCall);
    return Promise.resolve(toolCall);
  }

  completeToolCall(
    tenantId: string,
    toolCallId: string,
    patch: SupervisorToolCallPatch,
  ): Promise<ToolCallRecord | null> {
    const toolCall = this.toolCalls.get(toolCallId);
    if (!toolCall || toolCall.tenantId !== tenantId)
      return Promise.resolve(null);
    const completed: ToolCallRecord = {
      ...toolCall,
      ...(patch as Partial<ToolCallRecord>),
    };
    this.toolCalls.set(toolCallId, completed);
    return Promise.resolve(completed);
  }

  createApproval(draft: SupervisorApprovalDraft): Promise<ApprovalRecord> {
    const contextStr = JSON.stringify(draft.context);
    const contextHash = Buffer.from(contextStr, "utf8")
      .toString("base64")
      .slice(0, 128);
    const approval: ApprovalRecord = {
      id: nextId(),
      runId: draft.runId,
      stepId: draft.stepId ?? null,
      toolCallId: draft.toolCallId ?? null,
      status: "pending",
      requestedBy: draft.requestedBy,
      approverRole: draft.approverRole,
      approverId: null,
      contextHash,
      context: draft.context,
      decisionNote: null,
      resolvedAt: null,
      expiresAt: new Date(Date.now() + draft.ttlMs).toISOString(),
      createdAt: nowIso(),
    };
    this.approvals.set(approval.id, approval);
    return Promise.resolve(approval);
  }

  getApproval(
    _tenantId: string,
    approvalId: string,
  ): Promise<ApprovalRecord | null> {
    const approval = this.approvals.get(approvalId);
    if (!approval) return Promise.resolve(null);
    return Promise.resolve(approval);
  }

  listApprovals(_tenantId: string, runId: string): Promise<ApprovalRecord[]> {
    const approvals = [...this.approvals.values()].filter(
      (approval) => approval.runId === runId,
    );
    return Promise.resolve(approvals);
  }

  resolveApproval(
    tenantId: string,
    approvalId: string,
    status: "approved" | "rejected",
    approverId: string | null,
    note: string | null,
  ): Promise<ApprovalRecord | null> {
    const approval = this.approvals.get(approvalId);
    if (!approval || approval.status !== "pending") return Promise.resolve(null);
    const resolved: ApprovalRecord = {
      ...approval,
      status,
      approverId,
      decisionNote: note,
      resolvedAt: nowIso(),
    };
    this.approvals.set(approvalId, resolved);
    return Promise.resolve(resolved);
  }
}
