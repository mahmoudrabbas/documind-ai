import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import { SUPERVISOR_DECISION_INVALID } from "../../common/errors/errorCodes.js";
import {
  isSupervisorDecisionAction,
  parseSupervisorDecision,
  supervisorDecisionCurrentAgent,
} from "./supervisorDecision.js";

describe("supervisorDecision contract", () => {
  it("accepts a valid handoff decision", () => {
    const decision = parseSupervisorDecision(
      JSON.stringify({
        action: "handoff",
        currentAgent: "chat-supervisor",
        nextAgent: "intent-query-agent",
        reasonCode: "route_to_intent",
        payload: { question: "Hello" },
      }),
    );
    assert.equal(decision.action, "handoff");
    assert.equal(decision.nextAgent, "intent-query-agent");
  });

  it("accepts a valid tool_call decision", () => {
    const decision = parseSupervisorDecision(
      JSON.stringify({
        action: "tool_call",
        currentAgent: "intent-query-agent",
        toolName: "hybrid_search",
        toolInput: { query: "Hello" },
        reasonCode: "retrieve_evidence",
      }),
    );
    assert.equal(decision.action, "tool_call");
    assert.equal(decision.toolName, "hybrid_search");
  });

  it("accepts a valid complete decision", () => {
    const decision = parseSupervisorDecision(
      JSON.stringify({
        action: "complete",
        currentAgent: "answer-writer-agent",
        result: { answer: "Hello" },
        reasonCode: "answer_ready",
      }),
    );
    assert.equal(decision.action, "complete");
    assert.deepEqual(decision.result, { answer: "Hello" });
  });

  it("accepts a valid fail decision", () => {
    const decision = parseSupervisorDecision(
      JSON.stringify({
        action: "fail",
        currentAgent: "chat-supervisor",
        error: { code: "E_NO_EVIDENCE", message: "No evidence found" },
        reasonCode: "no_evidence",
      }),
    );
    assert.equal(decision.action, "fail");
    assert.equal(decision.error.code, "E_NO_EVIDENCE");
  });

  it("accepts a valid await_approval decision", () => {
    const decision = parseSupervisorDecision(
      JSON.stringify({
        action: "await_approval",
        currentAgent: "compliance-agent",
        approval: { action: "publish", requiredRole: "COMPANY_ADMIN" },
        reasonCode: "needs_approval",
      }),
    );
    assert.equal(decision.action, "await_approval");
    assert.equal(decision.approval.requiredRole, "COMPANY_ADMIN");
  });

  it("rejects empty output with a typed AppError", () => {
    assert.throws(
      () => parseSupervisorDecision("   "),
      (error) =>
        error instanceof AppError &&
        error.code === SUPERVISOR_DECISION_INVALID &&
        error.statusCode === 400,
    );
  });

  it("rejects prose-wrapped output (no fallback parsing)", () => {
    assert.throws(
      () => parseSupervisorDecision("Hand off to the intent agent please."),
      (error) =>
        error instanceof AppError && error.code === SUPERVISOR_DECISION_INVALID,
    );
  });

  it("rejects markdown code fences", () => {
    assert.throws(
      () =>
        parseSupervisorDecision(
          '```json\n{"action":"complete","currentAgent":"chat-supervisor","result":{},"reasonCode":"x"}\n```',
        ),
      (error) =>
        error instanceof AppError && error.code === SUPERVISOR_DECISION_INVALID,
    );
  });

  it("rejects malformed JSON", () => {
    assert.throws(
      () => parseSupervisorDecision('{"action": "complete"'),
      (error) =>
        error instanceof AppError && error.code === SUPERVISOR_DECISION_INVALID,
    );
  });

  it("rejects non-object JSON", () => {
    assert.throws(
      () => parseSupervisorDecision('[1,2,3]'),
      (error) =>
        error instanceof AppError && error.code === SUPERVISOR_DECISION_INVALID,
    );
    assert.throws(
      () => parseSupervisorDecision('"complete"'),
      (error) =>
        error instanceof AppError && error.code === SUPERVISOR_DECISION_INVALID,
    );
  });

  it("rejects unknown actions", () => {
    assert.throws(
      () =>
        parseSupervisorDecision(
          JSON.stringify({
            action: "explode",
            currentAgent: "chat-supervisor",
            reasonCode: "x",
          }),
        ),
      (error) =>
        error instanceof AppError && error.code === SUPERVISOR_DECISION_INVALID,
    );
  });

  it("rejects unknown keys (strict contract)", () => {
    assert.throws(
      () =>
        parseSupervisorDecision(
          JSON.stringify({
            action: "complete",
            currentAgent: "chat-supervisor",
            result: {},
            reasonCode: "x",
            sneaky: "extra",
          }),
        ),
      (error) =>
        error instanceof AppError && error.code === SUPERVISOR_DECISION_INVALID,
    );
  });

  it("rejects a handoff without nextAgent", () => {
    assert.throws(
      () =>
        parseSupervisorDecision(
          JSON.stringify({
            action: "handoff",
            currentAgent: "chat-supervisor",
            reasonCode: "x",
          }),
        ),
      (error) =>
        error instanceof AppError && error.code === SUPERVISOR_DECISION_INVALID,
    );
  });

  it("rejects a tool_call with a nextAgent (action-specific invariants)", () => {
    assert.throws(
      () =>
        parseSupervisorDecision(
          JSON.stringify({
            action: "tool_call",
            currentAgent: "chat-supervisor",
            nextAgent: "intent-query-agent",
            toolName: "hybrid_search",
            toolInput: {},
            reasonCode: "x",
          }),
        ),
      (error) =>
        error instanceof AppError && error.code === SUPERVISOR_DECISION_INVALID,
    );
  });

  it("rejects a complete decision with a handoff target", () => {
    assert.throws(
      () =>
        parseSupervisorDecision(
          JSON.stringify({
            action: "complete",
            currentAgent: "chat-supervisor",
            nextAgent: "intent-query-agent",
            result: {},
            reasonCode: "x",
          }),
        ),
      (error) =>
        error instanceof AppError && error.code === SUPERVISOR_DECISION_INVALID,
    );
  });

  it("exposes action and currentAgent helpers", () => {
    assert.equal(isSupervisorDecisionAction("handoff"), true);
    assert.equal(isSupervisorDecisionAction("plan"), false);
    const decision = parseSupervisorDecision(
      JSON.stringify({
        action: "fail",
        currentAgent: "compliance-agent",
        error: { code: "E", message: "m" },
        reasonCode: "x",
      }),
    );
    assert.equal(supervisorDecisionCurrentAgent(decision), "compliance-agent");
  });
});
