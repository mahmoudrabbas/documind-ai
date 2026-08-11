import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  type EvaluationCase,
  type EvaluationDataset,
  validateEvaluationDataset,
} from "./dataset.js";
import {
  RAG_EVALUATION_CASE_SCHEMA_VERSION,
  RagEvaluationDatasetV2Schema,
  type RagEvaluationCaseV2,
  type RagEvaluationDatasetV2,
} from "./evaluation.schemas.js";

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function detectLanguage(value: string): "ar" | "en" | "mixed" {
  const hasArabic = /\p{Script=Arabic}/u.test(value);
  const hasLatin = /\p{Script=Latin}/u.test(value);
  if (hasArabic && hasLatin) return "mixed";
  return hasArabic ? "ar" : "en";
}

/**
 * Lossless migration for labels that V1 states explicitly. The migration does
 * not infer permission scenarios, irrelevant documents, or unstated chunks.
 */
export function migrateEvaluationCaseV1(entry: EvaluationCase): RagEvaluationCaseV2 {
  const documentIds = unique(entry.evidenceChunks.map((chunk) => chunk.documentId));
  const chunkIds = unique(entry.evidenceChunks.map((chunk) => chunk.chunkId));

  return RagEvaluationDatasetV2Schema.shape.cases.element.parse({
    schemaVersion: RAG_EVALUATION_CASE_SCHEMA_VERSION,
    id: entry.id,
    description: `Migrated V1 case covering: ${entry.expectedTopics.join(", ")}`,
    language: detectLanguage(entry.question),
    question: entry.question,
    expectedRoute: "rag",
    expectedIntent: "knowledge_question",
    expectedOutcome: "release",
    retrieval: {
      expectedDocumentIds: documentIds,
      expectedRelevantDocumentIds: documentIds,
      expectedRelevantChunkIds: chunkIds,
      knownIrrelevantDocumentIds: [],
    },
    grounding: {
      expectedFacts: [],
      expectedClaims: [],
      forbiddenFacts: [],
    },
    citations: {
      expectedSourceDocumentIds: documentIds,
      sourceRequired: true,
      sourceForbidden: false,
    },
    evaluationModes: ["retrieval", "end_to_end"],
    tags: unique(["v1-migrated", ...entry.expectedTopics]),
    notes: [
      `V1 expected document titles: ${entry.expectedDocuments.join(", ")}.`,
      `V1 legacy reference answer retained only in migration notes: ${entry.groundTruthAnswer}`,
      "V1 did not define explicit correctness labels; correctness remains unevaluated until curated.",
      "Authorization labels and known-irrelevant documents were not present in V1 and require explicit curation.",
    ].join(" "),
  });
}

export function migrateEvaluationDatasetV1(dataset: EvaluationDataset): RagEvaluationDatasetV2 {
  validateEvaluationDataset(dataset);
  return RagEvaluationDatasetV2Schema.parse({
    schemaVersion: RAG_EVALUATION_CASE_SCHEMA_VERSION,
    datasetVersion: `v1-migrated-${dataset.schemaVersion}`,
    description: `${dataset.description} (automatically migrated from schema ${dataset.schemaVersion})`,
    cases: dataset.cases.map(migrateEvaluationCaseV1),
  });
}

/** Loads native V2 JSON or explicitly migrates the existing V1 fixture. */
export function loadRagEvaluationDatasetV2(filePath?: string): RagEvaluationDatasetV2 {
  const resolved =
    filePath ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "dataset.json");
  const parsed: unknown = JSON.parse(fs.readFileSync(resolved, "utf8"));

  if (
    typeof parsed === "object" &&
    parsed !== null &&
    "schemaVersion" in parsed &&
    parsed.schemaVersion === RAG_EVALUATION_CASE_SCHEMA_VERSION
  ) {
    return RagEvaluationDatasetV2Schema.parse(parsed);
  }

  return migrateEvaluationDatasetV1(parsed as EvaluationDataset);
}
