export interface Tokenizer {
  readonly name: string;
  readonly vocabularySize: number;

  countTokens(text: string): number;
  splitIntoTokens(text: string): string[];
}

export interface TokenizerConfig {
  tokenizerVersion: string;
}
