import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  AnswerWriterInputSchema,
  AnswerWriterOutputSchema,
  ChatSupervisorInputSchema,
  CitationVerifierInputSchema,
  CitationVerifierOutputSchema,
  ComplianceAgentInputSchema,
  ComplianceAgentOutputSchema,
  IntentAgentInputSchema,
  IntentAgentOutputSchema,
} from "./chatAgentIO.js";
import {
  ChatWorkflowInputSchema,
  ChatWorkflowResultSchema,
  ChatWorkflowStateSchema,
} from "./chatWorkflowContracts.js";

const T = "64a000000000000000000001";
const A = "64a000000000000000000002";
const C = "64a000000000000000000003";

function validState(overrides: Record<string, unknown> = {}) {
  return {
    requestId: "req-1",
    traceId: "trace-1",
    tenantId: T,
    actorId: A,
    conversationId: C,
    originalQuestion: "What is the leave policy?",
    ...overrides,
  };
}

describe("chat workflow contracts", () => {
  it("accepts a valid ChatWorkflowInput", () => {
    const input = ChatWorkflowInputSchema.parse(validState());
    assert.equal(input.conversationId, C);
    assert.equal(input.originalQuestion, "What is the leave policy?");
  });

  it("requires tenantId and actorId (no defaults allowed)", () => {
    for (const missing of ["tenantId", "actorId"]) {
      const rest: Record<string, unknown> = { ...validState() };
      delete rest[missing];
      assert.equal(ChatWorkflowStateSchema.safeParse(rest).success, false, missing);
    }
  });

  it("rejects ChatWorkflowState missing any required field", () => {
    const required = [
      "requestId",
      "traceId",
      "tenantId",
      "actorId",
      "conversationId",
      "originalQuestion",
    ];
    for (const missing of required) {
      const rest: Record<string, unknown> = { ...validState() };
      delete rest[missing];
      assert.equal(ChatWorkflowStateSchema.safeParse(rest).success, false, missing);
    }
  });

  it("does not allow raw document or chunk text in workflow state", () => {
    for (const key of ["documentText", "chunkText", "text", "rawContent"]) {
      assert.equal(
        ChatWorkflowStateSchema.safeParse(validState({ [key]: "secret" }))
          .success,
        false,
        key,
      );
    }
    assert.equal(ChatWorkflowResultSchema.safeParse({
      conversationId: C,
      answerDecision: "grounded_answer",
      documentText: "leak",
    }).success, false);
  });

  it("accepts a fully-populated valid ChatWorkflowState", () => {
    const state = ChatWorkflowStateSchema.parse(
      validState({
        normalizedQuestion: "Leave policy",
        language: "en",
        route: "rag",
        intent: "knowledge_question",
        referencedDocumentIds: ["doc-1", "doc-2", "doc-1"],
        retrievalCandidateIds: ["c1", "c2"],
        approvedEvidenceIds: ["c1"],
        answerDecision: "grounded_answer",
        answerText: "The leave policy states 30 days.",
        citedChunkIds: ["c1", "c2", "c1"],
        validatedCitationIds: ["c1"],
        complianceDecision: "release",
        reasonCode: "COMPLIANCE_PASSED",
      }),
    );
    assert.deepEqual(state.referencedDocumentIds, ["doc-1", "doc-2"]);
    assert.deepEqual(state.citedChunkIds, ["c1", "c2"]);
    assert.equal(state.complianceDecision, "release");
  });

  it("rejects unknown security-sensitive properties in state", () => {
    assert.equal(
      ChatWorkflowStateSchema.safeParse({
        ...validState(),
        chainOfThought: "hidden",
      }).success,
      false,
    );
  });
});

