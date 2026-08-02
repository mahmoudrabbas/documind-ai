import { logger } from "../../common/logger/logger.js";
import { getAuditWriter } from "../../common/observability/index.js";
import { getPipelineMetrics } from "./answerPipeline.metrics.js";
import type {
  AnswerPipelineInput,
  AnswerPipelineOutput,
  AnswerPipelineConfig,
  AnswerWriterAgent,
  CitationVerificationAgent,
  ComplianceAgent,
  KnowledgeGapPort,
  KnowledgeGapCandidate,
  GapOutcome,
} from "./answerPipeline.types.js";
import { DEFAULT_ANSWER_PIPELINE_CONFIG } from "./answerPipeline.types.js";
import { Finalizer } from "./finalizer.js";

export interface AnswerPipelineServiceDeps {
  answerWriter: AnswerWriterAgent;
  citationVerification: CitationVerificationAgent;
  compliance: ComplianceAgent;
  knowledgeGapPort?: KnowledgeGapPort;
  config?: Partial<AnswerPipelineConfig>;
}

const ESTIMATED_COST_PER_TOKEN = 0.000003;

function estimateCost(totalTokens: number): number {
  return Number((totalTokens * ESTIMATED_COST_PER_TOKEN).toFixed(6));
}

export class AnswerPipelineService {
  private readonly answerWriter: AnswerWriterAgent;
  private readonly citationVerification: CitationVerificationAgent;
  private readonly compliance: ComplianceAgent;
  private readonly knowledgeGapPort?: KnowledgeGapPort;
  private readonly config: AnswerPipelineConfig;
  private readonly finalizer: Finalizer;

  constructor(deps: AnswerPipelineServiceDeps) {
    this.answerWriter = deps.answerWriter;
    this.citationVerification = deps.citationVerification;
    this.compliance = deps.compliance;
    this.knowledgeGapPort = deps.knowledgeGapPort;
    this.config = { ...DEFAULT_ANSWER_PIPELINE_CONFIG, ...deps.config };
    this.finalizer = new Finalizer();
  }

  async process(
    input: AnswerPipelineInput,
  ): Promise<AnswerPipelineOutput> {
    const pipelineStart = Date.now();
    let retriesUsed = 0;
    let totalTokensUsed = 0;
    let estimatedCost = 0;

    // Step 1: Answer Writer
    const draftAnswer = await this.answerWriter.execute({
      evidenceBundle: input.evidenceBundle,
      question: input.question,
      language: input.language,
      conversationContext: input.conversationContext,
      maxClaims: 10,
    });
    totalTokensUsed += draftAnswer.tokenUsage.totalTokens;
    estimatedCost = estimateCost(totalTokensUsed);

    // Step 2: Citation Verification
    const verificationResult = await this.citationVerification.execute({
      draftAnswer,
      evidenceBundle: input.evidenceBundle,
    });
    totalTokensUsed += verificationResult.tokenUsage.totalTokens;
    estimatedCost = estimateCost(totalTokensUsed);

    // Step 3: Compliance
    const complianceResult = await this.compliance.execute({
      draftAnswer,
      verificationResult,
      evidenceBundle: input.evidenceBundle,
      userQuestion: input.question,
      language: input.language,
      tenantId: input.tenantId,
      actorId: input.actorId,
    });
    totalTokensUsed += complianceResult.tokenUsage.totalTokens;
    estimatedCost = estimateCost(totalTokensUsed);

    // Step 4: Retry logic for unsupported claims
    if (
      verificationResult.unsupportedCount > 0 &&
      retriesUsed < this.config.maxRetries
    ) {
      retriesUsed++;
      logger.info(
        {
          unsupportedCount: verificationResult.unsupportedCount,
          retryAttempt: retriesUsed,
          traceId: input.traceId,
        },
        "Retrying answer generation due to unsupported claims",
      );

      const retryDraft = await this.answerWriter.execute({
        evidenceBundle: input.evidenceBundle,
        question: input.question,
        language: input.language,
        conversationContext: [
          ...input.conversationContext,
          {
            role: "assistant",
            content:
              "Your previous answer had claims not supported by evidence. Please only use information directly present in the evidence.",
          },
        ],
        maxClaims: 5,
      });
      totalTokensUsed += retryDraft.tokenUsage.totalTokens;
      estimatedCost = estimateCost(totalTokensUsed);

      const retryVerification = await this.citationVerification.execute({
        draftAnswer: retryDraft,
        evidenceBundle: input.evidenceBundle,
      });
      totalTokensUsed += retryVerification.tokenUsage.totalTokens;
      estimatedCost = estimateCost(totalTokensUsed);

      // Use retry results if they're better
      if (retryVerification.unsupportedCount < verificationResult.unsupportedCount) {
        const retryCompliance = await this.compliance.execute({
          draftAnswer: retryDraft,
          verificationResult: retryVerification,
          evidenceBundle: input.evidenceBundle,
          userQuestion: input.question,
          language: input.language,
          tenantId: input.tenantId,
          actorId: input.actorId,
        });
        totalTokensUsed += retryCompliance.tokenUsage.totalTokens;
        estimatedCost = estimateCost(totalTokensUsed);

        return this.finalize(
          retryDraft,
          retryVerification,
          retryCompliance,
          input,
          pipelineStart,
          retriesUsed,
          totalTokensUsed,
          estimatedCost,
        );
      }
    }

    // Step 5: Finalize
    return this.finalize(
      draftAnswer,
      verificationResult,
      complianceResult,
      input,
      pipelineStart,
      retriesUsed,
      totalTokensUsed,
      estimatedCost,
    );
  }

