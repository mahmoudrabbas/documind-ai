import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import {
  AGENT_ALREADY_REGISTERED,
  AGENT_CAPABILITY_NOT_FOUND,
  AGENT_CONTRACT_INVALID,
  AGENT_DISABLED,
  AGENT_NOT_FOUND,
} from "../../common/errors/errorCodes.js";
import type { AgentContract } from "./agentContract.js";
import type { AgentCapability } from "./agentContracts.js";
import { toAgentId } from "./agentContracts.js";
import { createAgentRegistry } from "./agentRegistry.js";

describe("AgentRegistry", () => {
  it("starts empty and registers no agents implicitly", () => {
    const registry = createAgentRegistry();
    assert.deepEqual(registry.list(), []);
    assert.equal(registry.has("anything"), false);
  });

  it("registers a minimal definition and applies defaults", () => {
    const registry = createAgentRegistry();
    const definition = registry.register({ id: "summarizer" });

    assert.equal(definition.id, "summarizer");
    assert.equal(definition.version, "1.0.0");
    assert.deepEqual(definition.capabilities, ["read"]);
    assert.deepEqual(definition.allowedTools, []);
    assert.equal(definition.status, "draft");
    assert.equal(definition.timeoutMs, 60_000);
    assert.match(definition.createdAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
    assert.match(definition.updatedAt ?? "", /^\d{4}-\d{2}-\d{2}T/);
  });

  it("registers a fully-specified definition", () => {
    const registry = createAgentRegistry();
    const definition = registry.register({
      id: "research-agent",
      version: "2.1.0",
      name: "Research Agent",
      description: "Searches and summarizes documents.",
      capabilities: ["read", "search", "summarize"],
      allowedTools: ["retrieve_document", "summarize_document"],
      timeoutMs: 120_000,
      maxSteps: 20,
      maxToolCalls: 50,
      maxTokens: 40_000,
      metadata: { owner: "platform" },
      status: "active",
    });

    assert.equal(definition.version, "2.1.0");
    assert.equal(definition.name, "Research Agent");
    assert.equal(definition.timeoutMs, 120_000);
    assert.equal(definition.maxSteps, 20);
    assert.equal(definition.maxToolCalls, 50);
    assert.equal(definition.maxTokens, 40_000);
    assert.equal(definition.status, "active");
    assert.deepEqual(definition.metadata, { owner: "platform" });
  });

  it("rejects duplicate registrations", () => {
    const registry = createAgentRegistry();
    registry.register({ id: "summarizer" });

    assert.throws(
      () => registry.register({ id: "summarizer" }),
      (error) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, AGENT_ALREADY_REGISTERED);
        assert.equal(error.statusCode, 409);
        return true;
      },
    );
  });

  it("rejects invalid definitions with AGENT_CONTRACT_INVALID", () => {
    const registry = createAgentRegistry();

    const invalidInputs: unknown[] = [
      { id: "BAD_ID" },
      { id: "ab" },
      { id: "summarizer", capabilities: [] },
      { id: "summarizer", capabilities: ["not-a-capability"] },
      { id: "summarizer", extraField: true },
      { id: "summarizer", status: "archived" },
    ];

    for (const input of invalidInputs) {
      assert.throws(
        () => registry.register(input),
        (error) => {
          assert.ok(error instanceof AppError);
          assert.equal(error.code, AGENT_CONTRACT_INVALID);
          assert.equal(error.statusCode, 400);
          return true;
        },
        `expected ${JSON.stringify(input)} to be rejected`,
      );
    }
  });

  it("exposes has/get/require/list", () => {
    const registry = createAgentRegistry();
    registry.register({ id: "summarizer", status: "active" });

    assert.equal(registry.has("summarizer"), true);
    assert.equal(registry.has("missing"), false);
    assert.equal(registry.get("missing"), undefined);
    assert.equal(registry.get("summarizer")?.id, "summarizer");
    assert.equal(registry.require("summarizer").id, "summarizer");
    assert.deepEqual(registry.list().map((d) => d.id), ["summarizer"]);

    assert.throws(
      () => registry.require("missing"),
      (error) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, AGENT_NOT_FOUND);
        assert.equal(error.statusCode, 404);
        return true;
      },
    );
  });

  it("finds agents by capability", () => {
    const registry = createAgentRegistry();
    registry.register({ id: "reader", capabilities: ["read"] });
    registry.register({ id: "researcher", capabilities: ["read", "search", "summarize"] });

    const matches = registry.findByCapability("summarize");
    assert.deepEqual(matches.map((d) => d.id), ["researcher"]);

    assert.throws(
      () => registry.findByCapability("not-a-capability" as AgentCapability),
      (error) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, AGENT_CAPABILITY_NOT_FOUND);
        assert.equal(error.statusCode, 400);
        return true;
      },
    );
  });

  it("enables, disables and gates runnable agents", () => {
    const registry = createAgentRegistry();
    registry.register({ id: "summarizer" });

    assert.throws(
      () => registry.getRunnable("summarizer"),
      (error) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, AGENT_DISABLED);
        assert.equal(error.statusCode, 409);
        return true;
      },
    );

    const enabled = registry.enable("summarizer");
    assert.equal(enabled.status, "active");
    assert.equal(registry.require("summarizer").status, "active");
    assert.equal(registry.getRunnable("summarizer").id, "summarizer");

    const disabled = registry.disable("summarizer");
    assert.equal(disabled.status, "inactive");
    assert.throws(
      () => registry.getRunnable("summarizer"),
      (error) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, AGENT_DISABLED);
        return true;
      },
    );
  });

  it("throws AGENT_NOT_FOUND when gating an unknown agent", () => {
    const registry = createAgentRegistry();
    assert.throws(
      () => registry.getRunnable("missing"),
      (error) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.code, AGENT_NOT_FOUND);
        return true;
      },
    );
  });

  it("keeps definitions immutable and enables without mutating old snapshots", () => {
    const registry = createAgentRegistry();
    const draft = registry.register({ id: "summarizer", metadata: { owner: "platform" } });

    assert.throws(() => {
      (draft as { status: string }).status = "active";
    }, TypeError);
    assert.throws(() => {
      draft.capabilities.push("execute");
    }, TypeError);
    assert.throws(() => {
      (draft.metadata as Record<string, unknown>).owner = "changed";
    }, TypeError);

    registry.enable("summarizer");
    assert.equal(draft.status, "draft");
    assert.equal(registry.require("summarizer").status, "active");
  });
});

