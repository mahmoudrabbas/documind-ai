import type { ExtractionPage } from "workers/contracts";
import type { ChunkCandidate } from "workers/contracts";
import type { Tokenizer } from "./tokenizer.port.js";
import { chunkDocument as sharedChunkDocument, DEFAULT_CHUNKING_CONFIG } from "workers/contracts";

export interface ChunkingConfig {
  targetTokens: number;
  hardCeiling: number;
  overlap: number;
  tokenizerVersion: string;
}

export const DEFAULT_API_CHUNKING_CONFIG: ChunkingConfig = { ...DEFAULT_CHUNKING_CONFIG };

export function chunkDocument(
  pages: ExtractionPage[],
  tokenizer: Tokenizer,
  config: Partial<ChunkingConfig> = {},
): ChunkCandidate[] {
  return sharedChunkDocument(pages, tokenizer, config);
}

export { DEFAULT_CHUNKING_CONFIG };
