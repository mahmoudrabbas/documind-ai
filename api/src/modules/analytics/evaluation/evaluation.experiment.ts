import { createHash } from "node:crypto";
import { z } from "zod";
import type { RagConfigurationIdentity } from "./evaluation.configuration.js";

export const RAG_EXPERIMENT_METADATA_VERSION = "1.0.0" as const;

const ExperimentId = z.string().trim().min(1).max(200);

export const RagExperimentMetadataSchema = z
  .object({
    experimentVersion: z.literal(RAG_EXPERIMENT_METADATA_VERSION),
    experimentId: ExperimentId,
    name: ExperimentId,
    configurationId: ExperimentId,
    configurationHash: z.string().regex(/^[a-f0-9]{64}$/),
    datasetVersion: ExperimentId,
    createdAt: z.iso.datetime({ offset: true }),
    description: z.string().trim().min(1).max(2_000).optional(),
    baselineExperimentId: ExperimentId.optional(),
    tags: z.array(ExperimentId).max(50),
  })
  .strict();
export type RagExperimentMetadata = z.infer<
  typeof RagExperimentMetadataSchema
>;

export interface CreateRagExperimentMetadataInput {
  experimentId?: string;
  name: string;
  configurationIdentity: RagConfigurationIdentity;
  datasetVersion: string;
  createdAt: Date | string;
  description?: string;
  baselineExperimentId?: string;
  tags?: readonly string[];
}

export function createRagExperimentMetadata(
  input: CreateRagExperimentMetadataInput,
): RagExperimentMetadata {
  const createdAt =
    input.createdAt instanceof Date
      ? input.createdAt.toISOString()
      : new Date(input.createdAt).toISOString();
  const deterministicSuffix = createHash("sha256")
    .update(
      `${input.name}:${input.datasetVersion}:${input.configurationIdentity.configurationHash}:${createdAt}`,
    )
    .digest("hex")
    .slice(0, 16);
  return RagExperimentMetadataSchema.parse({
    experimentVersion: RAG_EXPERIMENT_METADATA_VERSION,
    experimentId: input.experimentId ?? `rag-experiment-${deterministicSuffix}`,
    name: input.name,
    configurationId: input.configurationIdentity.configurationId,
    configurationHash: input.configurationIdentity.configurationHash,
    datasetVersion: input.datasetVersion,
    createdAt,
    ...(input.description ? { description: input.description } : {}),
    ...(input.baselineExperimentId
      ? { baselineExperimentId: input.baselineExperimentId }
      : {}),
    tags: [...new Set(input.tags ?? [])].sort((left, right) =>
      left.localeCompare(right),
    ),
  });
}
