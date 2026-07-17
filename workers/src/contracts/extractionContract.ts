import { z } from "zod";

export const ExtractionBlockTypeSchema = z.enum(["paragraph", "heading", "table", "list"]);
export type ExtractionBlockType = z.infer<typeof ExtractionBlockTypeSchema>;

export const ExtractionBlockSchema = z.object({
  type: ExtractionBlockTypeSchema,
  text: z.string(),
  level: z.number().optional(), // For headings (e.g. h1, h2)
  sourceOffset: z.number().optional(), // Offset in the raw source stream/buffer
});
export type ExtractionBlock = z.infer<typeof ExtractionBlockSchema>;

export const ExtractionPageSchema = z.object({
  pageNumber: z.number().int().positive(),
  blocks: z.array(ExtractionBlockSchema),
});
export type ExtractionPage = z.infer<typeof ExtractionPageSchema>;

export const ExtractionMetadataSchema = z.object({
  totalPages: z.number().int().nonnegative(),
  totalCharacters: z.number().int().nonnegative(),
  detectedLanguages: z.array(z.string()),
  warnings: z.array(z.string()),
  hasImageOnlyPages: z.boolean(),
});
export type ExtractionMetadata = z.infer<typeof ExtractionMetadataSchema>;

export const ExtractionOutputSchema = z.object({
  pages: z.array(ExtractionPageSchema),
  metadata: ExtractionMetadataSchema,
  parserName: z.string(),
  parserVersion: z.string(),
});
export type ExtractionOutput = z.infer<typeof ExtractionOutputSchema>;

export interface ExtractionLimits {
  maxPages: number;
  maxCharacters: number;
  maxParsingTimeMs: number;
  maxFileSizeBytes: number;
}

export const DEFAULT_EXTRACTION_LIMITS: ExtractionLimits = {
  maxPages: 500,
  maxCharacters: 2_000_000,
  maxParsingTimeMs: 30_000,
  maxFileSizeBytes: 100 * 1024 * 1024, // 100 MB
};

export interface ExtractionInput {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  tenantId: string;
  documentId: string;
  documentVersion: number;
  limits?: Partial<ExtractionLimits>;
}
