import type { ExtractionInput, ExtractionOutput } from "../../contracts/extractionContract.js";

export interface ExtractionParser {
  readonly supportedMimeTypes: string[];
  parse(input: ExtractionInput): Promise<ExtractionOutput>;
}
