import { AppError } from "../../common/errors/AppError.js";
import { BAD_REQUEST } from "../../common/errors/errorCodes.js";
import {
  listRunsQuerySchema,
  listStepsQuerySchema,
  listToolCallsQuerySchema,
  listApprovalsQuerySchema,
  resumeApprovalSchema,
  startRunSchema,
} from "./agents.types.js";

export function validateStartRun(input: unknown) {
  return startRunSchema.parse(input);
}

export function validateResumeApproval(input: unknown) {
  return resumeApprovalSchema.parse(input);
}

export function validateListRuns(input: Record<string, unknown>) {
  return listRunsQuerySchema.parse(input);
}

export function validateListSteps(input: Record<string, unknown>) {
  return listStepsQuerySchema.parse(input);
}

export function validateListToolCalls(input: Record<string, unknown>) {
  return listToolCallsQuerySchema.parse(input);
}

export function validateListApprovals(input: Record<string, unknown>) {
  return listApprovalsQuerySchema.parse(input);
}

export function assertValidObjectId(value: string, label = "id") {
  if (!/^[0-9a-fA-F]{24}$/.test(value)) {
    throw new AppError(400, BAD_REQUEST, `Malformed ${label}`);
  }
}

export function assertRunStatusTransition(current: string, next: string) {
  const allowed: Record<string, string[]> = {
    pending: ["running", "cancelled", "failed"],
    running: ["awaiting_approval", "completed", "failed", "cancelled"],
    awaiting_approval: [
      "running",
      "completed",
      "failed",
      "cancelled",
      "expired",
    ],
    completed: [],
    failed: [],
    cancelled: [],
    expired: [],
  };
  const permitted = allowed[current] ?? [];
  if (!permitted.includes(next)) {
    throw new AppError(
      409,
      "STATE_TRANSITION_INVALID",
      `Cannot transition run from ${current} to ${next}`,
    );
  }
}
