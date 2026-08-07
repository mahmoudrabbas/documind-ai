import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import {
  ComplianceAgentInput,
  ComplianceAgentOutputSchema,
} from "./chatAgentIO.js";
import {
  COMPLIANCE_AGENT_ID,
  COMPLIANCE_AGENT_VERSION,
  ComplianceAgentExecutor,
  mapComplianceAgentError,
  registerComplianceAgentExecutor,
  type ComplianceAgentDependencies,
} from "./complianceAgent.js";
import { evaluateCompliance } from "./compliance.service.js";
import { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import { createChatAgentRegistry } from "./chatAgents.js";
import { toAgentId } from "./agentContracts.js";
import { AGENT_CONTRACT_INVALID, AGENT_PROVIDER_ERROR } from "../../common/errors/errorCodes.js";
import type { AgentRunContext } from "./agentRunContext.js";

function makeContext(): AgentRunContext {
  return {
    tenantId: "507f1f77bcf86cd799439011",
    actorId: "507f1f77bcf86cd799439012",
    actorEmail: "test@example.com",
    actorRole: "EMPLOYEE",
    traceId: "trace-1",
    requestId: "req-1",
    workflowName: "chat-rag-v1",
    agentName: COMPLIANCE_AGENT_ID,
    runId: "run-1",
    stepIndex: 0,
    maxSteps: 10,
    maxToolCalls: 10,
    maxTokens: 1000,
    budgetMs: 30000,
  };
}

function makeInput(overrides: Partial<ComplianceAgentInput> = {}): ComplianceAgentInput {
  return {
    route: "rag",
    answerDecision: "grounded_answer",
    answer: "The leave policy grants 30 days of paid leave per year.",
    language: "en",
    citationsEnabled: true,
    citationVerification: {
      verified: true,
      validatedCitationIds: ["chunk_42"],
      reasonCode: "CITATIONS_VERIFIED",
    },
    ...overrides,
  };
}

describe("complianceAgent — executor unit tests", () => {
  it("registers under approved id with correct version and capabilities", () => {
    const registry = new AgentExecutorRegistry(createChatAgentRegistry());
    registerComplianceAgentExecutor(registry, { evaluate: evaluateCompliance });
    const contract = registry.requireExecutor(COMPLIANCE_AGENT_ID);
    assert.equal(contract.id, toAgentId(COMPLIANCE_AGENT_ID));
    assert.equal(contract.version, COMPLIANCE_AGENT_VERSION);
    assert.deepEqual(contract.capabilities, ["read", "sensitive_execute"]);
  });

  it("valid grounded + verified + citations enabled => release with validated sourceIds", async () => {
    const executor = new ComplianceAgentExecutor({ deps: { evaluate: evaluateCompliance } });
    const result = await executor.execute(makeContext(), makeInput());
    assert.equal(result.ok, true);
    assert.equal(result.status, "completed");
    assert.equal(result.output.action, "release");
    assert.equal(result.output.reasonCode, "COMPLIANT_GROUNDED_RESPONSE");
    assert.equal(result.output.answer, makeInput().answer);
    assert.deepEqual(result.output.sourceIds, ["chunk_42"]);
    assert.ok(typeof result.latencyMs === "number" && result.latencyMs >= 0);
  });

  it("citations disabled => release with empty sourceIds", async () => {
    const executor = new ComplianceAgentExecutor({ deps: { evaluate: evaluateCompliance } });
    const result = await executor.execute(makeContext(), makeInput({ citationsEnabled: false }));
    assert.equal(result.ok, true);
    assert.equal(result.output.action, "release");
    assert.equal(result.output.reasonCode, "COMPLIANT_GROUNDED_RESPONSE_CITATIONS_DISABLED");
    assert.equal(result.output.sourceIds.length, 0);
  });

  it("insufficient_evidence => refuse with insufficient-evidence message", async () => {
    const executor = new ComplianceAgentExecutor({ deps: { evaluate: evaluateCompliance } });
    const result = await executor.execute(makeContext(), makeInput({ answerDecision: "insufficient_evidence" }));
    assert.equal(result.ok, true);
    assert.equal(result.output.action, "refuse");
    assert.equal(result.output.reasonCode, "INSUFFICIENT_EVIDENCE");
    assert.equal(result.output.sourceIds.length, 0);
  });

  it("unsupported => refuse with unsupported reply", async () => {
    const executor = new ComplianceAgentExecutor({ deps: { evaluate: evaluateCompliance } });
    const result = await executor.execute(makeContext(), makeInput({ answerDecision: "unsupported" }));
    assert.equal(result.ok, true);
    assert.equal(result.output.action, "refuse");
    assert.equal(result.output.reasonCode, "UNSUPPORTED_REQUEST");
    assert.ok(typeof result.output.answer === "string" && result.output.answer.length > 0);
    assert.equal(result.output.sourceIds.length, 0);
  });

  it("unsafe => refuse with unsafe reply", async () => {
    const executor = new ComplianceAgentExecutor({ deps: { evaluate: evaluateCompliance } });
    const result = await executor.execute(makeContext(), makeInput({ answerDecision: "unsafe" }));
    assert.equal(result.ok, true);
    assert.equal(result.output.action, "refuse");
    assert.equal(result.output.reasonCode, "UNSAFE_RESPONSE");
    assert.ok(typeof result.output.answer === "string" && result.output.answer.length > 0);
    assert.equal(result.output.sourceIds.length, 0);
  });

  it("clarification => clarify with preserved answer", async () => {
    const executor = new ComplianceAgentExecutor({ deps: { evaluate: evaluateCompliance } });
    const result = await executor.execute(makeContext(), makeInput({ answerDecision: "clarification", answer: "What year?" }));
    assert.equal(result.ok, true);
    assert.equal(result.output.action, "clarify");
    assert.equal(result.output.reasonCode, "CLARIFICATION_REQUIRED");
    assert.equal(result.output.answer, "What year?");
    assert.equal(result.output.sourceIds.length, 0);
  });

  it("malformed input => AGENT_CONTRACT_INVALID", async () => {
    const executor = new ComplianceAgentExecutor({ deps: { evaluate: evaluateCompliance } });
    const result = await executor.execute(makeContext(), { tenantPolicy: {} });
    assert.equal(result.ok, false);
    assert.equal(result.status, "failed");
    assert.equal(result.error.code, AGENT_CONTRACT_INVALID);
  });

  it("strict schema rejects unknown fields", async () => {
    const executor = new ComplianceAgentExecutor({ deps: { evaluate: evaluateCompliance } });
    const result = await executor.execute(makeContext(), { ...makeInput(), bogus: "field" });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, AGENT_CONTRACT_INVALID);
  });

  it("strict schema rejects rejectedCitationIds in input", async () => {
    const executor = new ComplianceAgentExecutor({ deps: { evaluate: evaluateCompliance } });
    const badInput = {
      ...makeInput(),
      citationVerification: {
        verified: true,
        validatedCitationIds: ["chunk_42"],
        reasonCode: "CITATIONS_VERIFIED" as const,
        rejectedCitationIds: ["x"],
      },
    } as unknown;
    const result = await executor.execute(makeContext(), badInput);
    assert.equal(result.ok, false);
    assert.equal(result.error.code, AGENT_CONTRACT_INVALID);
  });

  it("no raw evidence/document content accepted (strict)", async () => {
    const executor = new ComplianceAgentExecutor({ deps: { evaluate: evaluateCompliance } });
    const result = await executor.execute(makeContext(), { ...makeInput(), rawEvidence: "secret" });
    assert.equal(result.ok, false);
    assert.equal(result.error.code, AGENT_CONTRACT_INVALID);
  });

  it("no LLM metadata in successful output", async () => {
    const executor = new ComplianceAgentExecutor({ deps: { evaluate: evaluateCompliance } });
    const result = await executor.execute(makeContext(), makeInput());
    assert.equal(result.ok, true);
    assert.ok(!("modelProvider" in result.output));
    assert.ok(!("modelName" in result.output));
    assert.ok(!("promptVersion" in result.output));
    assert.ok(!("tokensUsed" in result.output));
    assert.ok(!("estimatedCost" in result.output));
  });

  it("unexpected service failure maps safely to AGENT_PROVIDER_ERROR", async () => {
    const throwingDeps: ComplianceAgentDependencies = {
      evaluate: () => { throw new Error("internal boom"); },
    };
    const executor = new ComplianceAgentExecutor({ deps: throwingDeps });
    const result = await executor.execute(makeContext(), makeInput());
    assert.equal(result.ok, false);
    assert.equal(result.status, "failed");
    assert.equal(result.error.code, AGENT_PROVIDER_ERROR);
    assert.equal(result.error.message, "Compliance evaluation failed");
  });

  it("output always passes ComplianceAgentOutputSchema", async () => {
    const testInputs = [
      makeInput(),
      makeInput({ citationsEnabled: false }),
      makeInput({ citationVerification: { verified: false, validatedCitationIds: [], reasonCode: "MISSING_CITATIONS" } }),
      makeInput({ answerDecision: "insufficient_evidence" }),
      makeInput({ answerDecision: "unsupported" }),
      makeInput({ answerDecision: "unsafe" }),
      makeInput({ route: "unsafe" }),
      makeInput({ route: "unsupported" }),
      makeInput({ answerDecision: "clarification", answer: "More detail?" }),
      makeInput({ route: "clarification" }),
    ];
    for (const input of testInputs) {
      const executor = new ComplianceAgentExecutor({ deps: { evaluate: evaluateCompliance } });
      const result = await executor.execute(makeContext(), input);
      assert.equal(result.ok, true);
      if (result.ok) {
        const round = ComplianceAgentOutputSchema.safeParse(result.output);
        assert.equal(round.success, true, `output did not round-trip: ${JSON.stringify(result.output)}`);
      }
    }
  });

  describe("error mapping", () => {
    it("maps 401/403 AppError to unauthorized", () => {
      const err = new AppError(401, "TEST_CODE", "unauthorized");
      const mapped = mapComplianceAgentError(err);
      assert.equal(mapped.status, "unauthorized");
      assert.equal(mapped.code, "TEST_CODE");
    });

    it("maps other AppError to failed", () => {
      const err = new AppError(500, "OTHER_CODE", "server error");
      const mapped = mapComplianceAgentError(err);
      assert.equal(mapped.status, "failed");
      assert.equal(mapped.code, "OTHER_CODE");
    });

    it("maps unknown error to AGENT_PROVIDER_ERROR", () => {
      const mapped = mapComplianceAgentError(new Error("boom"));
      assert.equal(mapped.status, "failed");
      assert.equal(mapped.code, AGENT_PROVIDER_ERROR);
      assert.equal(mapped.message, "Compliance evaluation failed");
    });

    it("does not propagate sensitive AppError messages", () => {
      const sensitiveErr = new AppError(401, "AUTH_TOKEN_EXPIRED", "JWT token for user=admin tenant=secret expired at 2026-01-01");
      const mapped = mapComplianceAgentError(sensitiveErr);
      assert.equal(mapped.status, "unauthorized");
      assert.equal(mapped.code, "AUTH_TOKEN_EXPIRED");
      assert.equal(mapped.message, "Compliance evaluation unauthorized");
      assert.ok(!mapped.message.includes("JWT"));
      assert.ok(!mapped.message.includes("user=admin"));
      assert.ok(!mapped.message.includes("tenant=secret"));

      const serverErr = new AppError(500, "DB_CONNECTION_FAILED", "Connection to postgres://user:pass@db:5432/tenant_123 failed");
      const mapped2 = mapComplianceAgentError(serverErr);
      assert.equal(mapped2.status, "failed");
      assert.equal(mapped2.code, "DB_CONNECTION_FAILED");
      assert.equal(mapped2.message, "Compliance evaluation failed");
      assert.ok(!mapped2.message.includes("postgres"));
      assert.ok(!mapped2.message.includes("pass"));
      assert.ok(!mapped2.message.includes("tenant_123"));
    });
  });
});