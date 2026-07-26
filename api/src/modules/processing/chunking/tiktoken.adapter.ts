import { encodingForModel, getEncoding } from "js-tiktoken";
import type { Tokenizer } from "./tokenizer.port.js";

const MODEL_ENCODING_MAP: Record<string, string> = {
  "cl100k_base": "cl100k_base",
  "gpt-4": "cl100k_base",
  "gpt-4o": "cl100k_base",
  "gpt-4-turbo": "cl100k_base",
  "gpt-3.5-turbo": "cl100k_base",
};

const ENCODING_NAMES = new Set(["cl100k_base", "p50k_base", "p50k_edit", "r50k_base", "o200k_base"]);

export class TiktokenTokenizer implements Tokenizer {
  readonly name: string;
  readonly vocabularySize: number;

  private encoder: ReturnType<typeof encodingForModel>;

  constructor(tokenizerVersion = "cl100k_base") {
    this.name = tokenizerVersion;
    const encodingName = MODEL_ENCODING_MAP[tokenizerVersion] || "cl100k_base";
    if (ENCODING_NAMES.has(encodingName)) {
      this.encoder = getEncoding(encodingName as "cl100k_base" | "p50k_base" | "p50k_edit" | "r50k_base" | "o200k_base");
    } else {
      this.encoder = encodingForModel(encodingName as never);
    }
    this.vocabularySize = 100000;
  }

  countTokens(text: string): number {
    return this.encoder.encode(text).length;
  }

  splitIntoTokens(text: string): string[] {
    const tokenIds = this.encoder.encode(text);
    return tokenIds.map((id: number) => String(id));
  }
}

export function getTokenizer(version?: string): Tokenizer {
  return new TiktokenTokenizer(version);
}
