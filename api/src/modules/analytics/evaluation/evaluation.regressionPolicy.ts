import { z } from "zod";

export const RAG_REGRESSION_POLICY_VERSION = "1.1.0" as const;

const Rate = z.number().min(0).max(1);
const Percentage = z.number().nonnegative();

export const RagRegressionPolicySchema = z
  .object({
    policyVersion: z.literal(RAG_REGRESSION_POLICY_VERSION),
    name: z.string().trim().min(1).max(200),
    hardSecurity: z
      .object({
        authorizationViolationsMustBeZero: z.boolean(),
        authorizationInvariantMustPass: z.boolean(),
        finalSourceAuthorizationMustPass: z.boolean(),
      })
      .strict(),
    hardCorrectness: z
      .object({
        forbidCasePassRegression: z.boolean(),
        forbidOutcomeCorrectnessRegression: z.boolean(),
        forbidGroundednessRegression: z.boolean(),
        forbidUnsupportedContentRelease: z.boolean(),
      })
      .strict(),
    qualityFloors: z
      .object({
        casePassRate: Rate.optional(),
        retrievalRecall: Rate.optional(),
        groundedAnswerRate: Rate.optional(),
        claimSupportRate: Rate.optional(),
        answerRelevance: Rate.optional(),
        correctAnswerRate: Rate.optional(),
      })
      .strict(),
    allowedRegressions: z
      .object({
        casePassRate: Rate,
        precisionAtK: Rate,
        recallAtK: Rate,
        mrr: Rate,
        groundedAnswerRate: Rate,
        claimSupportRate: Rate,
        answerRelevance: Rate,
        releaseRefusalCorrectness: Rate,
        correctAnswerRate: Rate,
        correctnessEvaluatedCoverage: Rate,
      })
      .strict(),
    availability: z.object({
      requireCandidateCaseExecution: z.boolean(),
      requireGroundednessWhenBaselineAvailable: z.boolean(),
      requireAnswerRelevanceWhenBaselineAvailable: z.boolean(),
      requireRetrievalWhenBaselineAvailable: z.boolean(),
      minimumEvaluationCoverage: Rate,
      requireCorrectnessAvailabilityPreserved: z.boolean(),
      minimumCorrectnessEvaluatedCoverage: Rate,
    }).strict(),
    operational: z
      .object({
        maximumLatencyIncreasePercent: Percentage.optional(),
        maximumTokenIncreasePercent: Percentage.optional(),
        maximumCostIncreasePercent: Percentage.optional(),
        enforcement: z.enum(["warn", "fail"]),
      })
      .strict(),
  })
  .strict();
export type RagRegressionPolicy = z.infer<typeof RagRegressionPolicySchema>;

/**
 * Conservative CI-ready defaults. Security and correctness are fail-closed;
 * quality cannot regress; operational drift is visible but non-blocking.
 * Teams can supply a reviewed JSON policy without changing comparison code.
 */
export const DEFAULT_RAG_REGRESSION_POLICY: RagRegressionPolicy =
  RagRegressionPolicySchema.parse({
    policyVersion: RAG_REGRESSION_POLICY_VERSION,
    name: "documind-rag-default",
    hardSecurity: {
      authorizationViolationsMustBeZero: true,
      authorizationInvariantMustPass: true,
      finalSourceAuthorizationMustPass: true,
    },
    hardCorrectness: {
      forbidCasePassRegression: true,
      forbidOutcomeCorrectnessRegression: true,
      forbidGroundednessRegression: true,
      forbidUnsupportedContentRelease: true,
    },
    qualityFloors: {},
    allowedRegressions: {
      casePassRate: 0,
      precisionAtK: 0,
      recallAtK: 0,
      mrr: 0,
      groundedAnswerRate: 0,
      claimSupportRate: 0,
      answerRelevance: 0,
      releaseRefusalCorrectness: 0,
      correctAnswerRate: 0,
      correctnessEvaluatedCoverage: 0,
    },
    availability: {
      requireCandidateCaseExecution: true,
      requireGroundednessWhenBaselineAvailable: true,
      requireAnswerRelevanceWhenBaselineAvailable: true,
      requireRetrievalWhenBaselineAvailable: true,
      minimumEvaluationCoverage: 1,
      requireCorrectnessAvailabilityPreserved: true,
      minimumCorrectnessEvaluatedCoverage: 1,
    },
    operational: {
      maximumLatencyIncreasePercent: 25,
      maximumTokenIncreasePercent: 20,
      maximumCostIncreasePercent: 20,
      enforcement: "warn",
    },
  });
