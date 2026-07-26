import type { ExtractionPage } from "../../contracts/extractionContract.js";
import type { Tokenizer } from "./tokenizer.js";
import { chunkDocument as sharedChunkDocument, DEFAULT_CHUNKING_CONFIG } from "../../contracts/chunkDocument.js";
import type { ChunkCandidate } from "../../contracts/chunkingStrategy.js";

export type { ChunkCandidate };

export interface ChunkingConfig {
  targetTokens: number;
  hardCeiling: number;
  overlap: number;
}

export function chunkDocument(
  pages: ExtractionPage[],
  tokenizer: Tokenizer,
  config: Partial<ChunkingConfig> = {},
): ChunkCandidate[] {
  return sharedChunkDocument(pages, tokenizer, {
    ...config,
    tokenizerVersion: DEFAULT_CHUNKING_CONFIG.tokenizerVersion,
  });
}
