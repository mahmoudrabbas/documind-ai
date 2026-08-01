import { z } from "zod";
import type { ConfirmationLevel, ToolContext, ToolResult } from "../copilot.types.js";

export type ToolCategory = "navigation" | "document" | "user" | "processing" | "search" | "admin";

export interface CopilotTool {
  name: string;
  description: string;
  category: ToolCategory;
  requiredPermission: string | null;
  confirmationLevel: ConfirmationLevel;
  estimatedDurationMs?: number;
  /** Whether an executed action can be undone via `rollback`. */
  rollbackCapable?: boolean;
  /** Reverts the side effects of a previously executed action. Result data from the original execution is passed as the third argument. */
  rollback?: (params: unknown, context: ToolContext, resultData?: unknown) => Promise<ToolResult>;
  /** Retries attempted for transient failures; defaults to config. */
  retries?: number;
  /** Audit grouping for the action, e.g. "document", "user", "processing". */
  auditCategory?: string;
  inputSchema: z.ZodSchema;
  handler: (params: unknown, context: ToolContext) => Promise<ToolResult>;
}
