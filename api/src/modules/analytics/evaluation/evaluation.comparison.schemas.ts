import { z } from "zod";
import { RagConfigurationIdentitySchema } from "./evaluation.configuration.js";
import { RagExperimentMetadataSchema } from "./evaluation.experiment.js";
import { RagRegressionPolicySchema } from "./evaluation.regressionPolicy.js";
import { RagEvaluationConfigurationSchema } from "./evaluation.schemas.js";

export const RAG_COMPARISON_REPORT_VERSION = "1.0.0" as const;
export const RAG_METRIC_SEMANTICS_VERSION = "1.1.0" as const;

const ComparisonId = z.string().trim().min(1).max(200);

export const RagMetricComparisonSchema = z
  .object({
    metric: ComparisonId,
    category: z.enum(["quality", "security", "operational"]),
    preference: z.enum(["higher", "lower"]),
    baseline: z.number().nullable(),
    candidate: z.number().nullable(),
    delta: z.number().nullable(),
    percentageDelta: z.number().nullable(),
    status: z.enum(["improved", "unchanged", "regressed", "unavailable"]),
  })
  .strict();
export type RagMetricComparison = z.infer<typeof RagMetricComparisonSchema>;

export const RagComparisonFindingSchema = z
  .object({
    code: ComparisonId,
    message: z.string().trim().min(1).max(2_000),
    metric: ComparisonId.optional(),
    caseId: ComparisonId.optional(),
    baseline: z.number().nullable().optional(),
    candidate: z.number().nullable().optional(),
    limit: z.number().nullable().optional(),
  })
  .strict();
export type RagComparisonFinding = z.infer<typeof RagComparisonFindingSchema>;

export const RagPerCaseComparisonSchema = z
  .object({
    evaluationCaseId: ComparisonId,
    status: z.enum(["improved", "unchanged", "regressed", "unavailable"]),
    baselinePassed: z.boolean(),
    candidatePassed: z.boolean(),
    baselineOutcomeCorrect: z.boolean(),
    candidateOutcomeCorrect: z.boolean(),
    metricComparisons: z.array(RagMetricComparisonSchema),
    reasons: z.array(ComparisonId),
  })
  .strict();
export type RagPerCaseComparison = z.infer<typeof RagPerCaseComparisonSchema>;

export const RagRegressionGateResultSchema = z
  .object({
    passed: z.boolean(),
    hardFailures: z.array(RagComparisonFindingSchema),
    qualityFailures: z.array(RagComparisonFindingSchema),
    operationalWarnings: z.array(RagComparisonFindingSchema),
    metricComparisons: z.array(RagMetricComparisonSchema),
    perCaseRegressions: z.array(ComparisonId),
  })
  .strict()
  .superRefine((gate, context) => {
    const expected = gate.hardFailures.length === 0 && gate.qualityFailures.length === 0;
    if (gate.passed !== expected) {
      context.addIssue({
        code: "custom",
        path: ["passed"],
        message: "Gate pass state must match hard and quality failures",
      });
    }
  });
export type RagRegressionGateResult = z.infer<
  typeof RagRegressionGateResultSchema
>;

const ExperimentEnvelopeSchema = z
  .object({
    experiment: RagExperimentMetadataSchema,
    configurationIdentity: RagConfigurationIdentitySchema,
    configuration: RagEvaluationConfigurationSchema,
  })
  .strict()
  .superRefine((envelope, context) => {
    if (
      envelope.experiment.configurationId !==
        envelope.configurationIdentity.configurationId ||
      envelope.experiment.configurationHash !==
        envelope.configurationIdentity.configurationHash
    ) {
      context.addIssue({
        code: "custom",
        path: ["experiment"],
        message: "Experiment configuration identity does not match its envelope",
      });
    }
  });

export const RagComparisonReportSchema = z
  .object({
    comparisonReportVersion: z.literal(RAG_COMPARISON_REPORT_VERSION),
    generatedAt: z.iso.datetime({ offset: true }),
    baseline: ExperimentEnvelopeSchema,
    candidate: ExperimentEnvelopeSchema,
    compatibility: z
      .object({
        reportVersion: ComparisonId,
        datasetVersion: ComparisonId,
        metricSemanticsVersion: ComparisonId,
        metricTopK: z.number().int().nonnegative().nullable(),
        evaluationCaseIds: z.array(ComparisonId),
      })
      .strict(),
    regressionPolicy: RagRegressionPolicySchema,
    aggregateDeltas: z.array(RagMetricComparisonSchema),
    securityFindings: z.array(RagComparisonFindingSchema),
    qualityFindings: z.array(RagComparisonFindingSchema),
    operationalFindings: z.array(RagComparisonFindingSchema),
    perCaseComparisons: z.array(RagPerCaseComparisonSchema),
    gate: RagRegressionGateResultSchema,
  })
  .strict()
  .superRefine((report, context) => {
    if (
      report.baseline.experiment.datasetVersion !==
        report.compatibility.datasetVersion ||
      report.candidate.experiment.datasetVersion !==
        report.compatibility.datasetVersion
    ) {
      context.addIssue({
        code: "custom",
        path: ["compatibility", "datasetVersion"],
        message: "Experiment dataset versions must match compatibility metadata",
      });
    }
  });
export type RagComparisonReport = z.infer<typeof RagComparisonReportSchema>;
