import type { ModelAdapter } from "../agents/agents.types.js";
import { AnswerWriterLLMAgent } from "./answerWriter.agent.js";
import { CitationVerificationLLMAgent } from "./citationVerification.agent.js";
import { ComplianceLLMAgent } from "./compliance.agent.js";
import {
  AnswerPipelineService,
  type AnswerPipelineServiceDeps,
} from "./answerPipeline.service.js";
import type {
  AnswerPipelineConfig,
  KnowledgeGapPort,
} from "./answerPipeline.types.js";

export interface CreateAnswerPipelineDeps {
  modelAdapter: ModelAdapter;
  knowledgeGapPort?: KnowledgeGapPort;
  config?: Partial<AnswerPipelineConfig>;
}

export function createAnswerPipeline(
  deps: CreateAnswerPipelineDeps,
): AnswerPipelineService {
  const serviceDeps: AnswerPipelineServiceDeps = {
    answerWriter: new AnswerWriterLLMAgent(deps.modelAdapter),
    citationVerification: new CitationVerificationLLMAgent(
      deps.modelAdapter,
    ),
    compliance: new ComplianceLLMAgent(deps.modelAdapter),
    knowledgeGapPort: deps.knowledgeGapPort,
    config: deps.config,
  };

  return new AnswerPipelineService(serviceDeps);
}
