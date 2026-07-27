import type { ExtractionBlock } from "../extractionContract.js";
import type { ChunkCandidate, ChunkingStrategy } from "../chunkingStrategy.js";
import { detectLanguage } from "../chunkingLanguageDetector.js";

interface Section {
  headingPath: string[];
  blocks: ExtractionBlock[];
}

export class StructuralStrategy implements ChunkingStrategy {
  readonly name = "structural";

  canHandle(blocks: ExtractionBlock[]): boolean {
    return blocks.some((b) => b.type === "heading");
  }

  chunk(
    blocks: ExtractionBlock[],
    pageNumber: number,
    targetTokens: number,
    hardCeiling: number,
    overlapTokens: number,
    countTokens: (text: string) => number,
  ): ChunkCandidate[] {
    const candidates: ChunkCandidate[] = [];
    const sections = this.groupByHeadings(blocks);

    for (const section of sections) {
      const sectionPath = section.headingPath;
      const sectionText = section.blocks.map((b) => b.text).join("\n\n");
      const tokenCount = countTokens(sectionText);

      if (tokenCount <= hardCeiling) {
        candidates.push({
          text: sectionText,
          sectionPath,
          pageStart: pageNumber,
          pageEnd: pageNumber,
          offsetStart: section.blocks[0]?.sourceOffset ?? 0,
          offsetEnd: section.blocks[section.blocks.length - 1]?.sourceOffset ?? sectionText.length,
          contentType: this.classifySection(section.blocks),
          language: detectLanguage(sectionText),
          partIndex: null,
          partCount: null,
          tokenCount,
        });
      } else {
        const split = this.splitOversizedSection(
          section, pageNumber, targetTokens, hardCeiling, overlapTokens, countTokens,
        );
        candidates.push(...split);
      }
    }

    return candidates;
  }

  private groupByHeadings(blocks: ExtractionBlock[]): Section[] {
    const sections: Section[] = [];
    let current: Section = { headingPath: [], blocks: [] };

    for (const block of blocks) {
      if (block.type === "heading") {
        if (current.blocks.length > 0 || current.headingPath.length > 0) {
          sections.push(current);
        }
        const level = block.level ?? 1;
        const headingPath = [...current.headingPath.slice(0, level - 1), block.text];
        current = { headingPath, blocks: [block] };
      } else {
        current.blocks.push(block);
      }
    }

    if (current.blocks.length > 0) {
      sections.push(current);
    }

    return sections;
  }

  private classifySection(blocks: ExtractionBlock[]): ChunkCandidate["contentType"] {
    if (blocks.length === 1 && blocks[0].type === "table") return "table";
    if (blocks.length === 1 && blocks[0].type === "list") return "list";
    if (blocks.some((b) => b.type === "heading")) return "heading";
    return "paragraph";
  }

  private splitOversizedSection(
    section: Section,
    pageNumber: number,
    targetTokens: number,
    hardCeiling: number,
    overlapTokens: number,
    countTokens: (text: string) => number,
  ): ChunkCandidate[] {
    const allText = section.blocks.map((b) => b.text).join("\n\n");
    const sentences = this.splitIntoSentences(allText);
    const candidates: ChunkCandidate[] = [];
    let currentText = "";
    let currentTokens = 0;
    let partIndex = 0;

    for (const sentence of sentences) {
      const sentenceTokens = countTokens(sentence);
      if (currentTokens + sentenceTokens > hardCeiling && currentText.length > 0) {
        candidates.push(this.buildCandidate(
          currentText.trim(), section.headingPath, pageNumber, partIndex++, countTokens,
        ));
        const overlapText = this.getOverlapTail(currentText, overlapTokens, countTokens);
        currentText = overlapText + "\n\n" + sentence;
        currentTokens = countTokens(currentText);
      } else {
        currentText = currentText.length > 0 ? currentText + "\n\n" + sentence : sentence;
        currentTokens += sentenceTokens;
      }
    }

    if (currentText.trim().length > 0) {
      candidates.push(this.buildCandidate(
        currentText.trim(), section.headingPath, pageNumber, partIndex++, countTokens,
      ));
    }

    const finalCount = candidates.length;
    for (const c of candidates) {
      c.partCount = finalCount;
    }

    return candidates;
  }

  private splitIntoSentences(text: string): string[] {
    return text
      .split(/(?<=[.!?؟])\s+/)
      .filter((s) => s.trim().length > 0);
  }

  private getOverlapTail(text: string, overlapTokens: number, countTokens: (text: string) => number): string {
    const sentences = text.split(/(?<=[.!?؟])\s+/);
    let result = "";
    for (let i = sentences.length - 1; i >= 0; i--) {
      const candidate = sentences[i] + (result ? " " + result : "");
      if (countTokens(candidate) > overlapTokens && result.length > 0) break;
      result = candidate;
    }
    return result;
  }

  private buildCandidate(
    text: string,
    sectionPath: string[],
    pageNumber: number,
    partIndex: number,
    countTokens: (text: string) => number,
  ): ChunkCandidate {
    return {
      text,
      sectionPath,
      pageStart: pageNumber,
      pageEnd: pageNumber,
      offsetStart: 0,
      offsetEnd: text.length,
      contentType: "clause",
      language: detectLanguage(text),
      partIndex,
      partCount: null,
      tokenCount: countTokens(text),
    };
  }
}
