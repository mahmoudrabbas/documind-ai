import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FakeKnowledgeGapAgent } from "../knowledge-gaps.agent.fake.js";

describe("FakeKnowledgeGapAgent", () => {
  const agent = new FakeKnowledgeGapAgent();

  it("proposes gap analysis with topic, severity and suggested action", async () => {
    const proposal = await agent.proposeGapAnalysis({
      question: "How do I request remote work approval?",
      outcome: "refused",
      confidence: 0.9,
    });

    assert.ok(proposal.topic);
    assert.equal(proposal.severity, "high");
    assert.ok(proposal.suggestedAction?.includes("How do I request remote work approval"));
    assert.ok(proposal.confidence > 0);
  });

  it("assigns critical severity to security/password related questions", async () => {
    const proposal = await agent.proposeGapAnalysis({
      question: "What is the security policy for password rotation?",
      outcome: "weak",
      confidence: 0.5,
    });

    assert.equal(proposal.severity, "critical");
    assert.equal(proposal.requiredDocumentType, "Policy / Procedure Document");
  });
});
