import type { QualityIssue, QualityStatus } from "./processing.types.js";

export interface QualityThresholds {
  lowConfidenceThreshold: number;
  criticalConfidenceThreshold: number;
  minTextLengthPerPage: number;
  maxDuplicateSimilarity: number;
  blankPageTextLength: number;
  garbledTextRatio: number;
}

const DEFAULT_THRESHOLDS: QualityThresholds = {
  lowConfidenceThreshold: 0.7,
  criticalConfidenceThreshold: 0.4,
  minTextLengthPerPage: 10,
  maxDuplicateSimilarity: 0.95,
  blankPageTextLength: 5,
  garbledTextRatio: 0.3,
};

export interface PageExtractionData {
  pageNumber: number;
  text: string;
  characterCount: number;
  blockCount: number;
  hasImageOnlyPages: boolean;
}

export interface OcrPageData {
  pageNumber: number;
  text: string;
  confidence: number;
  language: string;
  warnings: string[];
}

export interface QualityAnalysisInput {
  totalPages: number;
  extractionPages: PageExtractionData[];
  ocrPages: OcrPageData[];
  detectedLanguages: string[];
  extractionWarnings: string[];
  thresholds?: Partial<QualityThresholds>;
}

export interface QualityAnalysisResult {
  overallConfidence: number;
  qualityStatus: QualityStatus;
  issues: QualityIssue[];
  pageConfidences: Record<string, number>;
  pageStatuses: Record<string, QualityStatus>;
  summary: string;
  requiresReview: boolean;
}

function detectBlankPages(pages: PageExtractionData[], blankThreshold: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const page of pages) {
    if (page.text.trim().length <= blankThreshold) {
      issues.push({
        type: "blank_page",
        severity: "warning",
        message: `Page ${page.pageNumber} appears to be blank or has minimal content (${page.text.trim().length} characters).`,
        pageNumber: page.pageNumber,
      });
    }
  }
  return issues;
}

function detectLowTextDensity(pages: PageExtractionData[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const page of pages) {
    if (page.blockCount === 0 && page.characterCount > 0) {
      issues.push({
        type: "low_text_density",
        severity: "info",
        message: `Page ${page.pageNumber} has text content but no structured blocks detected.`,
        pageNumber: page.pageNumber,
      });
    }
  }
  return issues;
}

function detectGarbledText(pages: PageExtractionData[], ratioThreshold: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const page of pages) {
    const text = page.text;
    if (text.length === 0) continue;

    const garbledChars = text.match(/[^\w\s\u0600-\u06FF\u0020-\u007E.,;:!?'"()[\]{}\-+*/=<>@#$%^&|\\~`]/g);
    const garbledRatio = garbledChars ? garbledChars.length / text.length : 0;

    if (garbledRatio > ratioThreshold) {
      issues.push({
        type: "garbled_text",
        severity: "critical",
        message: `Page ${page.pageNumber} contains ${Math.round(garbledRatio * 100)}% garbled/unreadable characters.`,
        pageNumber: page.pageNumber,
      });
    }
  }
  return issues;
}

function detectDuplicates(pages: PageExtractionData[], similarityThreshold: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  const seen = new Map<string, number>();

  for (const page of pages) {
    const normalized = page.text.toLowerCase().trim().replace(/\s+/g, " ");
    if (normalized.length < 10) continue;

    for (const [existingText, existingPageNum] of seen) {
      const similarity = calculateSimilarity(normalized, existingText);
      if (similarity >= similarityThreshold) {
        issues.push({
          type: "duplicated_page",
          severity: "warning",
          message: `Page ${page.pageNumber} appears to be a duplicate of page ${existingPageNum} (${Math.round(similarity * 100)}% similar).`,
          pageNumber: page.pageNumber,
        });
        break;
      }
    }
    seen.set(normalized, page.pageNumber);
  }
  return issues;
}

function calculateSimilarity(a: string, b: string): number {
  if (a === b) return 1;
  if (a.length === 0 || b.length === 0) return 0;

  const shorter = a.length < b.length ? a : b;
  const longer = a.length < b.length ? b : a;

  let matches = 0;
  const shorterWords = shorter.split(" ");
  const longerWords = new Set(longer.split(" "));

  for (const word of shorterWords) {
    if (longerWords.has(word)) matches++;
  }

  return matches / shorterWords.length;
}

function detectOcrLowConfidence(ocrPages: OcrPageData[], threshold: number): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const page of ocrPages) {
    if (page.confidence < threshold) {
      issues.push({
        type: "low_confidence",
        severity: page.confidence < 0.4 ? "critical" : "warning",
        message: `Page ${page.pageNumber} OCR confidence is ${Math.round(page.confidence * 100)}%, below threshold of ${Math.round(threshold * 100)}%.`,
        pageNumber: page.pageNumber,
      });
    }
  }
  return issues;
}

function detectOcrWarnings(ocrPages: OcrPageData[]): QualityIssue[] {
  const issues: QualityIssue[] = [];
  for (const page of ocrPages) {
    for (const warning of page.warnings) {
      issues.push({
        type: "low_confidence",
        severity: "warning",
        message: `Page ${page.pageNumber}: ${warning}`,
        pageNumber: page.pageNumber,
      });
    }
  }
  return issues;
}

