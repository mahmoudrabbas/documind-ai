import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import {
  AGENT_ALREADY_REGISTERED,
  AGENT_CONTRACT_INVALID,
  AGENT_DISABLED,
  AGENT_EXECUTOR_NOT_FOUND,
  AGENT_NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import type { AgentContract } from "./agentContract.js";
import {
  assertChatAgentId,
  createChatAgentRegistry,
  type ChatAgentId,
  type ChatAgentRegistry,
} from "./chatAgents.js";
import type { AgentDefinition } from "./agentDefinition.schema.js";

/**
 * Constructor-injected runtime registry that maps approved ChatAgentId values
 * to AgentContract implementations.
 *
 * Safety properties:
 * - only approved chat agent ids may be registered;
 * - every executable agent must already have an approved, active definition in
 *   the chat agent definitions registry;
 * - input/output schemas must be real Zod schemas (contract boundary check);
 * - unknown, missing, or disabled agents are rejected;
 * - no fake agents are auto-registered — the registry starts empty;
 * - no global mutable singleton exists — instances are always explicit;
 * - tests may explicitly inject deterministic test agents;
 * - never imports ChatService or any service implementation.
 */
export class AgentExecutorRegistry {
  private readonly executors = new Map<ChatAgentId, AgentContract>();
  private readonly definitions: ChatAgentRegistry;

  constructor(
    definitions: ChatAgentRegistry = createChatAgentRegistry(),
  ) {
    this.definitions = definitions;
  }

  register(contract: AgentContract): AgentDefinition {
    assertChatAgentId(contract.id);

    if (this.executors.has(contract.id)) {
      throw new AppError(
        409,
        AGENT_ALREADY_REGISTERED,
        `Executor for agent ${contract.id} is already registered`,
      );
    }

    const definition = this.definitions.require(contract.id);
    if (definition.status !== "active") {
      throw new AppError(
        409,
        AGENT_DISABLED,
        `Agent ${contract.id} is not runnable (status: ${definition.status})`,
      );
    }

    if (!(contract.inputSchema instanceof z.ZodType)) {
      throw new AppError(
        400,
        AGENT_CONTRACT_INVALID,
        `Executor ${contract.id} must expose a Zod inputSchema`,
      );
    }
    if (!(contract.outputSchema instanceof z.ZodType)) {
      throw new AppError(
        400,
        AGENT_CONTRACT_INVALID,
        `Executor ${contract.id} must expose a Zod outputSchema`,
      );
    }

    this.executors.set(contract.id, contract);
    return definition;
  }

  hasExecutor(id: string): boolean {
    return this.executors.has(id as ChatAgentId);
  }

  getExecutor(id: string): AgentContract {
    const contract = this.executors.get(id as ChatAgentId);
    if (!contract) {
      throw new AppError(
        404,
        AGENT_EXECUTOR_NOT_FOUND,
        `No executable agent registered for ${id}`,
      );
    }
    return contract;
  }

  requireExecutor(id: string): AgentContract {
    const contract = this.getExecutor(id);
    if (contract.id !== (id as ChatAgentId)) {
      throw new AppError(
        404,
        AGENT_EXECUTOR_NOT_FOUND,
        `No executable agent registered for ${id}`,
      );
    }
    return contract;
  }

  listExecutors(): AgentContract[] {
    return Array.from(this.executors.values());
  }

  getDefinition(id: string): AgentDefinition | undefined {
    if (!assertChatAgentIdSafe(id)) return undefined;
    return this.definitions.get(id);
  }

  requireDefinition(id: string): AgentDefinition {
    assertChatAgentId(id);
    if (!this.definitions.has(id)) {
      throw new AppError(404, AGENT_NOT_FOUND, `Agent ${id} is not registered`);
    }
    return this.definitions.getRunnable(id);
  }

  definitionsRegistry(): ChatAgentRegistry {
    return this.definitions;
  }
}

function assertChatAgentIdSafe(value: unknown): value is string {
  try {
    assertChatAgentId(value);
    return true;
  } catch {
    return false;
  }
}
