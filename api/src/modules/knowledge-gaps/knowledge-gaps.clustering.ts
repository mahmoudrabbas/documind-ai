import crypto from "crypto";

const STOP_WORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "be", "been", "being", "and", "or", "but",
  "have", "has", "had", "do", "does", "did", "to", "at", "by", "for",
  "with", "about", "against", "between", "into", "through", "during",
  "before", "after", "above", "below", "to", "from", "up", "down",
  "in", "out", "on", "off", "over", "under", "again", "further",
  "then", "once", "what", "where", "when", "why", "how", "all", "any",
  "both", "each", "few", "more", "most", "other", "some", "such",
  "no", "nor", "not", "only", "own", "same", "so", "than", "too",
  "very", "can", "will", "just", "should", "now", "my", "our", "your",
]);

/**
 * Normalizes question text for clustering: lowercase, remove punctuation, collapse whitespace.
 */
export function normalizeQuestion(text: string): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^\w\s\u0600-\u06FF]/g, " ") // keep alphanumeric and Arabic characters
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tokenizes text into significant words (excluding common stop words).
 */
export function extractSignificantTokens(text: string): string[] {
  const normalized = normalizeQuestion(text);
  if (!normalized) return [];
  const words = normalized.split(" ");
  return words.filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

/**
 * Generates a deterministic cluster key based on sorted significant tokens.
 */
export function generateClusterKey(normalizedText: string): string {
  const tokens = extractSignificantTokens(normalizedText);
  if (tokens.length === 0) {
    const hash = crypto.createHash("sha256").update(normalizedText).digest("hex").slice(0, 16);
    return `cluster_${hash}`;
  }

  const sortedTokens = [...new Set(tokens)].sort();
  const tokenString = sortedTokens.join("_");
  const hash = crypto.createHash("sha256").update(tokenString).digest("hex").slice(0, 16);
  return `cluster_${sortedTokens.slice(0, 3).join("_")}_${hash}`;
}

/**
 * Calculates Jaccard similarity score between two texts (range 0.0 to 1.0).
 */
export function calculateSimilarity(textA: string, textB: string): number {
  const tokensA = new Set(extractSignificantTokens(textA));
  const tokensB = new Set(extractSignificantTokens(textB));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersectionCount = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) intersectionCount++;
  }

  const unionSize = new Set([...tokensA, ...tokensB]).size;
  return unionSize > 0 ? Number((intersectionCount / unionSize).toFixed(2)) : 0;
}

export const CLUSTER_SIMILARITY_THRESHOLD = 0.6;
