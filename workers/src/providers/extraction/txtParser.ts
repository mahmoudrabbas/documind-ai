import type { ExtractionInput, ExtractionOutput, ExtractionPage, ExtractionBlock } from "../../contracts/extractionContract.js";
import type { ExtractionParser } from "./extractionPort.js";

export class TxtParser implements ExtractionParser {
  readonly supportedMimeTypes = ["text/plain"];

  async parse(input: ExtractionInput): Promise<ExtractionOutput> {
    const warnings: string[] = [];
    const maxChars = input.limits?.maxCharacters ?? 2_000_000;
    
    let text = "";
    try {
      const utf8Decoder = new TextDecoder("utf-8", { fatal: true });
      text = utf8Decoder.decode(input.buffer);
    } catch {
      try {
        const win1256Decoder = new TextDecoder("windows-1256");
        text = win1256Decoder.decode(input.buffer);
        warnings.push("Failed to decode as UTF-8. Fell back to Windows-1256 (Arabic).");
      } catch {
        const lossyDecoder = new TextDecoder("utf-8", { fatal: false });
        text = lossyDecoder.decode(input.buffer);
        warnings.push("Failed to decode cleanly. Decoded with lossy UTF-8.");
      }
    }

    // Normalize newlines
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    
    // Split by paragraphs (double newlines)
    const paragraphs = text.split(/\n{2,}/);
    const blocks: ExtractionBlock[] = [];
    let totalCharacters = 0;

    for (const p of paragraphs) {
      const trimmed = p.trim();
      if (!trimmed) continue;

      if (totalCharacters + trimmed.length > maxChars) {
        const allowedLen = maxChars - totalCharacters;
        if (allowedLen > 0) {
          blocks.push({
            type: "paragraph",
            text: trimmed.substring(0, allowedLen) + "... [Truncated]",
          });
        }
        warnings.push(`Character limit of ${maxChars} exceeded. Output truncated.`);
        break;
      }

      blocks.push({
        type: "paragraph",
        text: trimmed,
      });
      totalCharacters += trimmed.length;
    }

    const pages: ExtractionPage[] = [
      {
        pageNumber: 1,
        blocks,
      },
    ];

    return {
      pages,
      metadata: {
        totalPages: 1,
        totalCharacters,
        detectedLanguages: ["en"],
        warnings,
        hasImageOnlyPages: false,
      },
      parserName: "txt-parser",
      parserVersion: "1.0.0",
    };
  }
}
