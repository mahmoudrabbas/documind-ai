import { z } from "zod";

export type BaseRole = "SUPER_ADMIN" | "COMPANY_ADMIN" | "EMPLOYEE";

export type RunStatus = "pending" | "running" | "awaiting_approval" | "completed" | "failed" | "cancelled" | "expired";
export type StepStatus = "running" | "completed" | "failed" | "skipped";
export type ToolCallStatus = "running" | "completed" | "failed" | "unauthorized" | "timeout" | "cancelled";
export type ApprovalStatus = "pending" | "approved" | "rejected" | "expired";
export type PromptStatus = "active" | "deprecated" | "draft";
export type AdapterType = "fake" | "openai" | "anthropic" | "azure" | "custom";
export type ModelConfigStatus = "active" | "inactive";

export interface RunContext {
  tenantId: string;
  actorId: string;
  traceId: string;
  requestId: string;
  workflowName: string;
  agentName: string;
  runId?: string;
  stepIndex?: number;
  maxSteps?: number;
  maxToolCalls?: number;
  maxTokens?: number;
  budgetMs?: number;
}

export interface HandoffProtocol {
  fromAgent: string;
  toAgent: string;
  reason: string;
  input: Record<string, unknown>;
}

export interface ToolSchema {
  name: string;
  version: string;
  description: string;
  inputSchema: z.ZodSchema;
  outputSchema: z.ZodSchema;
  requiredPermission?: string;
  approvalRequired?: boolean;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface RegisteredTool {
  schema: ToolSchema;
  handler: (context: RunContext, input: unknown) => Promise<unknown>;
}

export interface ToolCallResult {
  ok: boolean;
  status: ToolCallStatus;
  output: unknown;
  error: Record<string, unknown> | null;
  latencyMs: number;
  tokensUsed: number | null;
  estimatedCost: number | null;
  approvalRequired: boolean;
  approvalId: string | null;
}

export interface ApprovalRecord {
  id: string;
  runId: string;
  stepId: string | null;
  toolCallId: string | null;
  status: ApprovalStatus;
  requestedBy: string;
  approverRole: string | null;
  approverId: string | null;
  contextHash: string;
  context: Record<string, unknown>;
  decisionNote: string | null;
  resolvedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

export interface StepRecord {
  id: string;
  runId: string;
  tenantId: string;
  stepIndex: number;
  agentName: string;
  action: string;
  status: StepStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  modelProvider: string | null;
  modelName: string | null;
  promptVersion: string | null;
  tokensUsed: number | null;
  estimatedCost: number | null;
  latencyMs: number | null;
  error: Record<string, unknown> | null;
  toolCallsCount: number;
  approvalsCount: number;
  handoffToAgent: string | null;
  previousAgent: string | null;
  traceId: string;
  requestId: string;
  createdAt: string;
}

export interface ToolCallRecord {
  id: string;
  runId: string;
  stepId: string | null;
  tenantId: string;
  toolName: string;
  toolVersion: string;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  status: ToolCallStatus;
  error: Record<string, unknown> | null;
  latencyMs: number | null;
  tokensUsed: number | null;
  estimatedCost: number | null;
  approvalRequired: boolean;
  approvalId: string | null;
  traceId: string;
  requestId: string;
  createdAt: string;
}

export interface RunRecord {
  id: string;
  tenantId: string;
  actorId: string;
  workflowName: string;
  agentName: string;
  status: RunStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  modelProvider: string;
  modelName: string;
  promptVersion: string | null;
  promptVersionId: string | null;
  toolVersionSnapshot: string | null;
  traceId: string;
  requestId: string;
  totalSteps: number;
  totalToolCalls: number;
  totalTokensUsed: number | null;
  estimatedCost: number | null;
  latencyMs: number | null;
  error: Record<string, unknown> | null;
  guardrailResult: Record<string, unknown> | null;
  approvalsCount: number;
  handoffsCount: number;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ModelCompletionMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ModelCompletionChoice {
  index: number;
  message: ModelCompletionMessage;
  finishReason: string | null;
}

export interface ModelCompletionUsage {
  promptTokens: number;
  completionTokens: number;
  totalTokens: number;
}

export interface ModelCompletionResponse {
  id: string;
  provider: string;
  model: string;
  choices: ModelCompletionChoice[];
  usage: ModelCompletionUsage;
  latencyMs: number;
  estimatedCost: number;
}

export interface ModelAdapter {
  readonly providerKey: string;
  complete(params: {
    messages: ModelCompletionMessage[];
    tools?: Record<string, unknown>[];
    toolChoice?: string | Record<string, unknown>;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<ModelCompletionResponse>;
}

export interface EmbeddingAdapter {
  readonly providerKey: string;
  embed(params: { inputs: string[]; signal?: AbortSignal }): Promise<{ vectors: number[][]; usage: { totalTokens: number } }>;
}

export interface GuardrailResult {
  passed: boolean;
  action: "allow" | "block" | "approval_required";
  reason: string | null;
  metadata: Record<string, unknown>;
}

export type GuardrailHookName = "input" | "tool_invocation" | "output" | "sensitive_action";

export interface GuardrailHook {
  readonly name: GuardrailHookName;
  readonly priority: number;
  evaluate(context: RunContext, payload: Record<string, unknown>): Promise<GuardrailResult>;
}

export interface SupervisorPlan {
  agentName: string;
  action: "plan" | "tool_call" | "handoff" | "complete" | "fail";
  toolName?: string;
  toolInput?: Record<string, unknown>;
  handoffTo?: string;
  reason: string;
}

export interface SupervisorDecision {
  plan: SupervisorPlan;
  fallbackPlan: SupervisorPlan | null;
  budget: {
    maxSteps: number;
    maxToolCalls: number;
    maxTokens: number;
    budgetMs: number;
  };
}

export const AgentRunStatusEnum = z.enum(["pending", "running", "awaiting_approval", "completed", "failed", "cancelled", "expired"]);
export const AgentStepStatusEnum = z.enum(["running", "completed", "failed", "skipped"]);
export const AgentToolCallStatusEnum = z.enum(["running", "completed", "failed", "unauthorized", "timeout", "cancelled"]);
export const AgentApprovalStatusEnum = z.enum(["pending", "approved", "rejected", "expired"]);
export const AgentPromptStatusEnum = z.enum(["active", "deprecated", "draft"]);
export const AgentAdapterTypeEnum = z.enum(["fake", "openai", "anthropic", "azure", "custom"]);

export const startRunSchema = z.object({
  workflowName: z.string().trim().min(1).max(120),
  agentName: z.string().trim().min(1).max(120),
  input: z.record(z.string(), z.unknown()).default({}),
  modelProvider: z.string().trim().min(1).max(80).default("fake"),
  modelName: z.string().trim().min(1).max(120).default("fake-default"),
  promptVersion: z.string().trim().min(1).max(40).optional(),
  promptVersionId: z.string().trim().min(24).max(24).optional(),
  toolVersionSnapshot: z.string().trim().min(1).max(40).optional(),
  maxSteps: z.number().int().positive().max(50).optional(),
  maxToolCalls: z.number().int().positive().max(200).optional(),
  maxTokens: z.number().int().positive().max(1_000_000).optional(),
  budgetMs: z.number().int().positive().max(3_600_000).optional(),
});

export const resumeApprovalSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  decisionNote: z.string().trim().max(500).optional(),
});

export const listRunsQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(1000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: AgentRunStatusEnum.optional(),
  agentName: z.string().trim().max(120).optional(),
  traceId: z.string().trim().max(128).optional(),
});

export const listStepsQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(1000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
});

export const listToolCallsQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(1000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  status: AgentToolCallStatusEnum.optional(),
  toolName: z.string().trim().max(120).optional(),
});

export const listApprovalsQuerySchema = z.object({
  page: z.coerce.number().int().positive().max(1000).default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(50),
  status: AgentApprovalStatusEnum.optional(),
});

export type StartRunInput = z.infer<typeof startRunSchema>;
export type ResumeApprovalInput = z.infer<typeof resumeApprovalSchema>;
export type ListRunsQuery = z.infer<typeof listRunsQuerySchema>;
export type ListStepsQuery = z.infer<typeof listStepsQuerySchema>;
export type ListToolCallsQuery = z.infer<typeof listToolCallsQuerySchema>;
export type ListApprovalsQuery = z.infer<typeof listApprovalsQuerySchema>;
