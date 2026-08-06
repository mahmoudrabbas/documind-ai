import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import {
  AGENT_CONTRACT_INVALID,
  AGENT_WORKFLOW_ALREADY_REGISTERED,
  AGENT_WORKFLOW_NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import { CHAT_AGENT_IDS } from "./chatAgents.js";
import {
  chatRagV1Definition,
  createChatWorkflowRegistry,
  WorkflowRegistry,
} from "./chatWorkflow.js";

function expectAppError(fn: () => unknown, code: string, statusCode: number) {
  assert.throws(fn, (error) => {
    assert.ok(error instanceof AppError);
    assert.equal(error.code, code);
    assert.equal(error.statusCode, statusCode);
    return true;
  });
}

describe("WorkflowRegistry", () => {
  it("registers the approved chat-rag-v1 workflow", () => {
    const registry = createChatWorkflowRegistry();
    assert.equal(registry.has("chat-rag-v1"), true);
    const workflow = registry.require("chat-rag-v1");
    assert.equal(workflow.id, "chat-rag-v1");
    assert.equal(workflow.entryAgent, "chat-supervisor");
    assert.deepEqual(workflow.agents, [...CHAT_AGENT_IDS]);
  });

  it("exposes the approved chat-rag-v1 definition factory", () => {
    const workflow = chatRagV1Definition();
    assert.equal(workflow.id, "chat-rag-v1");
    assert.equal(workflow.entryAgent, "chat-supervisor");
    assert.deepEqual(workflow.agents, [...CHAT_AGENT_IDS]);
    assert.deepEqual(workflow.allowedHandoffs["chat-supervisor"], [
      "intent-query-agent",
      "answer-writer-agent",
      "citation-verification-agent",
      "compliance-agent",
    ]);
    assert.deepEqual(workflow.allowedHandoffs["intent-query-agent"], [
      "chat-supervisor",
    ]);
    assert.deepEqual(workflow.allowedHandoffs["compliance-agent"], [
      "chat-supervisor",
    ]);
  });

  it("rejects unknown workflows", () => {
    const registry = createChatWorkflowRegistry();
    expectAppError(
      () =>
        registry.register({
          id: "chat-rag-v2",
          entryAgent: "chat-supervisor",
          agents: [...CHAT_AGENT_IDS],
        }),
      AGENT_CONTRACT_INVALID,
      400,
    );
    expectAppError(
      () => registry.require("not-a-workflow"),
      AGENT_WORKFLOW_NOT_FOUND,
      404,
    );
  });

  it("rejects duplicate workflows", () => {
    const registry = new WorkflowRegistry();
    registry.register(chatRagV1Definition());
    expectAppError(
      () => registry.register(chatRagV1Definition()),
      AGENT_WORKFLOW_ALREADY_REGISTERED,
      409,
    );
  });

  it("rejects workflows whose entry agent is outside the workflow", () => {
    const registry = new WorkflowRegistry();
    expectAppError(
      () =>
        registry.register({
          id: "chat-rag-v1",
          entryAgent: "answer-writer-agent",
          agents: ["chat-supervisor", "intent-query-agent"],
        }),
      AGENT_CONTRACT_INVALID,
      400,
    );
  });

  it("rejects workflows with handoff targets outside the workflow", () => {
    const registry = new WorkflowRegistry();
    expectAppError(
      () =>
        registry.register({
          id: "chat-rag-v1",
          entryAgent: "chat-supervisor",
          agents: ["chat-supervisor", "intent-query-agent"],
          allowedHandoffs: {
            "chat-supervisor": ["compliance-agent"],
          },
        }),
      AGENT_CONTRACT_INVALID,
      400,
    );
  });

  it("rejects workflows containing unapproved agents", () => {
    const registry = new WorkflowRegistry();
    expectAppError(
      () =>
        registry.register({
          id: "chat-rag-v1",
          entryAgent: "chat-supervisor",
          agents: ["chat-supervisor", "evil-agent"],
        }),
      AGENT_CONTRACT_INVALID,
      400,
    );
  });

  it("never mutates workflow definitions externally", () => {
    const registry = createChatWorkflowRegistry();
    const workflow = registry.get("chat-rag-v1");
    assert.ok(workflow);
    assert.equal(Object.isFrozen(workflow), true);
    assert.equal(Object.isFrozen(workflow.agents), true);
    assert.equal(Object.isFrozen(workflow.allowedHandoffs), true);
    assert.equal(
      Object.isFrozen(workflow.allowedHandoffs["chat-supervisor"]),
      true,
    );

    assert.throws(
      () => {
        (workflow.agents as unknown as string[]).push("evil-agent");
      },
      TypeError,
    );
    assert.throws(
      () => {
        (workflow as { entryAgent: string }).entryAgent = "answer-writer-agent";
      },
      TypeError,
    );
    assert.throws(
      () => {
        (
          workflow.allowedHandoffs["chat-supervisor"] as unknown as string[]
        ).push("evil-agent");
      },
      TypeError,
    );
  });
});
