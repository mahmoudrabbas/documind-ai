import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { AGENT_CONTRACT_INVALID } from "../../common/errors/errorCodes.js";
import { AgentRegistry } from "./agentRegistry.js";
import type { AgentCapability } from "./agentContracts.js";
import type { AgentDefinition } from "./agentDefinition.schema.js";

export const CHAT_AGENT_IDS = [
  "chat-supervisor",
  "intent-query-agent",
  "answer-writer-agent",
  "citation-verification-agent",
  "compliance-agent",
] as const;

export type ChatAgentId = (typeof CHAT_AGENT_IDS)[number];

export const chatAgentIdSchema = z.enum(CHAT_AGENT_IDS);
export type ChatAgentIdInput = z.infer<typeof chatAgentIdSchema>;

export function isChatAgentId(value: unknown): value is ChatAgentId {
  return (
    typeof value === "string" &&
    (CHAT_AGENT_IDS as readonly string[]).includes(value)
  );
}

export function assertChatAgentId(value: unknown): asserts value is ChatAgentId {
  if (!isChatAgentId(value)) {
    throw new AppError(
      400,
      AGENT_CONTRACT_INVALID,
      `Unknown chat agent id ${JSON.stringify(value)}`,
    );
  }
}

const CHAT_AGENT_DEFINITIONS: ReadonlyArray<{
  id: ChatAgentId;
  capabilities: readonly AgentCapability[];
  description: string;
}> = [
  {
    id: "chat-supervisor",
    capabilities: ["read", "execute"],
    description:
      "Routes chat-rag-v1 messages across the approved chat agents and owns the run lifecycle.",
  },
  {
    id: "intent-query-agent",
    capabilities: ["read"],
    description:
      "Analyzes the user question and produces a query plan (language, route, intent, referenced documents).",
  },
  {
    id: "answer-writer-agent",
    capabilities: ["read", "generate"],
    description:
      "Writes a grounded answer with cited chunk ids from approved evidence.",
  },
  {
    id: "citation-verification-agent",
    capabilities: ["read", "search"],
    description:
      "Verifies cited chunk ids against approved evidence before release.",
  },
  {
    id: "compliance-agent",
    capabilities: ["read", "sensitive_execute"],
    description:
      "Applies the final compliance review to the answer (release | refuse | clarify).",
  },
];

/**
 * Chat-specific approved-agent registry. Rejects any agent id outside the
 * closed CHAT_AGENT_IDS set, while reusing the generic in-memory AgentRegistry
 * underneath. No global singleton is created; instances are always explicit.
 */
export class ChatAgentRegistry extends AgentRegistry {
  override register(input: unknown): AgentDefinition {
    const candidate = (input as { id?: unknown } | null)?.id;
    assertChatAgentId(candidate);
    return super.register(input);
  }
}

export function createChatAgentRegistry(): ChatAgentRegistry {
  const registry = new ChatAgentRegistry();
  for (const definition of CHAT_AGENT_DEFINITIONS) {
    registry.register({
      id: definition.id,
      name: definition.id,
      description: definition.description,
      capabilities: definition.capabilities,
      status: "active",
    });
  }
  return registry;
}
