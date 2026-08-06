import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import {
  AGENT_HANDOFF_INVALID,
  AGENT_HANDOFF_TARGET_INVALID,
} from "../../common/errors/errorCodes.js";
import { chatAgentIdSchema, type ChatAgentId } from "./chatAgents.js";
import {
  chatWorkflowIdSchema,
  type ChatWorkflowDefinition,
  type ChatWorkflowId,
  type WorkflowRegistry,
} from "./chatWorkflow.js";

/**
 * Safe handoff envelope. tenantId and actorId are deliberately absent: they are
 * always sourced from the trusted server context, never from a model or handoff
 * payload.
 */
export const AgentHandoffEnvelopeSchema = z
  .object({
    workflowId: chatWorkflowIdSchema,
    fromAgent: chatAgentIdSchema,
    toAgent: chatAgentIdSchema,
    requestId: z.string().trim().min(1).max(128),
    traceId: z.string().trim().min(1).max(128),
    reasonCode: z.string().trim().min(1).max(100),
    payload: z.record(z.string(), z.unknown()).default({}),
    sequence: z.number().int().nonnegative().optional(),
    createdAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict();

export type AgentHandoffEnvelope = z.infer<typeof AgentHandoffEnvelopeSchema>;

export interface ValidateAgentHandoffInput {
  workflowRegistry: WorkflowRegistry;
  workflowId: ChatWorkflowId;
  envelope: unknown;
  targetInputSchema: z.ZodType;
  allowSelfHandoff?: boolean;
}

export interface ValidatedAgentHandoff {
  envelope: AgentHandoffEnvelope;
  workflow: ChatWorkflowDefinition;
  payload: unknown;
}

const FORBIDDEN_PAYLOAD_KEYS = ["tenantId", "actorId"] as const;

/**
 * Deterministic, dependency-free handoff validation. Fail-closed: any unknown
 * workflow, agent, target, or payload violation rejects the handoff.
 */
export function validateAgentHandoff(
  input: ValidateAgentHandoffInput,
): ValidatedAgentHandoff {
  const { workflowRegistry, workflowId, targetInputSchema, allowSelfHandoff = false } =
    input;

  const workflow = workflowRegistry.require(workflowId);

  let envelope: AgentHandoffEnvelope;
  try {
    envelope = AgentHandoffEnvelopeSchema.parse(input.envelope);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(
        400,
        AGENT_HANDOFF_INVALID,
        "Invalid handoff envelope",
        error.issues,
      );
    }
    throw error;
  }

  const agents = new Set<ChatAgentId>(workflow.agents);
  if (!agents.has(envelope.fromAgent)) {
    throw new AppError(
      400,
      AGENT_HANDOFF_TARGET_INVALID,
      `fromAgent ${envelope.fromAgent} does not belong to workflow ${workflow.id}`,
    );
  }
  if (!agents.has(envelope.toAgent)) {
    throw new AppError(
      400,
      AGENT_HANDOFF_TARGET_INVALID,
      `toAgent ${envelope.toAgent} does not belong to workflow ${workflow.id}`,
    );
  }

  if (envelope.fromAgent === envelope.toAgent && !allowSelfHandoff) {
    throw new AppError(
      400,
      AGENT_HANDOFF_INVALID,
      `Self-handoff from ${envelope.fromAgent} to ${envelope.toAgent} is not allowed unless explicitly justified`,
    );
  }

  const allowedTargets = workflow.allowedHandoffs[envelope.fromAgent] ?? [];
  if (!allowedTargets.includes(envelope.toAgent)) {
    throw new AppError(
      400,
      AGENT_HANDOFF_INVALID,
      `Agent ${envelope.fromAgent} cannot hand off to ${envelope.toAgent} in workflow ${workflow.id}`,
    );
  }

  for (const key of FORBIDDEN_PAYLOAD_KEYS) {
    if (key in envelope.payload) {
      throw new AppError(
        400,
        AGENT_HANDOFF_INVALID,
        `Handoff payload must not contain ${key}`,
      );
    }
  }

  let payload: unknown;
  try {
    payload = targetInputSchema.parse(envelope.payload);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new AppError(
        400,
        AGENT_HANDOFF_INVALID,
        `Handoff payload rejected by target agent ${envelope.toAgent} input schema`,
        error.issues,
      );
    }
    throw error;
  }

  return { envelope, workflow, payload };
}
