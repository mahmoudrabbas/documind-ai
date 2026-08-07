import type { z } from "zod";
import type { AgentCapability, AgentId } from "./agentContracts.js";
import type { AgentRunContext } from "./agentRunContext.js";

/**
 * Optional execution tracing metadata. Agents that consume an LLM report the
 * provider/model/prompt/token/cost/latency facts they observed so the
 * supervisor can persist them at step level without ever receiving prompts,
 * raw provider output, or chain-of-thought.
 */
export interface AgentResultMetadata {
  readonly modelProvider?: string;
  readonly modelName?: string;
  readonly promptVersion?: string;
  readonly promptVersionId?: string | null;
  readonly tokensUsed?: number;
  readonly estimatedCost?: number;
  readonly latencyMs?: number;
}

export type AgentResult<TOutput = unknown> =
  | {
      ok: true;
      status: "completed";
      output: TOutput;
      latencyMs: number;
      metadata?: AgentResultMetadata;
    }
  | {
      ok: false;
      status: "failed" | "unauthorized" | "cancelled" | "timeout";
      error: { code: string; message: string };
      latencyMs: number;
      metadata?: AgentResultMetadata;
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
