import mammoth from "mammoth";
import type { ExtractionInput, ExtractionOutput, ExtractionPage, ExtractionBlock } from "../../contracts/extractionContract.js";
import type { ExtractionParser } from "./extractionPort.js";

export class DocxParser implements ExtractionParser {
  readonly supportedMimeTypes = [
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  private extractTableText(tableHtml: string): string {
    const rows: string[] = [];
    const rowRegex = /<tr[^>]*>(.*?)<\/tr>/gis;
    let rowMatch;
    
    while ((rowMatch = rowRegex.exec(tableHtml)) !== null) {
      const cells: string[] = [];
      const cellRegex = /<t[dh][^>]*>(.*?)<\/t[dh]>/gis;
      let cellMatch;
      
      while ((cellMatch = cellRegex.exec(rowMatch[1])) !== null) {
        const cellText = cellMatch[1].replace(/<[^>]+>/g, "").trim();
        cells.push(cellText);
      }
      if (cells.length > 0) {
        rows.push(cells.join(" | "));
      }
    }
    return rows.join("\n");
  }

  async parse(input: ExtractionInput): Promise<ExtractionOutput> {
    const warnings: string[] = [];
    const maxChars = input.limits?.maxCharacters ?? 2_000_000;

    const result = await mammoth.convertToHtml({ buffer: input.buffer });
    const html = result.value;

    if (result.messages && result.messages.length > 0) {
      for (const msg of result.messages) {
        warnings.push(`Mammoth [${msg.type}]: ${msg.message}`);
      }
    }

    const blocks: ExtractionBlock[] = [];
    const tagRegex = /<(h[1-6]|p|table|li)(?:\s+[^>]*)?>(.*?)<\/\1>/gis;
    let match: RegExpExecArray | null;
    let totalCharacters = 0;

    while ((match = tagRegex.exec(html)) !== null) {
      const tag = match[1].toLowerCase();
      const content = match[2];
      let blockText = "";
      let type: ExtractionBlock["type"] = "paragraph";
      let level: number | undefined;

      if (tag.startsWith("h")) {
        type = "heading";
        level = parseInt(tag.substring(1), 10);
        blockText = content.replace(/<[^>]+>/g, "").trim();
      } else if (tag === "li") {
        type = "list";
        blockText = content.replace(/<[^>]+>/g, "").trim();
      } else if (tag === "table") {
        type = "table";
        blockText = this.extractTableText(content);
      } else {
        type = "paragraph";
        blockText = content.replace(/<[^>]+>/g, "").trim();
      }

      // Skip empty blocks
      if (!blockText) continue;

      if (totalCharacters + blockText.length > maxChars) {
        const allowedLen = maxChars - totalCharacters;
        if (allowedLen > 0) {
          blocks.push({
            type,
            text: blockText.substring(0, allowedLen) + "... [Truncated]",
            ...(level && { level }),
          });
        }
        warnings.push(`Character limit of ${maxChars} exceeded. Output truncated.`);
        break;
      }

      blocks.push({
        type,
        text: blockText,
        ...(level && { level }),
      });
      totalCharacters += blockText.length;
    }

    // Since DOCX doesn't have native "pages" like PDF, we put everything on page 1
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
        detectedLanguages: ["en"], // Default lang hint
        warnings,
        hasImageOnlyPages: false,
      },
      parserName: "mammoth",
      parserVersion: "1.8.0",
    };
  }
}
