export type OcrLanguage = "ar" | "en" | "ar+en";

export interface OcrPageInput {
  pageNumber: number;
  imageBuffer: Buffer;
  mimeType: string;
  language: OcrLanguage;
}

export interface OcrBoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface OcrWord {
  text: string;
  confidence: number;
  boundingBox?: OcrBoundingBox;
}

export interface OcrPageResult {
  pageNumber: number;
  text: string;
  confidence: number;
  words: OcrWord[];
  language: OcrLanguage;
  provider: string;
  providerModel: string;
  durationMs: number;
  warnings: string[];
  requestId?: string;
}

export interface OcrBatchResult {
  pages: OcrPageResult[];
  totalCostUsd: number;
  providerVersion: string;
}

export interface OcrProvider {
  readonly name: string;
  readonly version: string;

  recognizeBatch(pages: OcrPageInput[]): Promise<OcrBatchResult>;
  isLanguageSupported(lang: OcrLanguage): boolean;
}
