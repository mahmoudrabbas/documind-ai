import type { ExtractionBlock } from "../extractionContract.js";
import type { ChunkCandidate, ChunkingStrategy } from "../chunkingStrategy.js";
import { detectLanguage } from "../chunkingLanguageDetector.js";

export class ParagraphStrategy implements ChunkingStrategy {
  readonly name = "paragraph";

  canHandle(blocks: ExtractionBlock[]): boolean {
    return blocks.some((b) => b.type === "paragraph" || b.type === "list");
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
    const paragraphs = blocks.filter((b) => b.type === "paragraph" || b.type === "list");

    let currentText = "";
    let currentTokens = 0;
    let offsetStart = 0;

    for (const para of paragraphs) {
      const paraTokens = countTokens(para.text);

      if (currentTokens + paraTokens > targetTokens && currentText.length > 0) {
        if (currentTokens > hardCeiling) {
          const split = this.splitParagraph(
            currentText, offsetStart, pageNumber, targetTokens, hardCeiling, overlapTokens, countTokens,
          );
          candidates.push(...split);
        } else {
          candidates.push(this.buildCandidate(
            currentText.trim(), pageNumber, offsetStart, countTokens,
          ));
        }
        const overlapText = this.getOverlapTail(currentText, overlapTokens, countTokens);
        currentText = overlapText.length > 0 ? overlapText + "\n\n" + para.text : para.text;
        currentTokens = countTokens(currentText);
        offsetStart = para.sourceOffset ?? 0;
      } else {
        currentText = currentText.length > 0 ? currentText + "\n\n" + para.text : para.text;
        currentTokens += paraTokens;
      }
    }

    if (currentText.trim().length > 0) {
      if (currentTokens > hardCeiling) {
        const split = this.splitParagraph(
          currentText, offsetStart, pageNumber, targetTokens, hardCeiling, overlapTokens, countTokens,
        );
        candidates.push(...split);
      } else {
        candidates.push(this.buildCandidate(
          currentText.trim(), pageNumber, offsetStart, countTokens,
        ));
      }
    }

    return candidates;
  }

  private splitParagraph(
    text: string,
    offsetStart: number,
    pageNumber: number,
    targetTokens: number,
    hardCeiling: number,
    overlapTokens: number,
    countTokens: (text: string) => number,
  ): ChunkCandidate[] {
    const sentences = text.split(/(?<=[.!?؟])\s+/).filter((s) => s.trim().length > 0);
    const candidates: ChunkCandidate[] = [];
    let currentText = "";
    let currentTokens = 0;
    let partIndex = 0;

    for (const sentence of sentences) {
      const sentenceTokens = countTokens(sentence);
      if (currentTokens + sentenceTokens > hardCeiling && currentText.length > 0) {
        candidates.push(this.buildCandidate(
          currentText.trim(), pageNumber, offsetStart + partIndex, countTokens, partIndex,
        ));
        const overlapText = this.getOverlapTail(currentText, overlapTokens, countTokens);
        currentText = overlapText.length > 0 ? overlapText + " " + sentence : sentence;
        currentTokens = countTokens(currentText);
        partIndex++;
      } else {
        currentText = currentText.length > 0 ? currentText + " " + sentence : sentence;
        currentTokens += sentenceTokens;
      }
    }

    if (currentText.trim().length > 0) {
      candidates.push(this.buildCandidate(
        currentText.trim(), pageNumber, offsetStart + partIndex, countTokens, partIndex,
      ));
    }

    const partCount = candidates.length;
    for (const c of candidates) {
      c.partCount = partCount;
    }

    return candidates;
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
    pageNumber: number,
    offsetStart: number,
    countTokens: (text: string) => number,
    partIndex?: number,
  ): ChunkCandidate {
    return {
      text,
      sectionPath: [],
      pageStart: pageNumber,
      pageEnd: pageNumber,
      offsetStart,
      offsetEnd: offsetStart + text.length,
      contentType: "paragraph",
      language: detectLanguage(text),
      partIndex: partIndex ?? null,
      partCount: null,
      tokenCount: countTokens(text),
    };
  }
}
