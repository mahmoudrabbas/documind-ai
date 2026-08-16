import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isReportableKnowledgeGap,
  resolveChatOutcome,
} from "./chatWorkflowService.js";

describe("chat outcome mapping", () => {
  test("answered for successful grounded terminals", () => {
    assert.equal(
      resolveChatOutcome("COMPLIANT_GROUNDED_RESPONSE", {
        authorizationRestricted: false,
        evidenceSufficiency: "SUFFICIENT",
        evidenceReasonCode: "EVIDENCE_SUFFICIENT",
      }),
      "answered",
    );
  });

  test("authorization_restricted when access, not content, was missing", () => {
    assert.equal(
      resolveChatOutcome("INSUFFICIENT_EVIDENCE", {
        authorizationRestricted: true,
        evidenceSufficiency: "NO_EVIDENCE",
        evidenceReasonCode: "NO_EVIDENCE",
      }),
      "authorization_restricted",
    );
  });

  test("no_relevant_content for genuine knowledge gaps", () => {
    assert.equal(
      resolveChatOutcome("INSUFFICIENT_EVIDENCE", {
        authorizationRestricted: false,
        evidenceSufficiency: "NO_EVIDENCE",
        evidenceReasonCode: "NO_EVIDENCE",
      }),
      "no_relevant_content",
    );
  });

  test("evidence_conflict for conflicting evidence refusals", () => {
    assert.equal(
      resolveChatOutcome("INSUFFICIENT_EVIDENCE", {
        authorizationRestricted: false,
        evidenceSufficiency: "CONFLICTING",
        evidenceReasonCode: "EVIDENCE_CONFLICTING",
      }),
      "evidence_conflict",
    );
  });

  test("verification_failed for unverified grounded responses", () => {
    assert.equal(
      resolveChatOutcome("UNVERIFIED_GROUNDED_RESPONSE", {
        authorizationRestricted: false,
        evidenceSufficiency: "SUFFICIENT",
        evidenceReasonCode: "EVIDENCE_SUFFICIENT",
      }),
      "verification_failed",
    );
  });

  test("unsupported for out-of-domain requests", () => {
    assert.equal(
      resolveChatOutcome("UNSUPPORTED_REQUEST", {
        authorizationRestricted: false,
        evidenceSufficiency: null,
        evidenceReasonCode: null,
      }),
      "unsupported",
    );
  });
});

describe("knowledge-gap reportability", () => {
  test("only genuine no-content outcomes are reportable gaps", () => {
    assert.equal(
      isReportableKnowledgeGap(
        resolveChatOutcome("INSUFFICIENT_EVIDENCE", {
          authorizationRestricted: false,
          evidenceSufficiency: "NO_EVIDENCE",
          evidenceReasonCode: "NO_EVIDENCE",
        }),
      ),
      true,
    );
    for (const outcome of [
      "answered",
      "authorization_restricted",
      "evidence_conflict",
      "verification_failed",
      "unsupported",
    ] as const) {
      assert.equal(
        isReportableKnowledgeGap(outcome),
        false,
        `${outcome} must never create a knowledge gap`,
      );
    }
  });
});
