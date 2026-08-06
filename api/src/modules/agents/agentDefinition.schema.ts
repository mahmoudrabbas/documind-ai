import { z } from "zod";
import {
  AGENT_ID_MAX_LENGTH,
  AGENT_ID_MIN_LENGTH,
  AGENT_ID_PATTERN,
  AgentCapabilities,
  AgentStatuses,
} from "./agentContracts.js";

export const agentIdSchema = z
  .string()
  .trim()
  .min(AGENT_ID_MIN_LENGTH)
  .max(AGENT_ID_MAX_LENGTH)
  .regex(AGENT_ID_PATTERN, `Agent id must match ${AGENT_ID_PATTERN}`);

export const agentCapabilitySchema = z.enum(AgentCapabilities);
export const agentStatusSchema = z.enum(AgentStatuses);

export const agentDefinitionSchema = z.object({
  id: agentIdSchema,
  version: z.string().trim().min(1).max(32).default("1.0.0"),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().trim().max(2000).default(""),
  capabilities: z.array(agentCapabilitySchema).min(1).default(["read"]),
  allowedTools: z.array(z.string().trim().min(1).max(120)).default([]),
  timeoutMs: z.coerce.number().int().positive().max(3_600_000).default(60_000),
  maxSteps: z.coerce.number().int().positive().max(50).default(10),
  maxToolCalls: z.coerce.number().int().positive().max(200).default(20),
  maxTokens: z.coerce.number().int().positive().max(1_000_000).optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  status: agentStatusSchema.default("draft"),
  createdAt: z.string().datetime({ offset: true }).optional(),
  updatedAt: z.string().datetime({ offset: true }).optional(),
}).strict();

export type AgentDefinition = z.infer<typeof agentDefinitionSchema>;

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

export function normalizeAgentDefinition(input: unknown): AgentDefinition {
  const parsed = agentDefinitionSchema.parse(input);
  return deepFreeze(parsed);
}
