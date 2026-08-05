import { getModelAdapter } from "../../providers/llm/index.js";
import { DocumentAccessAuthorizationService } from "../document-access/documentAccess.authorization.service.js";
import { DefaultJudgeEvidenceLoader } from "./judgeEvidence.js";
import { JudgeEvaluationService } from "./judgeEvaluation.service.js";
import { LlmJudgeService } from "./llmJudge.service.js";

let singleton: JudgeEvaluationService | null = null;

/**
 * Lazy singleton so the model adapter is only resolved when the judge flow is
 * actually wired (the server entry point), never at import time.
 */
export function getJudgeEvaluationService(): JudgeEvaluationService {
  if (singleton) return singleton;
  const judge = new LlmJudgeService({ modelAdapter: getModelAdapter() });
  const evidenceLoader = new DefaultJudgeEvidenceLoader({
    documentAuthorization: new DocumentAccessAuthorizationService(),
  });
  singleton = new JudgeEvaluationService({ judge, evidenceLoader });
  return singleton;
}

export function setJudgeEvaluationService(service: JudgeEvaluationService | null): void {
  singleton = service;
}
