import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import {
  AGENT_ALREADY_REGISTERED,
  AGENT_CAPABILITY_NOT_FOUND,
  AGENT_CONTRACT_INVALID,
  AGENT_DISABLED,
  AGENT_NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import { isAgentCapability, type AgentCapability } from "./agentContracts.js";
import {
  normalizeAgentDefinition,
  type AgentDefinition,
} from "./agentDefinition.schema.js";

export class AgentRegistry {
  private readonly definitions = new Map<string, AgentDefinition>();

  register(input: unknown): AgentDefinition {
    let definition: AgentDefinition;
    try {
      definition = normalizeAgentDefinition(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AppError(
          400,
          AGENT_CONTRACT_INVALID,
          "Invalid agent definition",
          error.issues,
        );
      }
      throw error;
    }

    if (this.definitions.has(definition.id)) {
      throw new AppError(
        409,
        AGENT_ALREADY_REGISTERED,
        `Agent ${definition.id} is already registered`,
      );
    }

    const now = new Date().toISOString();
    const snapshot = normalizeAgentDefinition({
      ...definition,
      createdAt: definition.createdAt ?? now,
      updatedAt: now,
    });
    this.definitions.set(snapshot.id, snapshot);
    return snapshot;
  }

  has(id: string): boolean {
    return this.definitions.has(id);
  }

  get(id: string): AgentDefinition | undefined {
    return this.definitions.get(id);
  }

  require(id: string): AgentDefinition {
    const definition = this.definitions.get(id);
    if (!definition) {
      throw new AppError(404, AGENT_NOT_FOUND, `Agent ${id} is not registered`);
    }
    return definition;
  }

  list(): AgentDefinition[] {
    return Array.from(this.definitions.values());
  }

  findByCapability(capability: AgentCapability): AgentDefinition[] {
    if (!isAgentCapability(capability)) {
      throw new AppError(
        400,
        AGENT_CAPABILITY_NOT_FOUND,
        `Unknown agent capability ${String(capability)}`,
      );
    }
    return this.list().filter((definition) =>
      definition.capabilities.includes(capability),
    );
  }

  enable(id: string): AgentDefinition {
    return this.mutate(id, { status: "active" });
  }

  disable(id: string): AgentDefinition {
    return this.mutate(id, { status: "inactive" });
  }

  getRunnable(id: string): AgentDefinition {
    const definition = this.require(id);
    if (definition.status !== "active") {
      throw new AppError(
        409,
        AGENT_DISABLED,
        `Agent ${id} is not runnable (status: ${definition.status})`,
      );
    }
    return definition;
  }

  private mutate(id: string, patch: Partial<AgentDefinition>): AgentDefinition {
    const current = this.require(id);
    const snapshot = normalizeAgentDefinition({
      ...current,
      ...patch,
      updatedAt: new Date().toISOString(),
    });
    this.definitions.set(snapshot.id, snapshot);
    return snapshot;
  }
}

export function createAgentRegistry(): AgentRegistry {
  return new AgentRegistry();
}
