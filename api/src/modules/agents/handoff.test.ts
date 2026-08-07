import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import {
  AGENT_HANDOFF_INVALID,
  AGENT_HANDOFF_TARGET_INVALID,
  AGENT_WORKFLOW_NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import {
  ChatSupervisorInputSchema,
  IntentAgentInputSchema,
  ComplianceAgentInputSchema,
} from "./chatAgentIO.js";
import { createChatWorkflowRegistry, WorkflowRegistry } from "./chatWorkflow.js";
import { validateAgentHandoff } from "./handoff.js";

const C = "64a000000000000000000003";

function envelope(overrides: Record<string, unknown> = {}) {
  return {
    workflowId: "chat-rag-v1",
    fromAgent: "chat-supervisor",
    toAgent: "intent-query-agent",
    requestId: "req-1",
    traceId: "trace-1",
    reasonCode: "ROUTE_TO_INTENT",
    payload: {},
    ...overrides,
  };
}

const TARGET_SCHEMAS: Record<string, z.ZodType> = {
  "chat-supervisor": ChatSupervisorInputSchema,
  "intent-query-agent": IntentAgentInputSchema,
  "compliance-agent": ComplianceAgentInputSchema,
};

function validate(
  workflowRegistry: WorkflowRegistry,
  input: Record<string, unknown>,
  options: { allowSelfHandoff?: boolean } = {},
) {
  const toAgent = input.toAgent as string;
  return validateAgentHandoff({
    workflowRegistry,
    workflowId: "chat-rag-v1",
    envelope: input,
    targetInputSchema: TARGET_SCHEMAS[toAgent] ?? ChatSupervisorInputSchema,
    allowSelfHandoff: options.allowSelfHandoff ?? false,
  });
}

function expectAppError(fn: () => unknown, code: string, statusCode: number) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, statusCode);
    return true;
  });
}

describe("AgentHandoffEnvelope validation", () => {
  it("rejects unknown handoff targets", () => {
    const registry = createChatWorkflowRegistry();
    expectAppError(
      () => validate(registry, envelope({ toAgent: "evil-agent" })),
      AGENT_HANDOFF_INVALID,
      400,
    );
  });

  it("rejects handoffs for unregistered workflows", () => {
    const empty = new WorkflowRegistry();
    expectAppError(() => validate(empty, envelope()), AGENT_WORKFLOW_NOT_FOUND, 404);
  });

  it("rejects handoff to an agent outside the workflow", () => {
    const registry = new WorkflowRegistry();
    registry.register({
      id: "chat-rag-v1",
      entryAgent: "chat-supervisor",
      agents: ["chat-supervisor", "intent-query-agent"],
      allowedHandoffs: {
        "chat-supervisor": ["intent-query-agent"],
      },
    });
    expectAppError(
      () => validate(registry, envelope({ toAgent: "answer-writer-agent" })),
      AGENT_HANDOFF_TARGET_INVALID,
      400,
    );
  });

  it("rejects a handoff that is not in the workflow's allowed handoffs", () => {
    const registry = createChatWorkflowRegistry();
    expectAppError(
      () =>
        validate(
          registry,
          envelope({
            fromAgent: "intent-query-agent",
            toAgent: "answer-writer-agent",
          }),
        ),
      AGENT_HANDOFF_INVALID,
      400,
    );
  });

  it("rejects invalid target-agent payloads", () => {
    const registry = createChatWorkflowRegistry();
    expectAppError(
      () =>
        validate(registry, envelope({ payload: { conversationId: C, question: 42 } })),
      AGENT_HANDOFF_INVALID,
      400,
    );
  });

  it("rejects payloads that try to override tenantId or actorId", () => {
    const registry = createChatWorkflowRegistry();
    for (const key of ["tenantId", "actorId"]) {
      expectAppError(
        () =>
          validate(
            registry,
            envelope({
              payload: {
                conversationId: C,
                question: "What is the leave policy?",
                [key]: "model-controlled-value",
              },
            }),
          ),
        AGENT_HANDOFF_INVALID,
        400,
      );
    }
  });

  it("rejects self-handoff unless explicitly justified", () => {
    const registry = new WorkflowRegistry();
    registry.register({
      id: "chat-rag-v1",
      entryAgent: "chat-supervisor",
      agents: ["chat-supervisor", "intent-query-agent"],
      allowedHandoffs: {
        "chat-supervisor": ["chat-supervisor", "intent-query-agent"],
      },
    });

    expectAppError(
      () => validate(registry, envelope({ toAgent: "chat-supervisor" })),
      AGENT_HANDOFF_INVALID,
      400,
    );

    const justified = validate(
      registry,
      envelope({ toAgent: "chat-supervisor" }),
      { allowSelfHandoff: true },
    );
    assert.equal(justified.envelope.toAgent, "chat-supervisor");
  });

  it("validates valid handoffs between approved agents", () => {
    const registry = createChatWorkflowRegistry();

    const toIntent = validate(
      registry,
      envelope({
        payload: {
          conversationId: C,
          question: "What is the leave policy?",
        },
      }),
    );
    assert.equal(toIntent.envelope.fromAgent, "chat-supervisor");
    assert.equal(toIntent.envelope.toAgent, "intent-query-agent");
    assert.deepEqual(toIntent.payload, {
      conversationId: C,
      question: "What is the leave policy?",
    });

    const backToSupervisor = validate(
      registry,
      envelope({
        fromAgent: "intent-query-agent",
        toAgent: "chat-supervisor",
        reasonCode: "RETURN_TO_SUPERVISOR",
      }),
    );
    assert.equal(backToSupervisor.envelope.toAgent, "chat-supervisor");
    assert.deepEqual(backToSupervisor.payload, {});
  });

  it("keeps the execution context out of the envelope payload", () => {
    const registry = createChatWorkflowRegistry();
    const handoff = validate(
      registry,
      envelope({
        payload: {
          conversationId: C,
          question: "What is the leave policy?",
        },
      }),
    );
    const payloadKeys = Object.keys(handoff.payload as Record<string, unknown>);
    assert.ok(!payloadKeys.includes("tenantId"));
    assert.ok(!payloadKeys.includes("actorId"));
  });

  it("allows citation-verification-agent -> compliance-agent (Issue 7 edge)", () => {
    const registry = createChatWorkflowRegistry();
    const validated = validate(
      registry,
      envelope({
        fromAgent: "citation-verification-agent",
        toAgent: "compliance-agent",
        reasonCode: "VERIFY_COMPLIANCE",
        payload: {
          answerDecision: "grounded_answer",
          answer: "The policy is X.",
        },
      }),
    );
    assert.equal(validated.envelope.fromAgent, "citation-verification-agent");
    assert.equal(validated.envelope.toAgent, "compliance-agent");
  });

  it("still blocks intent-query-agent -> compliance-agent", () => {
    const registry = createChatWorkflowRegistry();
    expectAppError(
      () =>
        validate(
          registry,
          envelope({
            fromAgent: "intent-query-agent",
            toAgent: "compliance-agent",
            payload: {
              answerDecision: "grounded_answer",
              answer: "x",
            },
          }),
        ),
      AGENT_HANDOFF_INVALID,
      400,
    );
  });
});
