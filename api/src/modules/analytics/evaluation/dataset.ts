import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Loads and validates the synthetic LLM-as-a-Judge evaluation dataset. The
 * dataset is intentionally self-contained (inline evidence, no DB reads) so
 * the fixture mode of `run-evaluation.ts` never touches MongoDB.
 */

export interface EvaluationCaseChunk {
  chunkId: string;
  documentId: string;
  documentTitle: string;
  sectionTitle?: string;
  pageNumber?: number;
  text: string;
}

export interface EvaluationCase {
  id: string;
  question: string;
  evidenceText: string;
  evidenceChunks: EvaluationCaseChunk[];
  expectedTopics: string[];
  expectedDocuments: string[];
  groundTruthAnswer: string;
}

export interface EvaluationDataset {
  schemaVersion: string;
  description: string;
  cases: EvaluationCase[];
}

export const MIN_DATASET_CASES = 20;

export function loadEvaluationDataset(filePath?: string): EvaluationDataset {
  const resolved = filePath ?? path.join(path.dirname(fileURLToPath(import.meta.url)), "dataset.json");
  const parsed = JSON.parse(fs.readFileSync(resolved, "utf8")) as EvaluationDataset;
  validateEvaluationDataset(parsed);
  return parsed;
}

export function validateEvaluationDataset(dataset: EvaluationDataset): void {
  if (!dataset || !Array.isArray(dataset.cases)) {
    throw new Error("Invalid evaluation dataset: missing cases array");
  }
  if (dataset.cases.length < MIN_DATASET_CASES) {
    throw new Error(
      `Invalid evaluation dataset: expected at least ${MIN_DATASET_CASES} cases, found ${dataset.cases.length}`,
    );
  }
  const seenIds = new Set<string>();
  for (const entry of dataset.cases) {
    const id = entry?.id;
    if (typeof id !== "string" || id.trim() === "") {
      throw new Error("Invalid evaluation dataset: case missing id");
    }
    if (seenIds.has(id)) {
      throw new Error(`Duplicate evaluation case id: ${id}`);
    }
    seenIds.add(id);
    if (typeof entry.question !== "string" || entry.question.trim() === "") {
      throw new Error(`Evaluation case ${id}: missing question`);
    }
    if (typeof entry.groundTruthAnswer !== "string" || entry.groundTruthAnswer.trim() === "") {
      throw new Error(`Evaluation case ${id}: missing groundTruthAnswer`);
    }
    if (!Array.isArray(entry.evidenceChunks) || entry.evidenceChunks.length === 0) {
      throw new Error(`Evaluation case ${id}: missing evidenceChunks`);
    }
    for (const chunk of entry.evidenceChunks) {
      if (!chunk || typeof chunk.text !== "string" || chunk.text.trim() === "") {
        throw new Error(`Evaluation case ${id}: evidence chunk missing text`);
      }
      if (!chunk.documentId || !chunk.documentTitle) {
        throw new Error(`Evaluation case ${id}: evidence chunk missing documentId/documentTitle`);
      }
    }
    if (!Array.isArray(entry.expectedTopics) || entry.expectedTopics.length === 0) {
      throw new Error(`Evaluation case ${id}: missing expectedTopics`);
    }
    if (!Array.isArray(entry.expectedDocuments) || entry.expectedDocuments.length === 0) {
      throw new Error(`Evaluation case ${id}: missing expectedDocuments`);
    }
  }
}
