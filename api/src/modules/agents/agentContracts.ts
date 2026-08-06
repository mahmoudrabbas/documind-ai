export const AGENT_ID_MIN_LENGTH = 3;
export const AGENT_ID_MAX_LENGTH = 64;
export const AGENT_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

declare const AGENT_ID_BRAND: unique symbol;

export type AgentId = string & { readonly [AGENT_ID_BRAND]: never };

export function toAgentId(value: string): AgentId {
  return value as AgentId;
}

export const AgentCapabilities = [
  "read",
  "search",
  "summarize",
  "generate",
  "execute",
  "sensitive_execute",
] as const;
export type AgentCapability = (typeof AgentCapabilities)[number];

export const AgentStatuses = ["active", "inactive", "draft"] as const;
export type AgentStatus = (typeof AgentStatuses)[number];

export function isAgentCapability(value: unknown): value is AgentCapability {
  return (
    typeof value === "string" &&
    (AgentCapabilities as readonly string[]).includes(value)
  );
}

export function isAgentStatus(value: unknown): value is AgentStatus {
  return (
    typeof value === "string" &&
    (AgentStatuses as readonly string[]).includes(value)
  );
}
