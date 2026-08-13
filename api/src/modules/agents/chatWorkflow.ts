import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import {
  AGENT_CONTRACT_INVALID,
  AGENT_WORKFLOW_ALREADY_REGISTERED,
  AGENT_WORKFLOW_NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import { chatAgentIdSchema, CHAT_AGENT_IDS, isChatAgentId, type ChatAgentId } from "./chatAgents.js";

export const CHAT_WORKFLOW_IDS = ["chat-rag-v1", "guider-v1"] as const;

export type ChatWorkflowId = (typeof CHAT_WORKFLOW_IDS)[number];

export const chatWorkflowIdSchema = z.enum(CHAT_WORKFLOW_IDS);

export interface ChatWorkflowDefinition {
  readonly id: ChatWorkflowId;
  readonly version: string;
  readonly description: string;
  readonly entryAgent: ChatAgentId;
  readonly agents: readonly ChatAgentId[];
  readonly allowedHandoffs: Readonly<
    Partial<Record<ChatAgentId, readonly ChatAgentId[]>>
  >;
  readonly metadata?: Readonly<Record<string, unknown>>;
}

export const chatWorkflowDefinitionSchema = z
  .object({
    id: chatWorkflowIdSchema,
    version: z.string().trim().min(1).max(32).default("1.0.0"),
    description: z.string().trim().max(500).default(""),
    entryAgent: chatAgentIdSchema,
    agents: z.array(chatAgentIdSchema).min(1),
    allowedHandoffs: z
      .record(z.string(), z.array(chatAgentIdSchema))
      .optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((definition, context) => {
    for (const from of Object.keys(definition.allowedHandoffs ?? {})) {
      if (!isChatAgentId(from)) {
        context.addIssue({
          code: "custom",
          path: ["allowedHandoffs", from],
          message: `Unknown chat agent id "${from}"`,
        });
      }
    }
  });

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

function dedupe(values: string[]): string[] {
  return Array.from(new Set(values));
}

function normalizeChatWorkflowDefinition(
  input: unknown,
): ChatWorkflowDefinition {
  const parsed = chatWorkflowDefinitionSchema.parse(input);
  const agents = dedupe([...parsed.agents]);
  const allowedHandoffs: Partial<Record<ChatAgentId, readonly ChatAgentId[]>> =
    {};
  for (const [from, targets] of Object.entries(parsed.allowedHandoffs ?? {})) {
    allowedHandoffs[from as ChatAgentId] = dedupe(targets) as ChatAgentId[];
  }
  return deepFreeze({
    ...parsed,
    agents,
    allowedHandoffs,
  }) as unknown as ChatWorkflowDefinition;
}

export class WorkflowRegistry {
  private readonly workflows = new Map<ChatWorkflowId, ChatWorkflowDefinition>();

  register(input: unknown): ChatWorkflowDefinition {
    let definition: ChatWorkflowDefinition;
    try {
      definition = normalizeChatWorkflowDefinition(input);
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new AppError(
          400,
          AGENT_CONTRACT_INVALID,
          "Invalid chat workflow definition",
          error.issues,
        );
      }
      throw error;
    }

    if (this.workflows.has(definition.id)) {
      throw new AppError(
        409,
        AGENT_WORKFLOW_ALREADY_REGISTERED,
        `Workflow ${definition.id} is already registered`,
      );
    }

    const agents = new Set(definition.agents);
    if (!agents.has(definition.entryAgent)) {
      throw new AppError(
        400,
        AGENT_CONTRACT_INVALID,
        `Entry agent ${definition.entryAgent} does not belong to workflow ${definition.id}`,
      );
    }
    for (const [from, targets] of Object.entries(definition.allowedHandoffs)) {
      if (!agents.has(from as ChatAgentId)) {
        throw new AppError(
          400,
          AGENT_CONTRACT_INVALID,
          `Handoff source ${from} does not belong to workflow ${definition.id}`,
        );
      }
      for (const target of targets ?? []) {
        if (!agents.has(target)) {
          throw new AppError(
            400,
            AGENT_CONTRACT_INVALID,
            `Handoff target ${target} does not belong to workflow ${definition.id}`,
          );
        }
      }
    }

    this.workflows.set(definition.id, definition);
    return definition;
  }

  has(id: string): boolean {
    return this.workflows.has(id as ChatWorkflowId);
  }

  get(id: string): ChatWorkflowDefinition | undefined {
    return this.workflows.get(id as ChatWorkflowId);
  }

  require(id: "chat-rag-v1"): ChatWorkflowDefinition & {
    readonly id: "chat-rag-v1";
  };
  require(id: "guider-v1"): ChatWorkflowDefinition & {
    readonly id: "guider-v1";
  };
  require(id: string): ChatWorkflowDefinition;
  require(id: string): ChatWorkflowDefinition {
    const definition = this.workflows.get(id as ChatWorkflowId);
    if (!definition) {
      throw new AppError(
        404,
        AGENT_WORKFLOW_NOT_FOUND,
        `Workflow ${id} is not registered`,
      );
    }
    return definition;
  }

  list(): ChatWorkflowDefinition[] {
    return Array.from(this.workflows.values());
  }
}

/**
 * The approved chat-rag-v1 definition. The supervisor is the single entry
 * point; all approved chat agents belong to the workflow, and handoffs form a
 * deterministic DAG ending back at the supervisor.
 */
export function chatRagV1Definition(): ChatWorkflowDefinition {
  return normalizeChatWorkflowDefinition({
    id: "chat-rag-v1",
    version: "1.1.0",
    description:
      "Approved controlled chat workflow: deterministic source-less intents or retrieval evidence → grounded answer → citation verification → compliance release.",
    entryAgent: "chat-supervisor",
    agents: [...CHAT_AGENT_IDS],
    allowedHandoffs: {
      "chat-supervisor": [
        "intent-query-agent",
        "answer-writer-agent",
        "citation-verification-agent",
        "compliance-agent",
      ],
      "intent-query-agent": ["chat-supervisor"],
      "answer-writer-agent": ["citation-verification-agent", "chat-supervisor"],
      "citation-verification-agent": ["answer-writer-agent", "chat-supervisor", "compliance-agent"],
      "compliance-agent": ["chat-supervisor"],
    },
    metadata: { schemaVersion: "1.1.0" },
  });
}

export function createChatWorkflowRegistry(): WorkflowRegistry {
  const registry = new WorkflowRegistry();
  registry.register(chatRagV1Definition());
  return registry;
}

export function createCopilotWorkflowRegistry(): WorkflowRegistry {
  const registry = new WorkflowRegistry();
  registry.register(copilotWorkflowDefinition());
  return registry;
}

function copilotWorkflowDefinition(): ChatWorkflowDefinition {
  return normalizeChatWorkflowDefinition({
    id: "guider-v1",
    version: "1.0.0",
    description: "Copilot workflow: classify → guide or action agent",
    entryAgent: "copilot-supervisor",
    agents: [...CHAT_AGENT_IDS],
    allowedHandoffs: {
      "copilot-supervisor": ["platform-guide-agent", "platform-action-agent"],
      "platform-guide-agent": ["copilot-supervisor"],
      "platform-action-agent": ["copilot-supervisor"],
    },
    metadata: { schemaVersion: "1.0.0" },
  });
}
