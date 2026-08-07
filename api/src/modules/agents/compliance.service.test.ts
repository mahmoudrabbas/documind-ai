import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ComplianceAgentInput,
  ComplianceAgentInputSchema,
  ComplianceAgentOutputSchema,
} from "./chatAgentIO.js";
import {
  clarificationReplyFor,
  evaluateCompliance,
  unsafeReplyFor,
  unsupportedReplyFor,
} from "./compliance.service.js";
import {
  INSUFFICIENT_AUTHORIZED_EVIDENCE_AR,
  insufficientEvidenceMessage,
} from "./answerWriter.service.js";

const ANSWER = "The leave policy grants 30 days of paid leave per year.";
const CITATION = "chunk_42";
const CITATION_B = "chunk_7";

function groundedInput(
  overrides: Partial<ComplianceAgentInput> = {},
): ComplianceAgentInput {
  return {
    route: "rag",
    answerDecision: "grounded_answer",
    answer: ANSWER,
    language: "en",
    citationsEnabled: true,
    citationVerification: {
      verified: true,
      validatedCitationIds: [CITATION],
      reasonCode: "CITATIONS_VERIFIED",
    },
    ...overrides,
  };
}

describe("compliance.service — deterministic gate", () => {
  it("A: releases a verified grounded answer with validated source ids", () => {
    const out = evaluateCompliance(groundedInput());
    assert.equal(out.action, "release");
    assert.equal(out.reasonCode, "COMPLIANT_GROUNDED_RESPONSE");
    assert.equal(out.answer, ANSWER);
    assert.deepEqual(out.sourceIds, [CITATION]);
  });

  it("A: dedupes and bounds sourceIds from validated citations", () => {
    const out = evaluateCompliance(
      groundedInput({
        citationVerification: {
          verified: true,
          validatedCitationIds: [CITATION, CITATION, CITATION_B],
          reasonCode: "CITATIONS_VERIFIED",
        },
      }),
    );
    assert.equal(out.reasonCode, "COMPLIANT_GROUNDED_RESPONSE");
    assert.deepEqual(out.sourceIds, [CITATION, CITATION_B]);
  });

  it("B: releases grounded answer with citations disabled, empty sources", () => {
    const out = evaluateCompliance(groundedInput({ citationsEnabled: false }));
    assert.equal(out.action, "release");
    assert.equal(out.reasonCode, "COMPLIANT_GROUNDED_RESPONSE_CITATIONS_DISABLED");
    assert.equal(out.answer, ANSWER);
    assert.deepEqual(out.sourceIds, []);
  });

  it("citations disabled does NOT bypass failed verification", () => {
    const out = evaluateCompliance(
      groundedInput({
        citationsEnabled: false,
        citationVerification: {
          verified: false,
          validatedCitationIds: [],
          reasonCode: "MISSING_CITATIONS",
        },
      }),
    );
    assert.equal(out.action, "refuse");
    assert.equal(out.reasonCode, "UNVERIFIED_GROUNDED_RESPONSE");
    assert.notEqual(out.answer, ANSWER);
    assert.equal(out.answer, insufficientEvidenceMessage("en"));
    assert.deepEqual(out.sourceIds, []);
  });

  it("verified=false + citationsEnabled=true => refuse", () => {
    const out = evaluateCompliance(
      groundedInput({
        citationsEnabled: true,
        citationVerification: {
          verified: false,
          validatedCitationIds: [],
          reasonCode: "MISSING_CITATIONS",
        },
      }),
    );
    assert.equal(out.action, "refuse");
    assert.equal(out.reasonCode, "UNVERIFIED_GROUNDED_RESPONSE");
    assert.notEqual(out.answer, ANSWER);
    assert.equal(out.answer, insufficientEvidenceMessage("en"));
    assert.deepEqual(out.sourceIds, []);
  });

  it("verified=false + citationsEnabled=false => refuse", () => {
    const out = evaluateCompliance(
      groundedInput({
        citationsEnabled: false,
        citationVerification: {
          verified: false,
          validatedCitationIds: [],
          reasonCode: "MISSING_CITATIONS",
        },
      }),
    );
    assert.equal(out.action, "refuse");
    assert.equal(out.reasonCode, "UNVERIFIED_GROUNDED_RESPONSE");
    assert.notEqual(out.answer, ANSWER);
    assert.equal(out.answer, insufficientEvidenceMessage("en"));
    assert.deepEqual(out.sourceIds, []);
  });

  it("verified=true + zero validated IDs + citationsEnabled=true => refuse", () => {
    const out = evaluateCompliance(
      groundedInput({
        citationsEnabled: true,
        citationVerification: {
          verified: true,
          validatedCitationIds: [],
          reasonCode: "CITATIONS_VERIFIED",
        },
      }),
    );
    assert.equal(out.action, "refuse");
    assert.equal(out.reasonCode, "UNVERIFIED_GROUNDED_RESPONSE");
    assert.notEqual(out.answer, ANSWER);
    assert.equal(out.answer, insufficientEvidenceMessage("en"));
    assert.deepEqual(out.sourceIds, []);
  });

  it("verified=true + zero validated IDs + citationsEnabled=false => refuse", () => {
    const out = evaluateCompliance(
      groundedInput({
        citationsEnabled: false,
        citationVerification: {
          verified: true,
          validatedCitationIds: [],
          reasonCode: "CITATIONS_VERIFIED",
        },
      }),
    );
    assert.equal(out.action, "refuse");
    assert.equal(out.reasonCode, "UNVERIFIED_GROUNDED_RESPONSE");
    assert.notEqual(out.answer, ANSWER);
    assert.equal(out.answer, insufficientEvidenceMessage("en"));
    assert.deepEqual(out.sourceIds, []);
  });

  it("citationVerification missing + citationsEnabled=true => refuse", () => {
    const out = evaluateCompliance(groundedInput({ citationVerification: undefined }));
    assert.equal(out.action, "refuse");
    assert.equal(out.reasonCode, "UNVERIFIED_GROUNDED_RESPONSE");
    assert.notEqual(out.answer, ANSWER);
    assert.equal(out.answer, insufficientEvidenceMessage("en"));
    assert.deepEqual(out.sourceIds, []);
  });

  it("citationVerification missing + citationsEnabled=false => refuse", () => {
    const out = evaluateCompliance(
      groundedInput({ citationsEnabled: false, citationVerification: undefined }),
    );
    assert.equal(out.action, "refuse");
    assert.equal(out.reasonCode, "UNVERIFIED_GROUNDED_RESPONSE");
    assert.notEqual(out.answer, ANSWER);
    assert.equal(out.answer, insufficientEvidenceMessage("en"));
    assert.deepEqual(out.sourceIds, []);
  });

  it("C: refuses when citation verification is absent", () => {
    const out = evaluateCompliance(groundedInput({ citationVerification: undefined }));
    assert.equal(out.action, "refuse");
    assert.equal(out.reasonCode, "UNVERIFIED_GROUNDED_RESPONSE");
    assert.equal(out.answer, insufficientEvidenceMessage("en"));
    assert.deepEqual(out.sourceIds, []);
  });

  it("D: refuses insufficient_evidence with the insufficient-evidence message", () => {
    const out = evaluateCompliance(
      groundedInput({ answerDecision: "insufficient_evidence", answer: "partial leak" }),
    );
    assert.equal(out.action, "refuse");
    assert.equal(out.reasonCode, "INSUFFICIENT_EVIDENCE");
    assert.equal(out.answer, insufficientEvidenceMessage("en"));
    assert.notEqual(out.answer, "partial leak");
    assert.deepEqual(out.sourceIds, []);
  });

  it("E: refuses unsupported with the deterministic unsupported reply", () => {
    const out = evaluateCompliance(
      groundedInput({ answerDecision: "unsupported", answer: "out of scope model text" }),
    );
    assert.equal(out.action, "refuse");
    assert.equal(out.reasonCode, "UNSUPPORTED_REQUEST");
    assert.equal(out.answer, unsupportedReplyFor("en"));
    assert.notEqual(out.answer, "out of scope model text");
    assert.deepEqual(out.sourceIds, []);
  });

  it("E: unsupported route takes precedence over a grounded answerDecision", () => {
    const out = evaluateCompliance(
      groundedInput({ route: "unsupported", answerDecision: "grounded_answer" }),
    );
    assert.equal(out.action, "refuse");
    assert.equal(out.reasonCode, "UNSUPPORTED_REQUEST");
    assert.deepEqual(out.sourceIds, []);
  });

  it("F: refuses unsafe with the deterministic unsafe reply", () => {
    const out = evaluateCompliance(
      groundedInput({ answerDecision: "unsafe", answer: "injected prompt" }),
    );
    assert.equal(out.action, "refuse");
    assert.equal(out.reasonCode, "UNSAFE_RESPONSE");
    assert.equal(out.answer, unsafeReplyFor("en"));
    assert.notEqual(out.answer, "injected prompt");
    assert.deepEqual(out.sourceIds, []);
  });

  it("F: unsafe route takes precedence over grounded answerDecision", () => {
    const out = evaluateCompliance(
      groundedInput({ route: "unsafe", answerDecision: "grounded_answer" }),
    );
    assert.equal(out.action, "refuse");
    assert.equal(out.reasonCode, "UNSAFE_RESPONSE");
    assert.deepEqual(out.sourceIds, []);
  });

  it("F: unsafe takes precedence over unsupported", () => {
    const out = evaluateCompliance(
      groundedInput({ route: "unsafe", answerDecision: "unsupported" }),
    );
    assert.equal(out.reasonCode, "UNSAFE_RESPONSE");
  });

  it("G: clarification preserves a supplied safe clarification answer", () => {
    const out = evaluateCompliance(
      groundedInput({ answerDecision: "clarification", answer: "What policy year?" }),
    );
    assert.equal(out.action, "clarify");
    assert.equal(out.reasonCode, "CLARIFICATION_REQUIRED");
    assert.equal(out.answer, "What policy year?");
    assert.deepEqual(out.sourceIds, []);
  });

  it("G: clarification falls back when the answer is empty", () => {
    const out = evaluateCompliance(
      groundedInput({ answerDecision: "clarification", answer: "" }),
    );
    assert.equal(out.action, "clarify");
    assert.equal(out.reasonCode, "CLARIFICATION_REQUIRED");
    assert.equal(out.answer, clarificationReplyFor("en"));
  });

  it("G: clarification route takes precedence over grounded answerDecision", () => {
    const out = evaluateCompliance(
      groundedInput({ route: "clarification", answerDecision: "grounded_answer" }),
    );
    assert.equal(out.action, "clarify");
    assert.equal(out.reasonCode, "CLARIFICATION_REQUIRED");
    assert.deepEqual(out.sourceIds, []);
  });

  describe("localization", () => {
    it("uses Arabic unsafe/unsupported/insufficient messages for ar", () => {
      assert.equal(unsafeReplyFor("ar"), "لا يمكن معالجة هذا الطلب لمخالفته لسياسات الأمان.");
      assert.equal(
        unsupportedReplyFor("ar"),
        "هذا السؤال خارج نطاق وثائق الشركة. يمكنني مساعدتك في الأسئلة المتعلقة بسياسات الشركة ووثائقها.",
      );
      assert.equal(insufficientEvidenceMessage("ar"), INSUFFICIENT_AUTHORIZED_EVIDENCE_AR);
    });

    it("Arabic applies to mixed language too", () => {
      assert.equal(unsafeReplyFor("mixed"), "لا يمكن معالجة هذا الطلب لمخالفته لسياسات الأمان.");
      assert.equal(
        unsupportedReplyFor("mixed"),
        "هذا السؤال خارج نطاق وثائق الشركة. يمكنني مساعدتك في الأسئلة المتعلقة بسياسات الشركة ووثائقها.",
      );
    });

    it("defaults to English for undefined/missing language", () => {
      assert.equal(unsafeReplyFor(), unsafeReplyFor("en"));
      assert.equal(unsupportedReplyFor(), unsupportedReplyFor("en"));
    });

    it("refuses unsafe in Arabic and releases nothing", () => {
      const out = evaluateCompliance(
        groundedInput({ answerDecision: "unsafe", language: "ar", answer: "prompt leak" }),
      );
      assert.equal(out.action, "refuse");
      assert.equal(out.reasonCode, "UNSAFE_RESPONSE");
      assert.equal(out.answer, unsafeReplyFor("ar"));
      assert.deepEqual(out.sourceIds, []);
    });
  });

  describe("fail-closed on malformed input", () => {
    it("extra unknown field is rejected by the input schema (strict)", () => {
      const bad = {
        ...groundedInput(),
        tenantPolicy: { something: true } as unknown,
      } as ComplianceAgentInput;
      assert.equal(ComplianceAgentInputSchema.safeParse(bad).success, false);
    });

    it("malformed input (unknown field) does not throw and refuses safely", () => {
      const bad = {
        route: "rag",
        answerDecision: "grounded_answer",
        answer: "x",
        tenantPolicy: { something: true },
      } as unknown as ComplianceAgentInput;
      assert.equal(ComplianceAgentInputSchema.safeParse(bad).success, false);
      const out = evaluateCompliance(bad);
      assert.equal(out.action, "refuse");
      assert.equal(out.reasonCode, "INSUFFICIENT_EVIDENCE");
      assert.equal(out.answer, insufficientEvidenceMessage("en"));
      assert.deepEqual(out.sourceIds, []);
    });

    it("a non-object input refuses instead of throwing", () => {
      const out = evaluateCompliance(null as unknown as ComplianceAgentInput);
      assert.equal(out.action, "refuse");
      assert.equal(out.reasonCode, "INSUFFICIENT_EVIDENCE");
      assert.deepEqual(out.sourceIds, []);
    });

    it("invalid answerDecision is refused", () => {
      const out = evaluateCompliance(
        groundedInput({ answerDecision: "made_up" as unknown as ComplianceAgentInput["answerDecision"] }),
      );
      assert.equal(out.action, "refuse");
      assert.equal(out.reasonCode, "INSUFFICIENT_EVIDENCE");
    });
  });

  describe("output round-trips through the strict schema", () => {
    it("every emitted output passes ComplianceAgentOutputSchema", () => {
      for (const input of [
        groundedInput(),
        groundedInput({ citationsEnabled: false }),
        groundedInput({
          citationVerification: {
            verified: false,
            validatedCitationIds: [],
            reasonCode: "MISSING_CITATIONS",
          },
        }),
        groundedInput({ answerDecision: "insufficient_evidence" }),
        groundedInput({ answerDecision: "unsupported" }),
        groundedInput({ answerDecision: "unsafe" }),
        groundedInput({ route: "unsafe" }),
        groundedInput({ route: "unsupported" }),
        groundedInput({ answerDecision: "clarification", answer: "more detail?" }),
        groundedInput({ route: "clarification" }),
      ]) {
        const out = evaluateCompliance(input);
        assert.equal(
          ComplianceAgentOutputSchema.safeParse(out).success,
          true,
          `output for ${input.answerDecision}/${input.route} did not round-trip: ${JSON.stringify(out)}`,
        );
      }
    });

    it("rejects an unknown reasonCode", () => {
      assert.equal(
        ComplianceAgentOutputSchema.safeParse({
          action: "release",
          answer: "ok",
          sourceIds: [],
          reasonCode: "NOT_A_CODE",
        }).success,
        false,
      );
    });

    it("rejects an unknown action", () => {
      assert.equal(
        ComplianceAgentOutputSchema.safeParse({
          action: "unsure",
          answer: "ok",
          sourceIds: [],
          reasonCode: "UNSAFE_RESPONSE",
        }).success,
        false,
      );
    });

    it("rejects an empty answer (answer is required)", () => {
      assert.equal(
        ComplianceAgentOutputSchema.safeParse({
          action: "release",
          answer: "",
          sourceIds: [],
          reasonCode: "COMPLIANT_GROUNDED_RESPONSE",
        }).success,
        false,
      );
    });
  });
});
