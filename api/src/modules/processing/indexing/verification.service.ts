import type { VectorIndex } from "../../../providers/vector-index/vectorIndex.port.js";
import type { KeywordIndex } from "../../../providers/keyword-index/keywordIndex.port.js";
import {
  verifyGeneration,
  activateGeneration,
} from "./generation.service.js";

export interface VerificationRunInput {
  tenantId: string;
  generationId: string;
  vectorIndex: VectorIndex;
  keywordIndex: KeywordIndex;
}

export interface VerificationRunResult {
  success: boolean;
  countsVerified: boolean;
  atlasVectorReady: boolean;
  atlasKeywordReady: boolean;
  error?: string;
}

export async function runVerification(
  input: VerificationRunInput,
): Promise<VerificationRunResult> {
  const { tenantId, generationId, vectorIndex, keywordIndex } = input;

  const countResult = await verifyGeneration(tenantId, generationId);

  const vectorStatus = await vectorIndex.getIndexStatus();
  const keywordStatus = await keywordIndex.getIndexStatus();

  if (countResult.verified && vectorStatus.status === "READY" && keywordStatus.status === "READY") {
    await activateGeneration(tenantId, generationId);
    return {
      success: true,
      countsVerified: true,
      atlasVectorReady: true,
      atlasKeywordReady: true,
    };
  }

  const issues: string[] = [];
  if (!countResult.verified) issues.push("Count mismatch");
  if (vectorStatus.status !== "READY") issues.push(`Vector index: ${vectorStatus.status}`);
  if (keywordStatus.status !== "READY") issues.push(`Keyword index: ${keywordStatus.status}`);

  return {
    success: false,
    countsVerified: countResult.verified,
    atlasVectorReady: vectorStatus.status === "READY",
    atlasKeywordReady: keywordStatus.status === "READY",
    error: issues.join("; "),
  };
}
