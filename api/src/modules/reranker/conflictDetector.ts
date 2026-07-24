/**
 * Conflict detection — identifies chunks that present opposing or contradictory
 * information about the same topic within a document.
 *
 * Detection strategies:
 * 1. Negation presence: one chunk has negation terms, the other doesn't
 * 2. Semantic contradiction: same subject terms but opposing predicates
 * 3. Version conflict: different versions of the same document present different values
 */

import type { ConflictGroup } from "./reranker.types.js";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface ConflictDetectorConfig {
  /** Minimum text overlap (Jaccard) to consider two chunks as discussing the same topic. */
  topicSimilarityThreshold: number;
  /** Negation terms in English and Arabic. */
  negationTerms: string[];
  /** Value patterns that suggest numeric contradictions (e.g., salary amounts). */
  valuePatterns: RegExp[];
}

export const DEFAULT_CONFLICT_DETECTOR_CONFIG: ConflictDetectorConfig = {
  topicSimilarityThreshold: 0.3,
  negationTerms: [
    "not", "no", "never", "cannot", "must not", "shall not",
    "does not", "do not", "is not", "are not", "was not",
    "لا", "غير", "يجب عدم", "لن", "لم", "ليس",
  ],
  valuePatterns: [
    /\d[\d,]*\.?\d*\s*(SAR|USD|EUR|GBP|RY|rial)/gi,
    /\d[\d,]*\.?\d*\s*(percent|%)/gi,
  ],
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface ConflictDetectorInput {
  text: string;
  documentId: string;
  documentVersionId: string;
  sectionTitle?: string;
  [key: string]: unknown;
}

/**
 * Detects conflict groups among a set of evidence items.
 *
 * @param items - Items to analyze for conflicts.
 * @param config - Detection configuration.
 * @returns Array of conflict groups, each containing the indices of conflicting items.
 */
export function detectConflicts<T extends ConflictDetectorInput>(
  items: T[],
  config: ConflictDetectorConfig = DEFAULT_CONFLICT_DETECTOR_CONFIG,
): ConflictGroup[] {
  const conflicts: ConflictGroup[] = [];
  let conflictCounter = 0;

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const itemA = items[i]!;
      const itemB = items[j]!;

      // Only check conflicts within the same document
      if (itemA.documentId !== itemB.documentId) continue;

      const result = checkConflict(itemA, itemB, config);
      if (result.isConflict) {
        conflictCounter++;
        conflicts.push({
          conflictId: `conflict-${conflictCounter}`,
          description: result.description,
          itemIndices: [i, j],
        });
      }
    }
  }

  // Merge overlapping conflict groups (if A conflicts with B, and B with C)
  return mergeConflictGroups(conflicts);
}

// ---------------------------------------------------------------------------
// Conflict detection strategies
// ---------------------------------------------------------------------------

interface ConflictResult {
  isConflict: boolean;
  description: string;
  confidence: number;
}

function checkConflict<T extends ConflictDetectorInput>(
  itemA: T,
  itemB: T,
  config: ConflictDetectorConfig,
): ConflictResult {
  const termsA = tokenize(itemA.text);
  const termsB = tokenize(itemB.text);

  // Strategy 1: Negation asymmetry
  const negationResult = checkNegationConflict(termsA, termsB, config, itemA.text, itemB.text);
  if (negationResult.isConflict && negationResult.confidence > 0.6) {
    return negationResult;
  }

  // Strategy 2: Value contradiction
  const valueResult = checkValueConflict(itemA.text, itemB.text, config);
  if (valueResult.isConflict && valueResult.confidence > 0.7) {
    return valueResult;
  }

  // Strategy 3: Version conflict (different versions with similar topics)
  if (itemA.documentVersionId !== itemB.documentVersionId) {
    const topicOverlap = jaccardSimilarity(termsA, termsB);
    if (topicOverlap >= config.topicSimilarityThreshold) {
      return {
        isConflict: true,
        description: `Different document versions (v${itemA.documentVersionId.slice(-4)} vs v${itemB.documentVersionId.slice(-4)}) present different information about the same topic`,
        confidence: 0.5 + topicOverlap * 0.3,
      };
    }
  }

  return { isConflict: false, description: "", confidence: 0 };
}

