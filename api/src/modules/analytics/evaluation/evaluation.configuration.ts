import { createHash } from "node:crypto";
import { z } from "zod";
import {
  RagEvaluationConfigurationSchema,
  type RagEvaluationConfiguration,
} from "./evaluation.schemas.js";
import type { RuntimeComponentIdentity } from "../../agents/agents.types.js";

export const RAG_CONFIGURATION_IDENTITY_VERSION = "1.0.0" as const;

const ConfigurationId = z.string().trim().min(1).max(200);

/** Validates identity exposed by the instantiated runtime adapter. */
export function assertCompleteRuntimeComponentIdentity(
  identity: RuntimeComponentIdentity | undefined,
  component: string,
): asserts identity is RuntimeComponentIdentity & { provider: string; componentVersion: string } {
  if (!identity?.provider || !identity.componentVersion) {
    throw new Error(`Required runtime identity is unavailable for ${component}: provider and componentVersion are required`);
  }
  if (!identity.model && !identity.chain?.length) {
    throw new Error(`Required runtime identity is unavailable for ${component}: model or ordered chain is required`);
  }
  if (identity.model && identity.modelRevision === undefined && identity.modelRevisionStatus !== "unavailable") {
    throw new Error(`Required runtime identity is unavailable for ${component}: model revision must be provided or explicitly unavailable`);
  }
  identity.chain?.forEach((entry, index) => {
    if (!entry.provider || !entry.model || !entry.componentVersion) {
      throw new Error(`Required runtime identity is unavailable for ${component} chain entry ${index}`);
    }
    if (entry.modelRevision === undefined && entry.modelRevisionStatus !== "unavailable") {
      throw new Error(`Required runtime identity is unavailable for ${component} chain entry ${index}: model revision must be provided or explicitly unavailable`);
    }
  });
}

export const RagConfigurationIdentitySchema = z
  .object({
    identityVersion: z.literal(RAG_CONFIGURATION_IDENTITY_VERSION),
    configurationId: ConfigurationId,
    configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
    normalizedConfiguration: z.record(z.string(), z.unknown()),
  })
  .strict();
export type RagConfigurationIdentity = z.infer<
  typeof RagConfigurationIdentitySchema
>;

function sortedRecord<T>(
  value: Readonly<Record<string, T>> | undefined,
): Record<string, T> | undefined {
  if (!value) return undefined;
  return Object.fromEntries(
    Object.entries(value).sort(([left], [right]) => left.localeCompare(right)),
  );
}

function compactRecord(value: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(value)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

function assertNoSecretKeys(value: unknown, path = "configuration"): void {
  if (value === null || typeof value !== "object") return;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (/(api[-_]?key|secret|password|credential|private[-_]?key|access[-_]?token)/i.test(key)) {
      throw new Error(`Secret-bearing configuration field is not allowed: ${path}.${key}`);
    }
    assertNoSecretKeys(entry, `${path}.${key}`);
  }
}

/** Canonical JSON serializer with stable recursive object-key ordering. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((entry) => canonicalJson(entry)).join(",")}]`;
  }
  if (value !== null && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .filter(([, entry]) => entry !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${canonicalJson(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value) ?? "null";
}

/**
 * Projects a report configuration onto quality-relevant fields only. Runtime
 * metadata (timestamps, request IDs, tenant IDs, and similar diagnostics) is
 * deliberately excluded. Strict structured schemas reject secret-bearing
 * fields rather than allowing them into the identity envelope.
 */
export function normalizeEvaluationConfiguration(
  datasetVersion: string,
  rawConfiguration: RagEvaluationConfiguration,
): Record<string, unknown> {
  const configuration = RagEvaluationConfigurationSchema.parse(rawConfiguration);
  if (configuration.runtimeIdentityRequired) {
    const required: Array<[string, unknown]> = [
      ["retrieval", configuration.retrieval],
      ["fusion", configuration.fusion],
      ["reranker", configuration.rerankerDetails],
      ["embedding", configuration.embedding],
      ["answer", configuration.answer],
      ["verifier", configuration.verifier],
      ["answerRelevanceJudge", configuration.answerRelevanceJudge],
      ["semanticCorrectnessJudge", configuration.semanticCorrectnessJudge],
      ["citationsEnabled", configuration.citationsEnabled],
      ["maxTokens", configuration.maxTokens],
      ["promptVersions", configuration.promptVersions],
      ["thresholds", configuration.thresholds],
      ["evidenceThresholds", configuration.evidenceThresholds],
      ["workflowVersions", configuration.workflowVersions],
      ["metricSemanticsVersion", configuration.metricSemanticsVersion],
    ];
    const missing = required.filter(([, value]) => value === undefined || value === null).map(([name]) => name);
    if (missing.length > 0 || (configuration.unavailableQualityFields?.length ?? 0) > 0) {
      throw new Error(`Reproducible runtime identity is unavailable: ${[...missing, ...(configuration.unavailableQualityFields ?? [])].join(", ")}`);
    }
  }
  return compactRecord({
    identityVersion: RAG_CONFIGURATION_IDENTITY_VERSION,
    datasetVersion,
    retrieval: configuration.retrieval
      ? compactRecord({
          metricCutoffK: configuration.retrieval.metricCutoffK,
          workflowTopK: configuration.retrieval.workflowTopK,
          weights: sortedRecord(configuration.retrieval.weights),
        })
      : undefined,
    fusion: configuration.fusion,
    reranker:
      configuration.rerankerDetails ??
      (configuration.reranker
        ? { name: configuration.reranker }
        : undefined),
    embedding:
      configuration.embedding ??
      (configuration.embeddingModel
        ? { model: configuration.embeddingModel }
        : undefined),
    answer:
      configuration.answer ??
      (configuration.answerModel ? { model: configuration.answerModel } : undefined),
    verifier:
      configuration.verifier ??
      (configuration.verifierModel
        ? { model: configuration.verifierModel }
        : undefined),
    answerRelevanceJudge: configuration.answerRelevanceJudge,
    semanticCorrectnessJudge: configuration.semanticCorrectnessJudge,
    citationsEnabled: configuration.citationsEnabled,
    maxTokens: configuration.maxTokens,
    promptVersions: sortedRecord(configuration.promptVersions),
    thresholds: sortedRecord(configuration.thresholds),
    evidenceThresholds: sortedRecord(configuration.evidenceThresholds),
    workflowVersions: sortedRecord(configuration.workflowVersions),
    unavailableQualityFields: configuration.unavailableQualityFields
      ? [...configuration.unavailableQualityFields].sort((left, right) => left.localeCompare(right))
      : undefined,
    metricSemanticsVersion: configuration.metricSemanticsVersion,
    runtimeIdentityRequired: configuration.runtimeIdentityRequired,
  });
}

export function createEvaluationConfigurationIdentity(
  datasetVersion: string,
  configuration: RagEvaluationConfiguration,
): RagConfigurationIdentity {
  const normalizedConfiguration = normalizeEvaluationConfiguration(
    datasetVersion,
    configuration,
  );
  assertNoSecretKeys(normalizedConfiguration);
  const configurationHash = createHash("sha256")
    .update(canonicalJson(normalizedConfiguration))
    .digest("hex");
  return RagConfigurationIdentitySchema.parse({
    identityVersion: RAG_CONFIGURATION_IDENTITY_VERSION,
    configurationId: `rag-config-v1-${configurationHash.slice(0, 16)}`,
    configurationHash,
    normalizedConfiguration,
  });
}
