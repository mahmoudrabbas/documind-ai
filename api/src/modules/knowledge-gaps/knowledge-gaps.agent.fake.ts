import type { KnowledgeGapAgentPort, GapCandidateInput, GapAgentProposal } from "./knowledge-gaps.agent.js";
import type { GapSeverity } from "../../db/models/knowledgeGap.model.js";

export class FakeKnowledgeGapAgent implements KnowledgeGapAgentPort {
  async proposeGapAnalysis(input: GapCandidateInput): Promise<GapAgentProposal> {
    const questionLower = input.question.toLowerCase();

    let severity: GapSeverity = "medium";
    if (input.category === "harmful" || questionLower.includes("password") || questionLower.includes("security") || input.outcome === "conflict") {
      severity = "critical";
    } else if (
      input.category === "inaccurate" ||
      input.category === "incomplete" ||
      input.outcome === "refused" ||
      questionLower.includes("urgent") ||
      questionLower.includes("critical")
    ) {
      severity = "high";
    } else if (input.outcome === "negative_feedback") {
      severity = input.category === "irrelevant" ? "low" : "medium";
    } else {
      severity = "low";
    }

    let requiredDocumentType = "Policy / Procedure Document";
    if (questionLower.includes("api") || questionLower.includes("integration") || questionLower.includes("code")) {
      requiredDocumentType = "Technical Documentation / API Reference";
    } else if (questionLower.includes("price") || questionLower.includes("billing") || questionLower.includes("invoice")) {
      requiredDocumentType = "Billing & Pricing Guide";
    } else if (questionLower.includes("hr") || questionLower.includes("leave") || questionLower.includes("vacation")) {
      requiredDocumentType = "HR Policy Handbook";
    }

    // Clean question to form a clear topic title
    const topic = input.question
      .trim()
      .replace(/\?+$/, "")
      .replace(/^(how to|what is|where is|can i|how do i)\s+/i, "")
      .replace(/^./, (c) => c.toUpperCase());

    // Dynamic confidence score calculation based on signal strength & category
    let baseConfidence = input.confidence && input.confidence > 0 ? input.confidence : 0.8;
    if (input.category === "harmful" || input.outcome === "conflict") {
      baseConfidence = Math.max(baseConfidence, 0.95);
    } else if (input.category === "inaccurate") {
      baseConfidence = Math.max(baseConfidence, 0.90);
    } else if (input.category === "incomplete") {
      baseConfidence = Math.max(baseConfidence, 0.85);
    } else if (input.outcome === "refused") {
      baseConfidence = Math.max(baseConfidence, 0.88);
    } else if (input.category === "irrelevant") {
      baseConfidence = Math.min(baseConfidence, 0.75);
    }

    const confidence = Math.round(Math.min(Math.max(baseConfidence, 0.5), 0.98) * 100) / 100;

    const categoryText = input.category ? ` (${input.category.replace(/_/g, " ")})` : "";

    return {
      topic: topic || "Unanswered Query",
      severity,
      department: input.actorDepartment || "General",
      suggestedAction: `Add authoritative document answering: "${input.question}"`,
      requiredDocumentType,
      duplicateGapId: null,
      confidence,
      reasoning: `AI proposal generated for ${input.outcome.replace(/_/g, " ")}${categoryText}.`,
    };
  }
}