describe("per-agent input/output schemas", () => {
  it("accept valid values for all required schemas", () => {
    assert.equal(ChatSupervisorInputSchema.safeParse({}).success, true);

    assert.equal(
      IntentAgentInputSchema.safeParse({
        conversationId: C,
        question: "What is the leave policy?",
      }).success,
      true,
    );
    assert.equal(
      IntentAgentOutputSchema.safeParse({
        normalizedQuestion: "Leave policy summary",
        language: "en",
        route: "rag",
        intent: "knowledge_question",
        intentConfidence: 0.92,
        referencedDocumentIds: ["doc-1"],
      }).success,
      true,
    );

    assert.equal(
      AnswerWriterInputSchema.safeParse({
        conversationId: C,
        question: "Leave policy summary",
      }).success,
      true,
    );
    assert.equal(
      AnswerWriterOutputSchema.safeParse({
        decision: "grounded_answer",
        answer: "The leave policy states 30 days.",
        citedChunkIds: ["c1", "c2"],
      }).success,
      true,
    );

    assert.equal(
      CitationVerifierInputSchema.safeParse({
        decision: "grounded_answer",
        citedChunkIds: ["c1", "c2"],
        approvedEvidenceIds: ["c1", "c2"],
      }).success,
      true,
    );
    assert.equal(
      CitationVerifierOutputSchema.safeParse({
        verified: false,
        validatedCitationIds: ["c1"],
        rejectedCitationIds: ["c2"],
        unsupportedClaims: [],
        reasonCode: "MISSING_CITATIONS",
      }).success,
      true,
    );

    assert.equal(
      ComplianceAgentInputSchema.safeParse({
        route: "rag",
        answerDecision: "grounded_answer",
        answer: "The leave policy states 30 days.",
        language: "en",
        citationsEnabled: true,
        citationVerification: {
          verified: true,
          validatedCitationIds: ["c1"],
          reasonCode: "CITATIONS_VERIFIED",
        },
      }).success,
      true,
    );
    assert.equal(
      ComplianceAgentOutputSchema.safeParse({
        action: "release",
        answer: "The leave policy states 30 days.",
        sourceIds: ["c1"],
        reasonCode: "COMPLIANT_GROUNDED_RESPONSE",
      }).success,
      true,
    );
  });

  it("fail closed on invalid per-agent values", () => {
    const invalid: Array<{ schema: { safeParse: (v: unknown) => { success: boolean } }; value: unknown }> = [
      { schema: ChatSupervisorInputSchema, value: { message: "unexpected" } },
      { schema: IntentAgentInputSchema, value: { conversationId: C } },
      { schema: IntentAgentInputSchema, value: { conversationId: C, question: "" } },
      {
        schema: IntentAgentOutputSchema,
        value: {
          normalizedQuestion: "q",
          language: "en",
          route: "not-a-route",
          intent: "knowledge_question",
          intentConfidence: 0.5,
        },
      },
      {
        schema: IntentAgentOutputSchema,
        value: {
          normalizedQuestion: "q",
          language: "en",
          route: "rag",
          intent: "knowledge_question",
          intentConfidence: 1.5,
        },
      },
      {
        schema: AnswerWriterOutputSchema,
        value: { decision: "made_up", answer: "x", citedChunkIds: [] },
      },
      {
        schema: AnswerWriterOutputSchema,
        value: { decision: "grounded_answer", answer: "x".repeat(20_001), citedChunkIds: [] },
      },
      {
        schema: CitationVerifierInputSchema,
        value: {
          decision: "made_up",
          citedChunkIds: ["c1"],
          approvedEvidenceIds: ["c1"],
        },
      },
      {
        schema: CitationVerifierOutputSchema,
        value: { verified: "maybe", reasonCode: "CITATIONS_VERIFIED" },
      },
      {
        schema: CitationVerifierOutputSchema,
        value: { verified: true, reasonCode: "NOT_A_CODE" },
      },
      {
        schema: CitationVerifierOutputSchema,
        value: { verified: true },
      },
      {
        schema: ComplianceAgentOutputSchema,
        value: { action: "unsure", answer: "x", sourceIds: [], reasonCode: "UNSAFE_RESPONSE" },
      },
      {
        schema: ComplianceAgentOutputSchema,
        value: { action: "release" },
      },
      {
        schema: ComplianceAgentInputSchema,
        value: {
          answerDecision: "grounded_answer",
          answer: "x",
          citationVerification: {
            verified: "maybe",
            validatedCitationIds: ["c1"],
            reasonCode: "CITATIONS_VERIFIED",
          },
        },
      },
      {
        schema: ComplianceAgentInputSchema,
        value: {
          answerDecision: "grounded_answer",
          answer: "x",
          citationVerification: {
            verified: true,
            validatedCitationIds: ["c1"],
            rejectedCitationIds: ["c1"],
            reasonCode: "CITATIONS_VERIFIED",
          },
        },
      },
      {
        schema: ComplianceAgentInputSchema,
        value: {
          answerDecision: "made_up",
          answer: "x",
        },
      },
    ];

    for (const { schema, value } of invalid) {
      assert.equal(schema.safeParse(value).success, false, JSON.stringify(value));
    }
  });

  it("rejects prompts, chain-of-thought and document content in outputs", () => {
    for (const value of [
      {
        normalizedQuestion: "q",
        language: "en",
        route: "rag",
        intent: "knowledge_question",
        intentConfidence: 0.5,
        chainOfThought: "step 1...",
      },
      {
        normalizedQuestion: "q",
        language: "en",
        route: "rag",
        intent: "knowledge_question",
        intentConfidence: 0.5,
        documentText: "secret",
      },
    ]) {
      assert.equal(IntentAgentOutputSchema.safeParse(value).success, false);
    }
  });
});
