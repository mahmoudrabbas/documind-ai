import type { ExtractionBlock } from "../extractionContract.js";
import type { ChunkCandidate, ChunkingStrategy } from "../chunkingStrategy.js";
import { detectLanguage } from "../chunkingLanguageDetector.js";

export class TableStrategy implements ChunkingStrategy {
  readonly name = "table";

  canHandle(blocks: ExtractionBlock[]): boolean {
    return blocks.some((b) => b.type === "table");
  }

  chunk(
    blocks: ExtractionBlock[],
    pageNumber: number,
    _targetTokens: number,
    hardCeiling: number,
    _overlapTokens: number,
    countTokens: (text: string) => number,
  ): ChunkCandidate[] {
    const candidates: ChunkCandidate[] = [];
    const tables = blocks.filter((b) => b.type === "table");

    for (const table of tables) {
      const rows = this.extractTableRows(table.text);
      const headerRow = rows[0] ?? [];
      const headerText = headerRow.join(" | ");

      if (countTokens(table.text) <= hardCeiling) {
        candidates.push({
          text: table.text,
          sectionPath: [],
          pageStart: pageNumber,
          pageEnd: pageNumber,
          offsetStart: table.sourceOffset ?? 0,
          offsetEnd: (table.sourceOffset ?? 0) + table.text.length,
          contentType: "table",
          language: detectLanguage(table.text),
          partIndex: null,
          partCount: null,
          tokenCount: countTokens(table.text),
        });
      } else {
        const dataRows = rows.slice(1);
        const chunkedRows: string[][][] = [];
        let currentChunk: string[][] = [headerRow];
        let currentTokens = countTokens(headerText);

        for (const row of dataRows) {
          const rowText = row.join(" | ");
          const rowTokens = countTokens(rowText);
          if (currentTokens + rowTokens > hardCeiling && currentChunk.length > 1) {
            chunkedRows.push(currentChunk);
            currentChunk = [headerRow, row];
            currentTokens = countTokens(headerText) + rowTokens;
          } else {
            currentChunk.push(row);
            currentTokens += rowTokens;
          }
        }
        if (currentChunk.length > 0) chunkedRows.push(currentChunk);

        const partCount = chunkedRows.length;
        chunkedRows.forEach((chunkRows, i) => {
          const text = chunkRows.map((r) => r.join(" | ")).join("\n");
          candidates.push({
            text,
            sectionPath: [],
            pageStart: pageNumber,
            pageEnd: pageNumber,
            offsetStart: table.sourceOffset ?? 0,
            offsetEnd: (table.sourceOffset ?? 0) + text.length,
            contentType: "table",
            language: detectLanguage(text),
            partIndex: i + 1,
            partCount,
            tokenCount: countTokens(text),
          });
        });
      }
    }

    return candidates;
  }

  private extractTableRows(text: string): string[][] {
    return text
      .split("\n")
      .filter((line) => line.trim().length > 0)
      .map((line) =>
        line
          .split(/[|\t]/)
          .map((cell) => cell.trim())
          .filter((cell) => cell.length > 0),
      );
  }
}
