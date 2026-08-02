import { logger } from "../../common/logger/logger.js";

export interface PipelineMetrics {
  recordPipelineInvocation(params: {
    outcome: string;
    latencyMs: number;
    retriesUsed: number;
    citationsCount: number;
    traceId: string;
  }): void;

  recordAgentLatency(params: {
    agent: string;
    latencyMs: number;
    tokensUsed: number;
    traceId: string;
  }): void;

  recordGapCandidate(params: {
    outcome: string;
    language: string;
    traceId: string;
  }): void;

  recordComplianceFlag(params: {
    flag: string;
    traceId: string;
  }): void;
}

class LogPipelineMetrics implements PipelineMetrics {
  recordPipelineInvocation(params: {
    outcome: string;
    latencyMs: number;
    retriesUsed: number;
    citationsCount: number;
    traceId: string;
  }): void {
    logger.info(
      {
        metric: "answer_pipeline.invoked",
        outcome: params.outcome,
        latencyMs: params.latencyMs,
        retriesUsed: params.retriesUsed,
        citationsCount: params.citationsCount,
        traceId: params.traceId,
      },
      "Pipeline metric",
    );
  }

  recordAgentLatency(params: {
    agent: string;
    latencyMs: number;
    tokensUsed: number;
    traceId: string;
  }): void {
    logger.info(
      {
        metric: "answer_pipeline.agent_latency",
        agent: params.agent,
        latencyMs: params.latencyMs,
        tokensUsed: params.tokensUsed,
        traceId: params.traceId,
      },
      "Agent metric",
    );
  }

  recordGapCandidate(params: {
    outcome: string;
    language: string;
    traceId: string;
  }): void {
    logger.info(
      {
        metric: "answer_pipeline.gap_candidate",
        outcome: params.outcome,
        language: params.language,
        traceId: params.traceId,
      },
      "Gap candidate metric",
    );
  }

  recordComplianceFlag(params: {
    flag: string;
    traceId: string;
  }): void {
    logger.info(
      {
        metric: "answer_pipeline.compliance_flag",
        flag: params.flag,
        traceId: params.traceId,
      },
      "Compliance metric",
    );
  }
}

class InMemoryPipelineMetrics implements PipelineMetrics {
  readonly invocations: Array<Record<string, unknown>> = [];
  readonly agentLatencies: Array<Record<string, unknown>> = [];
  readonly gapCandidates: Array<Record<string, unknown>> = [];
  readonly complianceFlags: Array<Record<string, unknown>> = [];

  recordPipelineInvocation(params: {
    outcome: string;
    latencyMs: number;
    retriesUsed: number;
    citationsCount: number;
    traceId: string;
  }): void {
    this.invocations.push(params);
  }

  recordAgentLatency(params: {
    agent: string;
    latencyMs: number;
    tokensUsed: number;
    traceId: string;
  }): void {
    this.agentLatencies.push(params);
  }

  recordGapCandidate(params: {
    outcome: string;
    language: string;
    traceId: string;
  }): void {
    this.gapCandidates.push(params);
  }

  recordComplianceFlag(params: {
    flag: string;
    traceId: string;
  }): void {
    this.complianceFlags.push(params);
  }
}

let metricsInstance: PipelineMetrics = new LogPipelineMetrics();

export function getPipelineMetrics(): PipelineMetrics {
  return metricsInstance;
}

export function setPipelineMetrics(metrics: PipelineMetrics): void {
  metricsInstance = metrics;
}

export function createInMemoryPipelineMetrics(): InMemoryPipelineMetrics {
  const metrics = new InMemoryPipelineMetrics();
  setPipelineMetrics(metrics);
  return metrics;
}
