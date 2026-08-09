import { z } from "zod";
import type { ModelAdapter } from "./agents.types.js";
import {
  formatThresholdComparisons,
  hasNumericConsistencyViolation,
} from "./thresholdSemantics.js";

const MAX_CLAIMS = 20;
const MAX_CLAIM_LENGTH = 500;
const MAX_EVIDENCE_CHARS = 30_000;
const MAX_CHUNK_CHARS = 4_000;

const SemanticJudgmentsSchema = z
  .object({
    judgments: z
      .array(
        z
          .object({
            claimIndex: z.number().int().min(0).max(MAX_CLAIMS - 1),
            verdict: z.enum(["supported", "unsupported", "contradicted", "not_factual"]),
            supportingChunkIds: z
              .array(z.string().trim().min(1).max(100))
              .max(50),
          })
          .strict(),
      )
      .max(MAX_CLAIMS),
  })
  .strict();

export interface CitationSemanticEvidence {
  readonly chunkId: string;
  readonly text: string;
}

export interface CitationSemanticVerificationInput {
  readonly answerText: string;
  readonly questionText?: string;
  readonly evidence: readonly CitationSemanticEvidence[];
}

export interface CitationSemanticVerificationResult {
  readonly claims: readonly string[];
  readonly unsupportedClaims: readonly string[];
  readonly supportingEvidenceIds: readonly string[];
  readonly providerKey?: string;
  readonly modelName?: string;
  readonly totalTokens?: number;
  readonly estimatedCost?: number;
  readonly latencyMs?: number;
}

export interface CitationSemanticVerifier {
  verify(input: CitationSemanticVerificationInput): Promise<CitationSemanticVerificationResult>;
}

export function extractBoundedFactualClaims(answerText: string): string[] {
  return answerText
    .split(/(?:\r?\n)+|(?<=[.!?؟؛])\s+/u)
    .map((part) =>
      part
        .replace(/^\s*(?:[-*•]|\d+[.)])\s*/u, "")
        .replace(/\[[^\]\n]{1,160}\]/gu, "")
        .trim(),
    )
    .filter((claim) => claim.length > 0)
    .slice(0, MAX_CLAIMS)
    .map((claim) => claim.slice(0, MAX_CLAIM_LENGTH));
}

function boundedEvidence(evidence: readonly CitationSemanticEvidence[]): CitationSemanticEvidence[] {
  const result: CitationSemanticEvidence[] = [];
  let remaining = MAX_EVIDENCE_CHARS;
  for (const item of evidence.slice(0, 50)) {
    if (remaining <= 0) break;
    const text = item.text.slice(0, Math.min(MAX_CHUNK_CHARS, remaining));
    remaining -= text.length;
    result.push({ chunkId: item.chunkId, text });
  }
  return result;
}

/**
 * Provider-neutral semantic entailment pass. Claims are extracted and bounded
 * server-side; the model only labels those fixed claims against already
 * authorized cited evidence. Malformed, incomplete, or failed judgments mark
 * every claim unsupported so grounded output fails closed.
 */
export class CitationSemanticVerificationService implements CitationSemanticVerifier {
  constructor(private readonly model: ModelAdapter) {}

  async verify(input: CitationSemanticVerificationInput): Promise<CitationSemanticVerificationResult> {
    const claims = extractBoundedFactualClaims(input.answerText);
    if (claims.length === 0) {
      return { claims, unsupportedClaims: [], supportingEvidenceIds: [] };
    }

    const evidence = boundedEvidence(input.evidence);
    const evidenceText = evidence.map((item) => item.text).join("\n");
    const thresholdComparisons = formatThresholdComparisons(
      input.questionText ?? "",
      evidence,
    );
    const deterministicContradictions = new Set(
      claims
        .map((claim, index) => hasNumericConsistencyViolation({
          claimText: claim,
          evidenceText,
          questionText: input.questionText,
        }) ? index : -1)
        .filter((index) => index >= 0),
    );

    try {
      const response = await this.model.complete({
        messages: [
          {
            role: "system",
            content:
              "Judge whether each supplied factual claim is entailed by the supplied approved evidence only. " +
              "Use supported only when the evidence establishes the claim, contradicted when it conflicts, unsupported when absent or merely related, and not_factual only for headings, framing, or courtesy with no factual assertion. " +
              "A bounded threshold comparison is supported only when the threshold rule is explicit in evidence, the compared value is in currentQuestion, units match, and the stated result follows from the operator. Fixed numeric facts are not threshold rules. " +
              "A comparison whose structured satisfied value is false is still a valid derivation and supports a correctly stated negative conclusion. " +
              "For every supported claim, supportingChunkIds must be the smallest sufficient set of supplied chunk IDs supporting the whole claim; omit merely related, duplicate, or partial chunks when another chunk supports the whole claim. A claim may list multiple chunks only when their combined evidence is required. For every other verdict, supportingChunkIds must be empty. " +
              "Return JSON only: {\"judgments\":[{\"claimIndex\":0,\"verdict\":\"supported|unsupported|contradicted|not_factual\",\"supportingChunkIds\":[\"supplied-chunk-id\"]}]}. " +
              "Return exactly one judgment for every claim index and do not use outside knowledge.",
          },
          {
            role: "user",
            content: JSON.stringify({
              claims,
              evidence,
              currentQuestion: input.questionText ?? "",
              thresholdComparisons: thresholdComparisons
                ? JSON.parse(thresholdComparisons)
                : [],
            }),
          },
        ],
        temperature: 0,
        maxTokens: 1_200,
        structuredOutput: { type: "json_object" },
      });
      const raw = response.choices[0]?.message.content ?? "";
      const parsed = SemanticJudgmentsSchema.parse(JSON.parse(raw));
      const byIndex = new Map(parsed.judgments.map((item) => [item.claimIndex, item.verdict]));
      const evidenceIds = new Set(evidence.map((item) => item.chunkId));
      const complete =
        parsed.judgments.length === claims.length &&
        byIndex.size === claims.length &&
        claims.every((_claim, index) => byIndex.has(index));
      const mappingsValid = complete && parsed.judgments.every((judgment) =>
        judgment.verdict === "supported"
          ? judgment.supportingChunkIds.length > 0 &&
            judgment.supportingChunkIds.every((id) => evidenceIds.has(id))
          : judgment.supportingChunkIds.length === 0,
      );
      const unsupportedIndices = new Set(
        claims.flatMap((_claim, index) =>
          !complete ||
          deterministicContradictions.has(index) ||
          !mappingsValid ||
          !["supported", "not_factual"].includes(byIndex.get(index) ?? "unsupported")
            ? [index]
            : [],
        ),
      );
      const unsupportedClaims = claims.filter((_claim, index) =>
        unsupportedIndices.has(index),
      );
      const supportingEvidenceIds = mappingsValid
        ? [...new Set(parsed.judgments.flatMap((judgment) =>
            judgment.verdict === "supported" && !unsupportedIndices.has(judgment.claimIndex)
              ? judgment.supportingChunkIds
              : [],
          ))]
        : [];

      return {
        claims,
        unsupportedClaims,
        supportingEvidenceIds,
        providerKey: this.model.providerKey,
        modelName: response.model || this.model.providerKey,
        totalTokens: response.usage.totalTokens,
        estimatedCost: response.estimatedCost,
        latencyMs: response.latencyMs,
      };
    } catch {
      return { claims, unsupportedClaims: claims, supportingEvidenceIds: [] };
    }
  }
}
