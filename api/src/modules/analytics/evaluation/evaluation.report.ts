import { aggregateRagEvaluationResults } from "./evaluation.aggregate.js";
import {
  RAG_EVALUATION_REPORT_VERSION,
  RagEvaluationReportSchema,
  type RagEvaluationConfiguration,
  type RagEvaluationReport,
  type RagEvaluationResult,
} from "./evaluation.schemas.js";

export interface CreateRagEvaluationReportInput {
  datasetVersion: string;
  configuration: RagEvaluationConfiguration;
  results: readonly RagEvaluationResult[];
  generatedAt?: Date;
}

/** Builds and validates the stable JSON contract; it performs no persistence. */
export function createRagEvaluationReport(
  input: CreateRagEvaluationReportInput,
): RagEvaluationReport {
  return RagEvaluationReportSchema.parse({
    reportVersion: RAG_EVALUATION_REPORT_VERSION,
    datasetVersion: input.datasetVersion,
    generatedAt: (input.generatedAt ?? new Date()).toISOString(),
    configuration: input.configuration,
    aggregateMetrics: aggregateRagEvaluationResults(input.results),
    results: input.results,
  });
}
