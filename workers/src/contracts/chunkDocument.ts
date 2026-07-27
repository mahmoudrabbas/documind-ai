import type { ExtractionPage } from "./extractionContract.js";
import type { ChunkCandidate } from "./chunkingStrategy.js";
import { StructuralStrategy } from "./chunkingStrategies/structural.strategy.js";
import { ParagraphStrategy } from "./chunkingStrategies/paragraph.strategy.js";
import { TableStrategy } from "./chunkingStrategies/table.strategy.js";

export interface ChunkingConfig {
  targetTokens: number;
  hardCeiling: number;
  overlap: number;
  tokenizerVersion: string;
}

export const DEFAULT_CHUNKING_CONFIG: ChunkingConfig = {
  targetTokens: 400,
  hardCeiling: 800,
  overlap: 50,
  tokenizerVersion: "cl100k_base",
};

const structuralStrategy = new StructuralStrategy();
const paragraphStrategy = new ParagraphStrategy();
const tableStrategy = new TableStrategy();

export function chunkDocument(
  pages: ExtractionPage[],
  tokenizer: { countTokens(text: string): number },
  config: Partial<ChunkingConfig> = {},
): ChunkCandidate[] {
  const cfg = { ...DEFAULT_CHUNKING_CONFIG, ...config };
  const allCandidates: ChunkCandidate[] = [];
  let chunkIndex = 0;

  for (const page of pages) {
    const pageCandidates = chunkPage(page, tokenizer, cfg);
    for (const candidate of pageCandidates) {
      allCandidates.push({
        ...candidate,
        chunkIndex: chunkIndex++,
      } as ChunkCandidate & { chunkIndex: number });
    }
  }

  return applyCrossPageOverlap(allCandidates, cfg.overlap, tokenizer);
}

function chunkPage(
  page: ExtractionPage,
  tokenizer: { countTokens(text: string): number },
  config: ChunkingConfig,
): ChunkCandidate[] {
  const { blocks } = page;
  const countTokens = (text: string) => tokenizer.countTokens(text);
  const candidates: ChunkCandidate[] = [];

  if (blocks.length === 0) return [];

  if (tableStrategy.canHandle(blocks)) {
    const tableCandidates = tableStrategy.chunk(
      blocks.filter((b) => b.type === "table"),
      page.pageNumber,
      config.targetTokens,
      config.hardCeiling,
      config.overlap,
      countTokens,
    );
    candidates.push(...tableCandidates);
  }

  const nonTableBlocks = blocks.filter((b) => b.type !== "table");

  if (nonTableBlocks.length > 0) {
    if (structuralStrategy.canHandle(nonTableBlocks)) {
      const structuralCandidates = structuralStrategy.chunk(
        nonTableBlocks,
        page.pageNumber,
        config.targetTokens,
        config.hardCeiling,
        config.overlap,
        countTokens,
      );
      candidates.push(...structuralCandidates);
    } else {
      const paraCandidates = paragraphStrategy.chunk(
        nonTableBlocks,
        page.pageNumber,
        config.targetTokens,
        config.hardCeiling,
        config.overlap,
        countTokens,
      );
      candidates.push(...paraCandidates);
    }
  }

  return candidates;
}

function applyCrossPageOverlap(
  candidates: ChunkCandidate[],
  overlapTokens: number,
  tokenizer: { countTokens(text: string): number },
): ChunkCandidate[] {
  if (candidates.length <= 1 || overlapTokens <= 0) return candidates;

  const result = [candidates[0]];

  for (let i = 1; i < candidates.length; i++) {
    const prev = candidates[i - 1];
    const current = candidates[i];

    if (prev.pageEnd === current.pageStart && prev.sectionPath.join() === current.sectionPath.join()) {
      const overlapText = getOverlapTail(prev.text, overlapTokens, tokenizer);
      if (overlapText.length > 0) {
        result.push({
          ...current,
          text: overlapText + "\n\n" + current.text,
          tokenCount: tokenizer.countTokens(overlapText + "\n\n" + current.text),
        });
        continue;
      }
    }

    result.push(current);
  }

  return result;
}

function getOverlapTail(text: string, overlapTokens: number, tokenizer: { countTokens(text: string): number }): string {
  const sentences = text.split(/(?<=[.!?؟])\s+/).filter((s) => s.trim().length > 0);
  let result = "";
  for (let i = sentences.length - 1; i >= 0; i--) {
    const candidate = sentences[i] + (result ? " " + result : "");
    if (tokenizer.countTokens(candidate) > overlapTokens && result.length > 0) break;
    result = candidate;
  }
  return result;
}
