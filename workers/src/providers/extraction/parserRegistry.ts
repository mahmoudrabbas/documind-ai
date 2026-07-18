import type { ExtractionInput, ExtractionOutput, ExtractionLimits } from "../../contracts/extractionContract.js";
import { DEFAULT_EXTRACTION_LIMITS } from "../../contracts/extractionContract.js";
import type { ExtractionParser } from "./extractionPort.js";
import { PdfParser } from "./pdfParser.js";
import { DocxParser } from "./docxParser.js";
import { TxtParser } from "./txtParser.js";
import { FakeParser } from "./fakeParser.js";

export class ParserRegistry {
  private parsers = new Map<string, ExtractionParser>();

  constructor(useFake = false) {
    if (useFake) {
      const fake = new FakeParser();
      this.register(fake);
    } else {
      this.register(new PdfParser());
      this.register(new DocxParser());
      this.register(new TxtParser());
    }
  }

  register(parser: ExtractionParser): void {
    for (const mime of parser.supportedMimeTypes) {
      this.parsers.set(mime, parser);
    }
  }

  getParser(mimeType: string): ExtractionParser | undefined {
    return this.parsers.get(mimeType);
  }

  async parse(input: ExtractionInput): Promise<ExtractionOutput> {
    const parser = this.getParser(input.mimeType);
    if (!parser) {
      throw new Error("unsupported");
    }

    const limits: ExtractionLimits = {
      ...DEFAULT_EXTRACTION_LIMITS,
      ...input.limits,
    };

    // Pre-check: file size
    if (input.buffer.length > limits.maxFileSizeBytes) {
      throw new Error(`File size ${input.buffer.length} exceeds limit of ${limits.maxFileSizeBytes} bytes`);
    }

    // Enforce parsing timeout
    const timeoutMs = limits.maxParsingTimeMs;
    const abortController = new AbortController();
    const timer = setTimeout(() => abortController.abort(), timeoutMs);

    try {
      const result = await Promise.race([
        parser.parse(input),
        new Promise<never>((_, reject) => {
          abortController.signal.addEventListener("abort", () => {
            reject(new Error(`Parsing timed out after ${timeoutMs}ms`));
          });
        }),
      ]);
      return result;
    } finally {
      clearTimeout(timer);
    }
  }
}

// Instantiate default registry
export const parserRegistry = new ParserRegistry(process.env.USE_FAKE_PARSER === "true");
export const fakeParserRegistry = new ParserRegistry(true);
