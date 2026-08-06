import type { z } from "zod";
import type { AgentCapability, AgentId } from "./agentContracts.js";
import type { AgentRunContext } from "./agentRunContext.js";

export type AgentResult<TOutput = unknown> =
  | {
      ok: true;
      status: "completed";
      output: TOutput;
      latencyMs: number;
    }
  | {
      ok: false;
      status: "failed" | "unauthorized" | "cancelled" | "timeout";
      error: { code: string; message: string };
      latencyMs: number;
    };

export interface AgentContract<TInput = unknown, TOutput = unknown> {
  readonly id: AgentId;
  readonly version: string;
  readonly capabilities: readonly AgentCapability[];
  readonly inputSchema: z.ZodType<TInput>;
  readonly outputSchema: z.ZodType<TOutput>;
  readonly execute: (
    context: AgentRunContext,
    input: TInput,
  ) => Promise<AgentResult<TOutput>>;
}
