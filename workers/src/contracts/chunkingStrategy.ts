import type { ExtractionBlock } from "./extractionContract.js";

export interface ChunkCandidate {
  text: string;
  sectionPath: string[];
  pageStart: number;
  pageEnd: number;
  offsetStart: number;
  offsetEnd: number;
  contentType: "paragraph" | "heading" | "table" | "clause" | "list";
  language: "ar" | "en" | "mixed";
  partIndex: number | null;
  partCount: number | null;
  tokenCount: number;
}

export interface ChunkingStrategy {
  readonly name: string;
  canHandle(blocks: ExtractionBlock[]): boolean;
  chunk(
    blocks: ExtractionBlock[],
    pageNumber: number,
    targetTokens: number,
    hardCeiling: number,
    overlapTokens: number,
    countTokens: (text: string) => number,
  ): ChunkCandidate[];
}
