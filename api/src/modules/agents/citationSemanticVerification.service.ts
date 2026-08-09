import { z } from "zod";
import type { ModelAdapter } from "./agents.types.js";

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
  readonly evidence: readonly CitationSemanticEvidence[];
}

export interface CitationSemanticVerificationResult {
  readonly claims: readonly string[];
  readonly unsupportedClaims: readonly string[];
  readonly providerKey?: string;
  readonly modelName?: string;
  readonly totalTokens?: number;
  readonly estimatedCost?: number;
  readonly latencyMs?: number;
}

export interface CitationSemanticVerifier {
  verify(input: CitationSemanticVerificationInput): Promise<CitationSemanticVerificationResult>;
}

const NUMBER_WORDS: Readonly<Record<string, number>> = {
  zero: 0,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  eleven: 11,
  twelve: 12,
  thirteen: 13,
  fourteen: 14,
  fifteen: 15,
  sixteen: 16,
  seventeen: 17,
  eighteen: 18,
  nineteen: 19,
  twenty: 20,
  thirty: 30,
  forty: 40,
  fifty: 50,
  sixty: 60,
  seventy: 70,
  eighty: 80,
  ninety: 90,
};

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

function numericValues(text: string): Set<number> {
  const values = new Set<number>();
  for (const match of text.matchAll(/\b\d+(?:\.\d+)?\b/gu)) {
    values.add(Number(match[0]));
  }

  const words = text.toLowerCase().match(/[a-z]+/gu) ?? [];
  for (let index = 0; index < words.length; index += 1) {
    const current = NUMBER_WORDS[words[index]];
    if (current === undefined) continue;
    const next = NUMBER_WORDS[words[index + 1]];
    if (current >= 20 && current % 10 === 0 && next !== undefined && next > 0 && next < 10) {
      values.add(current + next);
      index += 1;
    } else {
      values.add(current);
    }
  }
  return values;
}

function hasNumericContradiction(claim: string, evidenceText: string): boolean {
  const claimValues = numericValues(claim);
  if (claimValues.size === 0) return false;
  const evidenceValues = numericValues(evidenceText);
  // If numeric meaning is expressed in a language/form this deterministic
  // parser does not cover, defer to the semantic judge instead of inventing a
  // contradiction.
  if (evidenceValues.size === 0) return false;
  return [...claimValues].some((value) => !evidenceValues.has(value));
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
    if (claims.length === 0) return { claims, unsupportedClaims: [] };

    const evidence = boundedEvidence(input.evidence);
    const evidenceText = evidence.map((item) => item.text).join("\n");
    const deterministicContradictions = new Set(
      claims
        .map((claim, index) => hasNumericContradiction(claim, evidenceText) ? index : -1)
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
              "Return JSON only: {\"judgments\":[{\"claimIndex\":0,\"verdict\":\"supported|unsupported|contradicted|not_factual\"}]}. " +
              "Return exactly one judgment for every claim index and do not use outside knowledge.",
          },
          {
            role: "user",
            content: JSON.stringify({ claims, evidence }),
          },
        ],
        temperature: 0,
        maxTokens: 1_200,
        structuredOutput: { type: "json_object" },
      });
      const raw = response.choices[0]?.message.content ?? "";
      const parsed = SemanticJudgmentsSchema.parse(JSON.parse(raw));
      const byIndex = new Map(parsed.judgments.map((item) => [item.claimIndex, item.verdict]));
      const complete = byIndex.size === claims.length && claims.every((_claim, index) => byIndex.has(index));
      const unsupportedClaims = complete
        ? claims.filter((_claim, index) =>
            deterministicContradictions.has(index) ||
            !["supported", "not_factual"].includes(byIndex.get(index) ?? "unsupported"),
          )
        : claims;

      return {
        claims,
        unsupportedClaims,
        providerKey: this.model.providerKey,
        modelName: response.model || this.model.providerKey,
        totalTokens: response.usage.totalTokens,
        estimatedCost: response.estimatedCost,
        latencyMs: response.latencyMs,
      };
    } catch {
      return { claims, unsupportedClaims: claims };
    }
  }
}
