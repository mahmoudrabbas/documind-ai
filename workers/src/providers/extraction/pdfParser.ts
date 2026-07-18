import { PDFParse, PasswordException } from "pdf-parse";
import type { ExtractionInput, ExtractionOutput, ExtractionPage } from "../../contracts/extractionContract.js";
import type { ExtractionParser } from "./extractionPort.js";

export class PdfParser implements ExtractionParser {
  readonly supportedMimeTypes = ["application/pdf"];

  async parse(input: ExtractionInput): Promise<ExtractionOutput> {
    const warnings: string[] = [];

    const maxPages = input.limits?.maxPages ?? 500;
    const maxChars = input.limits?.maxCharacters ?? 2_000_000;

    try {
      const parser = new PDFParse({ data: input.buffer });
      const parsed = await parser.getText();

      let totalCharacters = 0;
      let hasImageOnlyPages = false;
      const finalPages: ExtractionPage[] = [];

      const sortedParsedPages = [...parsed.pages].sort((a, b) => a.num - b.num);

      for (const page of sortedParsedPages) {
        if (page.num > maxPages) {
          warnings.push(`Page limit of ${maxPages} exceeded. Only first ${maxPages} pages parsed.`);
          break;
        }

        const normalizedText = page.text.trim().normalize("NFC");
        const pageTextLen = normalizedText.length;

        if (pageTextLen < 20) {
          hasImageOnlyPages = true;
          warnings.push(`Page ${page.num} has very low text content (${pageTextLen} chars). OCR may be needed.`);
        }

        const blocks = normalizedText
          ? [{ type: "paragraph" as const, text: normalizedText }]
          : [];

        if (totalCharacters + pageTextLen > maxChars) {
          const allowedLen = maxChars - totalCharacters;
          if (allowedLen > 0 && blocks.length > 0) {
            blocks[0].text = blocks[0].text.substring(0, allowedLen) + "... [Truncated]";
            finalPages.push({ pageNumber: page.num, blocks });
          }
          warnings.push(`Character limit of ${maxChars} exceeded. Output truncated.`);
          break;
        }

        totalCharacters += pageTextLen;
        finalPages.push({ pageNumber: page.num, blocks });
      }

      return {
        pages: finalPages,
        metadata: {
          totalPages: parsed.pages.length,
          totalCharacters,
          detectedLanguages: ["en"],
          warnings,
          hasImageOnlyPages,
        },
        parserName: "pdf-parse",
        parserVersion: "2.4.5",
      };
    } catch (error: unknown) {
      if (error instanceof PasswordException) {
        throw new Error("encrypted");
      }
      throw error;
    }
  }
}
