import mongoose from "mongoose";
import AgentRunModel from "../../db/models/agentRun.model.js";
import AgentStepModel from "../../db/models/agentStep.model.js";
import AgentToolCallModel from "../../db/models/agentToolCall.model.js";
import AgentApprovalModel from "../../db/models/agentApproval.model.js";
import type { RunRecord, StepRecord, ToolCallRecord, ApprovalRecord, ListRunsQuery, ListStepsQuery, ListToolCallsQuery, ListApprovalsQuery, RunStatus } from "./agents.types.js";

function serializeRun(doc: InstanceType<typeof AgentRunModel>): RunRecord {
  return {
    id: String(doc._id),
    tenantId: String(doc.tenantId),
    actorId: String(doc.actorId),
    workflowName: doc.workflowName,
    agentName: doc.agentName,
    status: doc.status,
    input: (doc.input as Record<string, unknown>) ?? {},
    output: (doc.output as Record<string, unknown> | null) ?? null,
    modelProvider: doc.modelProvider,
    modelName: doc.modelName,
    promptVersion: doc.promptVersion ?? null,
    promptVersionId: doc.promptVersionId ? String(doc.promptVersionId) : null,
    toolVersionSnapshot: doc.toolVersionSnapshot ?? null,
    traceId: doc.traceId,
    requestId: doc.requestId,
    totalSteps: doc.totalSteps,
    totalToolCalls: doc.totalToolCalls,
    totalTokensUsed: doc.totalTokensUsed ?? null,
    estimatedCost: doc.estimatedCost ? Number(doc.estimatedCost) : null,
    latencyMs: doc.latencyMs ?? null,
    error: (doc.error as Record<string, unknown> | null) ?? null,
    guardrailResult: (doc.guardrailResult as Record<string, unknown> | null) ?? null,
    approvalsCount: doc.approvalsCount,
    handoffsCount: doc.handoffsCount,
    startedAt: doc.startedAt?.toISOString() ?? null,
    finishedAt: doc.finishedAt?.toISOString() ?? null,
    createdAt: doc.createdAt.toISOString(),
    updatedAt: doc.updatedAt.toISOString(),
  };
}

function serializeStep(doc: InstanceType<typeof AgentStepModel>): StepRecord {
  return {
    id: String(doc._id),
    runId: String(doc.runId),
    tenantId: String(doc.tenantId),
    stepIndex: doc.stepIndex,
    agentName: doc.agentName,
    action: doc.action,
    status: doc.status,
    input: (doc.input as Record<string, unknown>) ?? {},
    output: (doc.output as Record<string, unknown> | null) ?? null,
    modelProvider: doc.modelProvider ?? null,
    modelName: doc.modelName ?? null,
    promptVersion: doc.promptVersion ?? null,
    tokensUsed: doc.tokensUsed ?? null,
    estimatedCost: doc.estimatedCost ? Number(doc.estimatedCost) : null,
    latencyMs: doc.latencyMs ?? null,
    error: (doc.error as Record<string, unknown> | null) ?? null,
    toolCallsCount: doc.toolCallsCount,
    approvalsCount: doc.approvalsCount,
    handoffToAgent: doc.handoffToAgent ?? null,
    previousAgent: doc.previousAgent ?? null,
    traceId: doc.traceId,
    requestId: doc.requestId,
    createdAt: doc.createdAt.toISOString(),
  };
}

function serializeToolCall(doc: InstanceType<typeof AgentToolCallModel>): ToolCallRecord {
  return {
    id: String(doc._id),
    runId: String(doc.runId),
    stepId: doc.stepId ? String(doc.stepId) : null,
    tenantId: String(doc.tenantId),
    toolName: doc.toolName,
    toolVersion: doc.toolVersion,
    input: (doc.input as Record<string, unknown>) ?? {},
    output: (doc.output as Record<string, unknown> | null) ?? null,
    status: doc.status,
    error: (doc.error as Record<string, unknown> | null) ?? null,
    latencyMs: doc.latencyMs ?? null,
    tokensUsed: doc.tokensUsed ?? null,
    estimatedCost: doc.estimatedCost ? Number(doc.estimatedCost) : null,
    approvalRequired: doc.approvalRequired,
    approvalId: doc.approvalId ? String(doc.approvalId) : null,
    traceId: doc.traceId,
    requestId: doc.requestId,
    createdAt: doc.createdAt.toISOString(),
  };
}

