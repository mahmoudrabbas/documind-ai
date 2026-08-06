import assert from "node:assert/strict";
import { describe, it } from "node:test";
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
import { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import { ChatAgentRegistry, createChatAgentRegistry } from "./chatAgents.js";

function makeContract(
  id: string,
  overrides: Partial<AgentContract> = {},
): AgentContract {
  return {
    id,
    version: "1.0.0",
    capabilities: ["read"],
    inputSchema: z.object({ question: z.string() }),
    outputSchema: z.object({ answer: z.string() }),
    execute: async () => ({
      ok: true,
      status: "completed",
      output: { answer: "hello" },
      latencyMs: 1,
    }),
    ...overrides,
  } as AgentContract;
}

describe("AgentExecutorRegistry", () => {
  it("starts empty and registers no fake agents implicitly", () => {
    const registry = new AgentExecutorRegistry();
    assert.equal(registry.listExecutors().length, 0);
    assert.equal(registry.hasExecutor("intent-query-agent"), false);
  });

  it("rejects registration outside the closed chat agent id set", () => {
    const registry = new AgentExecutorRegistry();
    assert.throws(
      () => registry.register(makeContract("intruder-agent")),
      (error) =>
        error instanceof AppError && error.code === AGENT_CONTRACT_INVALID,
    );
  });

  it("registers an executor for an approved, active agent", () => {
    const registry = new AgentExecutorRegistry();
    const definition = registry.register(makeContract("intent-query-agent"));
    assert.equal(definition.id, "intent-query-agent");
    assert.equal(definition.status, "active");
    assert.equal(registry.hasExecutor("intent-query-agent"), true);
    assert.equal(registry.listExecutors().length, 1);
  });

  it("rejects duplicate executor registration", () => {
    const registry = new AgentExecutorRegistry();
    registry.register(makeContract("intent-query-agent"));
    assert.throws(
      () => registry.register(makeContract("intent-query-agent")),
      (error) =>
        error instanceof AppError && error.code === AGENT_ALREADY_REGISTERED,
    );
  });

  it("rejects registration when no approved definition exists", () => {
    const registry = new AgentExecutorRegistry(new ChatAgentRegistry());
    assert.throws(
      () => registry.register(makeContract("intent-query-agent")),
      (error) =>
        error instanceof AppError && error.code === AGENT_NOT_FOUND,
    );
  });

  it("rejects registration for a disabled agent", () => {
    const definitions = createChatAgentRegistry();
    definitions.disable("intent-query-agent");
    const registry = new AgentExecutorRegistry(definitions);
    assert.throws(
      () => registry.register(makeContract("intent-query-agent")),
      (error) =>
        error instanceof AppError && error.code === AGENT_DISABLED,
    );
  });

  it("rejects executors without a Zod input or output schema", () => {
    const registry = new AgentExecutorRegistry();
    assert.throws(
      () =>
        registry.register(
          makeContract("intent-query-agent", {
            inputSchema: {} as unknown as z.ZodType,
          }),
        ),
      (error) =>
        error instanceof AppError && error.code === AGENT_CONTRACT_INVALID,
    );
    assert.throws(
      () =>
        registry.register(
          makeContract("intent-query-agent", {
            outputSchema: {} as unknown as z.ZodType,
          }),
        ),
      (error) =>
        error instanceof AppError && error.code === AGENT_CONTRACT_INVALID,
    );
  });

  it("getExecutor/requireExecutor fail closed for unknown agents", () => {
    const registry = new AgentExecutorRegistry();
    assert.throws(
      () => registry.getExecutor("intent-query-agent"),
      (error) =>
        error instanceof AppError &&
        error.code === AGENT_EXECUTOR_NOT_FOUND &&
        error.statusCode === 404,
    );
    assert.throws(
      () => registry.requireExecutor("answer-writer-agent"),
      (error) =>
        error instanceof AppError &&
        error.code === AGENT_EXECUTOR_NOT_FOUND,
    );
  });

  it("requireDefinition returns only runnable, active definitions", () => {
    const registry = new AgentExecutorRegistry();
    assert.equal(registry.requireDefinition("chat-supervisor").status, "active");
    assert.throws(
      () => registry.requireDefinition("unknown-agent"),
      (error) =>
        error instanceof AppError && error.code === AGENT_CONTRACT_INVALID,
    );
  });

  it("exposes the underlying chat agent definitions registry", () => {
    const registry = new AgentExecutorRegistry();
    assert.ok(registry.definitionsRegistry() instanceof ChatAgentRegistry);
    assert.equal(registry.definitionsRegistry().has("compliance-agent"), true);
  });
});