function calculateOverallConfidence(
  extractionPages: PageExtractionData[],
  ocrPages: OcrPageData[],
  totalPages: number,
): number {
  if (totalPages === 0) return 0;

  let totalConfidence = 0;
  let countedPages = 0;

  for (const ocrPage of ocrPages) {
    totalConfidence += ocrPage.confidence;
    countedPages++;
  }

  for (const extPage of extractionPages) {
    const hasOcr = ocrPages.some((o) => o.pageNumber === extPage.pageNumber);
    if (!hasOcr) {
      const hasContent = extPage.text.trim().length > 10;
      totalConfidence += hasContent ? 0.9 : 0.3;
      countedPages++;
    }
  }

  return countedPages > 0 ? totalConfidence / countedPages : 0;
}

function calculatePageConfidences(
  extractionPages: PageExtractionData[],
  ocrPages: OcrPageData[],
): Record<string, number> {
  const confidences: Record<string, number> = {};

  for (const ocrPage of ocrPages) {
    confidences[String(ocrPage.pageNumber)] = ocrPage.confidence;
  }

  for (const extPage of extractionPages) {
    const key = String(extPage.pageNumber);
    if (!(key in confidences)) {
      const hasContent = extPage.text.trim().length > 10;
      confidences[key] = hasContent ? 0.9 : 0.3;
    }
  }

  return confidences;
}

function determineQualityStatus(
  overallConfidence: number,
  issues: QualityIssue[],
  _thresholds: QualityThresholds,
): { status: QualityStatus; requiresReview: boolean } {
  const criticalIssues = issues.filter((i) => i.severity === "critical");
  const warningIssues = issues.filter((i) => i.severity === "warning");

  if (criticalIssues.length > 0) {
    return { status: "REVIEW_REQUIRED", requiresReview: true };
  }

  if (overallConfidence < _thresholds.criticalConfidenceThreshold) {
    return { status: "REVIEW_REQUIRED", requiresReview: true };
  }

  if (overallConfidence < _thresholds.lowConfidenceThreshold || warningIssues.length > 0) {
    return { status: "READY_WITH_WARNINGS", requiresReview: false };
  }

  if (issues.length === 0 && overallConfidence >= _thresholds.lowConfidenceThreshold) {
    return { status: "READY_FOR_INDEXING", requiresReview: false };
  }

  return { status: "READY", requiresReview: false };
}

function calculatePageStatuses(
  pageConfidences: Record<string, number>,
  issues: QualityIssue[],
  thresholds: QualityThresholds,
): Record<string, QualityStatus> {
  const statuses: Record<string, QualityStatus> = {};

  for (const [pageNum, confidence] of Object.entries(pageConfidences)) {
    const pageIssues = issues.filter((i) => i.pageNumber === parseInt(pageNum));
    const criticalPageIssues = pageIssues.filter((i) => i.severity === "critical");
    const warningPageIssues = pageIssues.filter((i) => i.severity === "warning");

    if (criticalPageIssues.length > 0 || confidence < thresholds.criticalConfidenceThreshold) {
      statuses[pageNum] = "REVIEW_REQUIRED";
    } else if (warningPageIssues.length > 0 || confidence < thresholds.lowConfidenceThreshold) {
      statuses[pageNum] = "READY_WITH_WARNINGS";
    } else {
      statuses[pageNum] = "READY";
    }
  }

  return statuses;
}

function generateSummary(
  qualityStatus: QualityStatus,
  overallConfidence: number,
  issues: QualityIssue[],
  totalPages: number,
): string {
  const confidencePercent = Math.round(overallConfidence * 100);
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const warningCount = issues.filter((i) => i.severity === "warning").length;

  const parts: string[] = [];
  parts.push(`Document quality: ${qualityStatus} (${confidencePercent}% confidence).`);
  parts.push(`${totalPages} pages analyzed.`);

  if (criticalCount > 0) {
    parts.push(`${criticalCount} critical issue(s) requiring review.`);
  }
  if (warningCount > 0) {
    parts.push(`${warningCount} warning(s) detected.`);
  }
  if (issues.length === 0) {
    parts.push("No quality issues detected.");
  }

  return parts.join(" ");
}

export function analyzeDocumentQuality(input: QualityAnalysisInput): QualityAnalysisResult {
  const thresholds = { ...DEFAULT_THRESHOLDS, ...input.thresholds };

  const allIssues: QualityIssue[] = [
    ...detectBlankPages(input.extractionPages, thresholds.blankPageTextLength),
    ...detectLowTextDensity(input.extractionPages),
    ...detectGarbledText(input.extractionPages, thresholds.garbledTextRatio),
    ...detectDuplicates(input.extractionPages, thresholds.maxDuplicateSimilarity),
    ...detectOcrLowConfidence(input.ocrPages, thresholds.lowConfidenceThreshold),
    ...detectOcrWarnings(input.ocrPages),
  ];

  const overallConfidence = calculateOverallConfidence(
    input.extractionPages,
    input.ocrPages,
    input.totalPages,
  );

  const pageConfidences = calculatePageConfidences(input.extractionPages, input.ocrPages);

  const { status: qualityStatus, requiresReview } = determineQualityStatus(
    overallConfidence,
    allIssues,
    thresholds,
  );

  const pageStatuses = calculatePageStatuses(pageConfidences, allIssues, thresholds);

  const summary = generateSummary(qualityStatus, overallConfidence, allIssues, input.totalPages);

  return {
    overallConfidence,
    qualityStatus,
    issues: allIssues,
    pageConfidences,
    pageStatuses,
    summary,
    requiresReview,
  };
}