function serializeApproval(doc: InstanceType<typeof AgentApprovalModel>): ApprovalRecord {
  return {
    id: String(doc._id),
    runId: String(doc.runId),
    stepId: doc.stepId ? String(doc.stepId) : null,
    toolCallId: doc.toolCallId ? String(doc.toolCallId) : null,
    status: doc.status,
    requestedBy: doc.requestedBy,
    approverRole: doc.approverRole ?? null,
    approverId: doc.approverId ? String(doc.approverId) : null,
    contextHash: doc.contextHash,
    context: (doc.context as Record<string, unknown>) ?? {},
    decisionNote: doc.decisionNote ?? null,
    resolvedAt: doc.resolvedAt?.toISOString() ?? null,
    expiresAt: doc.expiresAt.toISOString(),
    createdAt: doc.createdAt.toISOString(),
  };
}

export async function createRun(input: {
  tenantId: string;
  actorId: string;
  workflowName: string;
  agentName: string;
  input: Record<string, unknown>;
  modelProvider: string;
  modelName: string;
  promptVersion: string | null;
  promptVersionId: string | null;
  toolVersionSnapshot: string | null;
  traceId: string;
  requestId: string;
}): Promise<RunRecord> {
  const run = await AgentRunModel.create({
    tenantId: new mongoose.Types.ObjectId(input.tenantId),
    actorId: new mongoose.Types.ObjectId(input.actorId),
    workflowName: input.workflowName,
    agentName: input.agentName,
    status: "pending",
    input: input.input,
    modelProvider: input.modelProvider,
    modelName: input.modelName,
    promptVersion: input.promptVersion,
    promptVersionId: input.promptVersionId ? new mongoose.Types.ObjectId(input.promptVersionId) : null,
    toolVersionSnapshot: input.toolVersionSnapshot,
    traceId: input.traceId,
    requestId: input.requestId,
  });
  return serializeRun(run);
}

export async function startRun(tenantId: string, runId: string): Promise<RunRecord | null> {
  const run = await AgentRunModel.findOneAndUpdate(
    { _id: runId, tenantId: new mongoose.Types.ObjectId(tenantId), status: "pending" },
    { $set: { status: "running", startedAt: new Date() } },
    { new: true }
  ).exec();
  return run ? serializeRun(run) : null;
}

export async function completeRun(tenantId: string, runId: string, patch: Partial<{ status: RunStatus; output: Record<string, unknown> | null; totalSteps: number; totalToolCalls: number; totalTokensUsed: number; estimatedCost: number; latencyMs: number; error: Record<string, unknown> | null; guardrailResult: Record<string, unknown> | null; approvalsCount: number; handoffsCount: number }>): Promise<RunRecord | null> {
  const set: Record<string, unknown> = { ...patch, finishedAt: new Date() };
  if (set.estimatedCost !== undefined && typeof set.estimatedCost === "number") {
    set.estimatedCost = new mongoose.Types.Decimal128(String(set.estimatedCost));
  }
  const run = await AgentRunModel.findOneAndUpdate({ _id: runId, tenantId: new mongoose.Types.ObjectId(tenantId) }, { $set: set }, { new: true }).exec();
  return run ? serializeRun(run) : null;
}

export async function getRun(tenantId: string, runId: string): Promise<RunRecord | null> {
  const run = await AgentRunModel.findOne({ _id: runId, tenantId: new mongoose.Types.ObjectId(tenantId) }).lean().exec();
  if (!run) return null;
  return serializeRun(run as InstanceType<typeof AgentRunModel>);
}

export async function listRuns(tenantId: string, filter: ListRunsQuery): Promise<{ runs: RunRecord[]; totalRecords: number }> {
  const query: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId) };
  if (filter.status) query.status = filter.status;
  if (filter.agentName) query.agentName = filter.agentName;
  if (filter.traceId) query.traceId = filter.traceId;

  const [runs, totalRecords] = await Promise.all([
    AgentRunModel.find(query).sort({ createdAt: -1 }).skip((filter.page - 1) * filter.pageSize).limit(filter.pageSize).lean().exec(),
    AgentRunModel.countDocuments(query),
  ]);
  return { runs: runs.map((r) => serializeRun(r as InstanceType<typeof AgentRunModel>)), totalRecords };
}