  private finalize(
    draftAnswer: Parameters<Finalizer["execute"]>[0]["draftAnswer"],
    verificationResult: Parameters<Finalizer["execute"]>[0]["verificationResult"],
    complianceResult: Parameters<Finalizer["execute"]>[0]["complianceResult"],
    input: AnswerPipelineInput,
    pipelineStart: number,
    retriesUsed: number,
    totalTokensUsed: number,
    estimatedCost: number,
  ): AnswerPipelineOutput {
    const finalAnswer = this.finalizer.execute({
      draftAnswer,
      verificationResult,
      complianceResult,
      evidenceBundle: input.evidenceBundle,
      language: input.language,
      traceId: input.traceId,
      promptVersions: {
        answerWriter: "1.0.0",
        citationVerification: "1.0.0",
        compliance: "1.0.0",
      },
    });

    const latencyMs = Date.now() - pipelineStart;

    // Emit knowledge gap candidate for non-approved outcomes
    let gapCandidate: KnowledgeGapCandidate | null = null;
    if (
      this.config.gapEmissionEnabled &&
      this.knowledgeGapPort &&
      (finalAnswer.outcome === "refused" ||
        finalAnswer.outcome === "conflict" ||
        finalAnswer.outcome === "clarified" ||
        complianceResult.unsupportedClaims)
    ) {
      const outcome: GapOutcome =
        finalAnswer.outcome === "conflict"
          ? "conflict"
          : finalAnswer.outcome === "clarified"
            ? "weak"
            : complianceResult.unsupportedClaims
              ? "weak"
              : "refused";

      gapCandidate = {
        question: input.question,
        language: input.language,
        outcome,
        confidence: complianceResult.refusalRequired ? 0 : 0.5,
        traceId: input.traceId,
        tenantId: input.tenantId,
        actorId: input.actorId,
        evidenceSummaryIds: input.evidenceBundle.items.map(
          (item) => item.citationAnchor.chunkId,
        ),
        conflictingClaimCount:
          input.evidenceBundle.conflictGroups.length,
        unsupportedClaimCount: verificationResult.unsupportedCount,
        detectedAt: new Date().toISOString(),
      };

      this.knowledgeGapPort.emitCandidate(gapCandidate).catch((err) => {
        logger.warn(
          { err, traceId: input.traceId },
          "Failed to emit knowledge gap candidate",
        );
      });

      getPipelineMetrics().recordGapCandidate({
        outcome: outcome,
        language: input.language,
        traceId: input.traceId,
      });
    }

    // Metrics: compliance flags
    for (const flag of complianceResult.flags) {
      getPipelineMetrics().recordComplianceFlag({
        flag,
        traceId: input.traceId,
      });
    }

    // Audit event
    getAuditWriter()
      .write({
        action: "RETRIEVAL_SEARCH",
        resourceType: "Retrieval",
        resourceId: input.traceId,
        outcome: "SUCCESS",
        tenantId: input.tenantId,
        actorId: input.actorId,
        metadata: {
          outcome: finalAnswer.outcome,
          citationsCount: finalAnswer.citations.length,
          latencyMs,
          retriesUsed,
          promptInjectionDetected:
            complianceResult.promptInjectionDetected,
          gapCandidateEmitted: gapCandidate !== null,
        },
      })
      .catch(() => {
        // Audit failures don't block
      });

    getPipelineMetrics().recordPipelineInvocation({
      outcome: finalAnswer.outcome,
      latencyMs,
      retriesUsed,
      citationsCount: finalAnswer.citations.length,
      traceId: input.traceId,
    });

    logger.info(
      {
        outcome: finalAnswer.outcome,
        latencyMs,
        retriesUsed,
        citationsCount: finalAnswer.citations.length,
        traceId: input.traceId,
      },
      "Answer pipeline completed",
    );

    return {
      finalAnswer,
      gapCandidate,
      latencyMs,
      totalTokensUsed,
      estimatedCost,
      retriesUsed,
    };
  }
}