function checkNegationConflict(
  termsA: string[],
  termsB: string[],
  config: ConflictDetectorConfig,
  rawTextA?: string,
  rawTextB?: string,
): ConflictResult {
  const hasNegA = matchesNegation(termsA, rawTextA, config.negationTerms);
  const hasNegB = matchesNegation(termsB, rawTextB, config.negationTerms);

  if (hasNegA === hasNegB) {
    return { isConflict: false, description: "", confidence: 0 };
  }

  const overlap = jaccardSimilarity(termsA, termsB);
  if (overlap < config.topicSimilarityThreshold) {
    return { isConflict: false, description: "", confidence: 0 };
  }

  return {
    isConflict: true,
    description: `Chunks have opposing statements: one affirms while the other negates the same topic (topic overlap: ${(overlap * 100).toFixed(0)}%)`,
    confidence: 0.6 + overlap * 0.3,
  };
}

function checkValueConflict(
  textA: string,
  textB: string,
  config: ConflictDetectorConfig,
): ConflictResult {
  for (const pattern of config.valuePatterns) {
    const valuesA = extractValues(textA, pattern);
    const valuesB = extractValues(textB, pattern);

    if (valuesA.length > 0 && valuesB.length > 0) {
      // Check if they extract different numeric values for the same pattern
      const numA = valuesA.map((v) => parseFloat(v.replace(/,/g, "")));
      const numB = valuesB.map((v) => parseFloat(v.replace(/,/g, "")));

      const hasDifferent = numA.some((a) =>
        numB.some((b) => a !== b && Math.abs(a - b) / Math.max(a, b) > 0.01),
      );

      if (hasDifferent) {
        return {
          isConflict: true,
          description: `Chunks contain different numeric values for the same metric (${valuesA.join(", ")} vs ${valuesB.join(", ")})`,
          confidence: 0.8,
        };
      }
    }
  }

  return { isConflict: false, description: "", confidence: 0 };
}

function extractValues(text: string, pattern: RegExp): string[] {
  const regex = new RegExp(pattern.source, pattern.flags);
  const matches: string[] = [];
  let match;
  while ((match = regex.exec(text)) !== null) {
    matches.push(match[0]);
  }
  return matches;
}

// ---------------------------------------------------------------------------
// Merge overlapping conflict groups
// ---------------------------------------------------------------------------

function mergeConflictGroups(groups: ConflictGroup[]): ConflictGroup[] {
  if (groups.length === 0) return [];

  // Build union-find for merging
  const parent = new Map<number, number>();
  for (const group of groups) {
    for (const idx of group.itemIndices) {
      if (!parent.has(idx)) parent.set(idx, idx);
    }
  }

  function find(x: number): number {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }

  function union(x: number, y: number): void {
    const rx = find(x);
    const ry = find(y);
    if (rx !== ry) parent.set(rx, ry);
  }

  for (const group of groups) {
    const indices = group.itemIndices;
    for (let i = 1; i < indices.length; i++) {
      union(indices[0]!, indices[i]!);
    }
  }

  // Group by root
  const grouped = new Map<number, number[]>();
  for (const idx of parent.keys()) {
    const root = find(idx);
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root)!.push(idx);
  }

  // Build merged groups
  const merged: ConflictGroup[] = [];
  let counter = 0;
  for (const indices of grouped.values()) {
    if (indices.length < 2) continue;
    counter++;
    merged.push({
      conflictId: `conflict-${counter}`,
      description: `Group of ${indices.length} conflicting chunks`,
      itemIndices: indices.sort((a, b) => a - b),
    });
  }

  return merged;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF]/g, " ")
    .split(/\s+/)
    .filter((t) => t.length > 1);
}

function matchesNegation(
  terms: string[],
  rawText: string | undefined,
  negationTerms: string[],
): boolean {
  const termSet = new Set(terms);
  for (const neg of negationTerms) {
    const words = neg.split(/\s+/);
    if (words.length === 1) {
      if (termSet.has(words[0]!)) return true;
    } else if (rawText) {
      if (rawText.toLowerCase().includes(neg)) return true;
    }
  }
  return false;
}

function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  let intersection = 0;
  for (const word of setA) {
    if (setB.has(word)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