export async function createStep(input: {
  runId: string;
  tenantId: string;
  stepIndex: number;
  agentName: string;
  action: string;
  input: Record<string, unknown>;
  modelProvider?: string | null;
  modelName?: string | null;
  promptVersion?: string | null;
  traceId: string;
  requestId: string;
}): Promise<StepRecord> {
  const step = await AgentStepModel.create({
    runId: new mongoose.Types.ObjectId(input.runId),
    tenantId: new mongoose.Types.ObjectId(input.tenantId),
    stepIndex: input.stepIndex,
    agentName: input.agentName,
    action: input.action as "plan" | "tool_call" | "handoff" | "guardrail" | "approval_requested" | "approval_resolved" | "completed" | "failed" | "cancelled",
    status: "running",
    input: input.input,
    modelProvider: input.modelProvider ?? null,
    modelName: input.modelName ?? null,
    promptVersion: input.promptVersion ?? null,
    traceId: input.traceId,
    requestId: input.requestId,
  });
  return serializeStep(step);
}

export async function completeStep(tenantId: string, stepId: string, patch: Partial<{ status: string; output: Record<string, unknown> | null; tokensUsed: number; estimatedCost: number; latencyMs: number; error: Record<string, unknown> | null; toolCallsCount: number; approvalsCount: number; handoffToAgent: string | null; previousAgent: string | null }>): Promise<StepRecord | null> {
  const set: Record<string, unknown> = { ...patch };
  if (set.estimatedCost !== undefined && typeof set.estimatedCost === "number") {
    set.estimatedCost = new mongoose.Types.Decimal128(String(set.estimatedCost));
  }
  const step = await AgentStepModel.findOneAndUpdate({ _id: stepId, tenantId: new mongoose.Types.ObjectId(tenantId) }, { $set: set }, { new: true }).exec();
  return step ? serializeStep(step) : null;
}

export async function getSteps(tenantId: string, runId: string, filter: ListStepsQuery): Promise<{ steps: StepRecord[]; totalRecords: number }> {
  const query = { tenantId: new mongoose.Types.ObjectId(tenantId), runId: new mongoose.Types.ObjectId(runId) };
  const [steps, totalRecords] = await Promise.all([
    AgentStepModel.find(query).sort({ stepIndex: 1 }).skip((filter.page - 1) * filter.pageSize).limit(filter.pageSize).lean().exec(),
    AgentStepModel.countDocuments(query),
  ]);
  return { steps: steps.map((s) => serializeStep(s as InstanceType<typeof AgentStepModel>)), totalRecords };
}

export async function createToolCall(input: {
  runId: string;
  stepId?: string | null;
  tenantId: string;
  toolName: string;
  toolVersion: string;
  input: Record<string, unknown>;
  traceId: string;
  requestId: string;
}): Promise<ToolCallRecord> {
  const tc = await AgentToolCallModel.create({
    runId: new mongoose.Types.ObjectId(input.runId),
    stepId: input.stepId ? new mongoose.Types.ObjectId(input.stepId) : null,
    tenantId: new mongoose.Types.ObjectId(input.tenantId),
    toolName: input.toolName,
    toolVersion: input.toolVersion,
    input: input.input,
    status: "running",
    traceId: input.traceId,
    requestId: input.requestId,
  });
  return serializeToolCall(tc);
}

export async function completeToolCall(tenantId: string, toolCallId: string, patch: Partial<{ status: string; output: Record<string, unknown> | null; error: Record<string, unknown> | null; latencyMs: number; tokensUsed: number; estimatedCost: number; approvalId: string | null }>): Promise<ToolCallRecord | null> {
  const set: Record<string, unknown> = { ...patch };
  if (set.estimatedCost !== undefined && typeof set.estimatedCost === "number") {
    set.estimatedCost = new mongoose.Types.Decimal128(String(set.estimatedCost));
  }
  if (set.approvalId && typeof set.approvalId === "string") {
    set.approvalId = new mongoose.Types.ObjectId(set.approvalId);
  }
  const tc = await AgentToolCallModel.findOneAndUpdate({ _id: toolCallId, tenantId: new mongoose.Types.ObjectId(tenantId) }, { $set: set }, { new: true }).exec();
  return tc ? serializeToolCall(tc) : null;
}