describe("AgentContract and AgentRunContext", () => {
  it("runs a typed contract and returns an AgentResult union member", async () => {
    const contract: AgentContract<string, { length: number }> = {
      id: toAgentId("summarizer"),
      version: "1.0.0",
      capabilities: ["summarize"],
      inputSchema: z.string(),
      outputSchema: z.object({ length: z.number() }),
      execute: async (_context, input) => ({
        ok: true,
        status: "completed",
        output: { length: input.length },
        latencyMs: 1,
      }),
    };

    const result = await contract.execute(
      {
        tenantId: "tenant-1",
        actorId: "actor-1",
        actorEmail: "employee@example.com",
        actorRole: "EMPLOYEE",
        traceId: "trace-1",
        requestId: "request-1",
        workflowName: "research",
        agentName: "summarizer",
      },
      "hello",
    );

    assert.equal(result.ok, true);
    if (result.ok) {
      assert.equal(result.status, "completed");
      assert.equal(result.output.length, 5);
    }
  });

  it("allows failure results via the union's error branch", async () => {
    const contract: AgentContract = {
      id: toAgentId("reader"),
      version: "1.0.0",
      capabilities: ["read"],
      inputSchema: z.unknown(),
      outputSchema: z.unknown(),
      execute: async () => ({
        ok: false,
        status: "failed",
        error: { code: "INTERNAL", message: "boom" },
        latencyMs: 2,
      }),
    };

    const result = await contract.execute(
      {
        tenantId: "t",
        actorId: "a",
        actorEmail: "e@example.com",
        actorRole: "COMPANY_ADMIN",
        traceId: "tr",
        requestId: "req",
        workflowName: "wf",
        agentName: "reader",
      },
      undefined,
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "INTERNAL");
    }
  });
});
