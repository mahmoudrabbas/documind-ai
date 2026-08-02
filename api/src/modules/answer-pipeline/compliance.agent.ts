import type { ModelAdapter } from "../agents/agents.types.js";
import { logger } from "../../common/logger/logger.js";
import type { ComplianceResult, ComplianceInput, ComplianceAgent } from "./answerPipeline.types.js";
import { parseComplianceResult } from "./answerPipeline.schemas.js";
import {
  COMPLIANCE_SYSTEM_PROMPT,
  COMPLIANCE_PROMPT_VERSION,
  buildComplianceUserPrompt,
} from "./prompts/compliance.prompt.js";

const INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+(instructions?|rules?|prompts?)/i,
  /you\s+are\s+now\s+/i,
  /system\s*:\s*/i,
  /new\s+instructions?\s*:/i,
  /disregard\s+(all\s+)?(previous|prior|above)/i,
  /override\s+(your\s+)?(rules?|instructions?|programming)/i,
  /act\s+as\s+(if\s+)?(you\s+)?(have\s+)?no\s+(restrictions?|rules?|limits?)/i,
  /forget\s+(your|all)\s+(instructions?|rules?|previous)/i,
  /\[INST\]/i,
  /\[\/INST\]/i,
  /<\|im_start\|>/i,
  /<\|im_end\|>/i,
  /Human:\s*/i,
  /Assistant:\s*/i,
  /\bDAN\b.*\bmode\b/i,
  /do\s+anything\s+now/i,
  /jailbreak\s+mode/i,
];

export class ComplianceLLMAgent implements ComplianceAgent {
  readonly promptVersion = COMPLIANCE_PROMPT_VERSION;

  constructor(private readonly model: ModelAdapter) {}

  async execute(input: ComplianceInput): Promise<ComplianceResult> {
    const start = Date.now();

    const verificationSummary = input.verificationResult.claims
      .map(
        (vc) =>
          `[${vc.claimId}] status=${vc.status}${vc.reason ? ` reason=${vc.reason}` : ""}`,
      )
      .join("\n");

    const evidenceSummary = input.evidenceBundle.items
      .map(
        (item, i) =>
          `[E${i}] chunkId=${item.citationAnchor.chunkId} documentId=${item.citationAnchor.documentId} page=${item.citationAnchor.pageNumber ?? "N/A"} section=${item.citationAnchor.sectionTitle ?? "N/A"}`,
      )
      .join("\n");

    const userPrompt = buildComplianceUserPrompt(
      input.draftAnswer.answerText,
      verificationSummary || "No claims to verify.",
      evidenceSummary || "No evidence provided.",
      input.userQuestion,
      input.language,
    );

    let llmResult: ComplianceResult;
    try {
      const response = await this.model.complete({
        messages: [
          { role: "system", content: COMPLIANCE_SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        temperature: 0,
        maxTokens: 1000,
      });

      const content = response.choices[0]?.message?.content ?? "";
      llmResult = parseComplianceResult(content);
      llmResult.tokenUsage = { totalTokens: response.usage.totalTokens };

      logger.info(
        {
          authorized: llmResult.authorized,
          promptInjectionDetected: llmResult.promptInjectionDetected,
          unsupportedClaims: llmResult.unsupportedClaims,
          refusalRequired: llmResult.refusalRequired,
          flagsCount: llmResult.flags.length,
          latencyMs: Date.now() - start,
          tokensUsed: response.usage.totalTokens,
        },
        "Compliance agent completed",
      );
    } catch (err) {
      logger.warn(
        { err, latencyMs: Date.now() - start },
        "Compliance agent LLM call failed, using deterministic fallback",
      );
      llmResult = this.deterministicFallback(input);
    }

    // Always run deterministic injection scan as defense-in-depth
    const injectionFlags = this.scanForInjection(
      input.draftAnswer.answerText,
      input.evidenceBundle,
    );

    if (injectionFlags.length > 0) {
      llmResult.promptInjectionDetected = true;
      llmResult.refusalRequired = true;
      llmResult.refusalReason = "prompt_injection_detected";
      llmResult.flags = [...new Set([...llmResult.flags, ...injectionFlags])];
    }

    // Check unsupported claims from verification
    if (input.verificationResult.unsupportedCount > 0) {
      llmResult.unsupportedClaims = true;
      if (!llmResult.flags.includes("unsupported_claim_present")) {
        llmResult.flags.push("unsupported_claim_present");
      }
    }

    return llmResult;
  }

  private deterministicFallback(input: ComplianceInput): ComplianceResult {
    const hasUnsupported =
      input.verificationResult.unsupportedCount > 0;
    const hasConflicts =
      input.evidenceBundle.conflictGroups.length > 0;
    const languageMismatch =
      input.language !== "en" &&
      input.language !== "ar" &&
      input.language !== "mixed";

    return {
      authorized: true,
      promptInjectionDetected: false,
      unsupportedClaims: hasUnsupported,
      unsafeDisclosure: false,
      conflictingEvidenceHandled: hasConflicts
        ? input.draftAnswer.uncertainty !== null
        : true,
      languageCompliant: !languageMismatch,
      refusalRequired: hasUnsupported,
      refusalReason: hasUnsupported
        ? "unsupported_claims_detected"
        : null,
      flags: hasUnsupported ? ["unsupported_claim_present"] : [],
      tokenUsage: { totalTokens: 0 },
    };
  }

  private scanForInjection(
    answerText: string,
    evidenceBundle: { items: Array<{ textExcerpt: string }> },
  ): string[] {
    const flags: string[] = [];
    const combinedText =
      answerText +
      evidenceBundle.items.map((i) => i.textExcerpt).join("\n");

    for (const pattern of INJECTION_PATTERNS) {
      if (pattern.test(combinedText)) {
        flags.push("injection_pattern_detected");
        break;
      }
    }

    return flags;
  }
}