export async function getToolCalls(tenantId: string, runId: string, filter: ListToolCallsQuery): Promise<{ toolCalls: ToolCallRecord[]; totalRecords: number }> {
  const query: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId), runId: new mongoose.Types.ObjectId(runId) };
  if (filter.status) query.status = filter.status;
  if (filter.toolName) query.toolName = filter.toolName;
  const [tcs, totalRecords] = await Promise.all([
    AgentToolCallModel.find(query).sort({ createdAt: 1 }).skip((filter.page - 1) * filter.pageSize).limit(filter.pageSize).lean().exec(),
    AgentToolCallModel.countDocuments(query),
  ]);
  return { toolCalls: tcs.map((t) => serializeToolCall(t as InstanceType<typeof AgentToolCallModel>)), totalRecords };
}

export async function createApproval(input: {
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
}): Promise<ApprovalRecord> {
  const contextStr = JSON.stringify(input.context);
  const contextHash = Buffer.from(contextStr, "utf8").toString("base64").slice(0, 128);
  const approval = await AgentApprovalModel.create({
    tenantId: new mongoose.Types.ObjectId(input.tenantId),
    actorId: new mongoose.Types.ObjectId(input.actorId),
    runId: new mongoose.Types.ObjectId(input.runId),
    stepId: input.stepId ? new mongoose.Types.ObjectId(input.stepId) : null,
    toolCallId: input.toolCallId ? new mongoose.Types.ObjectId(input.toolCallId) : null,
    status: "pending",
    requestedBy: input.requestedBy,
    approverRole: input.approverRole,
    contextHash,
    context: input.context,
    expiresAt: new Date(Date.now() + input.ttlMs),
  });
  return serializeApproval(approval);
}

export async function resolveApproval(tenantId: string, approvalId: string, status: "approved" | "rejected", approverId: string | null, note: string | null): Promise<ApprovalRecord | null> {
  const approval = await AgentApprovalModel.findOneAndUpdate(
    { _id: approvalId, tenantId: new mongoose.Types.ObjectId(tenantId), status: "pending" },
    { $set: { status, approverId: approverId ? new mongoose.Types.ObjectId(approverId) : null, decisionNote: note, resolvedAt: new Date() } },
    { new: true }
  ).exec();
  return approval ? serializeApproval(approval) : null;
}

export async function getApproval(tenantId: string, approvalId: string): Promise<ApprovalRecord | null> {
  const approval = await AgentApprovalModel.findOne({ _id: approvalId, tenantId: new mongoose.Types.ObjectId(tenantId) }).lean().exec();
  if (!approval) return null;
  return serializeApproval(approval as InstanceType<typeof AgentApprovalModel>);
}

export async function listApprovals(tenantId: string, filter: ListApprovalsQuery): Promise<{ approvals: ApprovalRecord[]; totalRecords: number }> {
  const query: Record<string, unknown> = { tenantId: new mongoose.Types.ObjectId(tenantId) };
  if (filter.status) query.status = filter.status;
  const [approvals, totalRecords] = await Promise.all([
    AgentApprovalModel.find(query).sort({ createdAt: -1 }).skip((filter.page - 1) * filter.pageSize).limit(filter.pageSize).lean().exec(),
    AgentApprovalModel.countDocuments(query),
  ]);
  return { approvals: approvals.map((a) => serializeApproval(a as InstanceType<typeof AgentApprovalModel>)), totalRecords };
}

export async function expirePendingApprovals(tenantId?: string): Promise<number> {
  const query: Record<string, unknown> = { status: "pending", expiresAt: { $lt: new Date() } };
  if (tenantId) query.tenantId = new mongoose.Types.ObjectId(tenantId);
  const result = await AgentApprovalModel.updateMany(query, { $set: { status: "expired" } }).exec();
  return result.modifiedCount;
}
