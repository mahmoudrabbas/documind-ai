/**
 * Token budgeting with safe-boundary truncation.
 *
 * When an evidence item exceeds the remaining token budget, we truncate at
 * safe semantic boundaries (sentence ends, paragraph breaks, or clause
 * boundaries) rather than cutting mid-word or mid-sentence.
 */

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export interface TokenBudgetConfig {
  /** Maximum total tokens allowed in the evidence package. */
  maxTokens: number;
  /** Reserved tokens for the answer prompt (system prompt + question). */
  reservedTokens: number;
  /** Characters-per-token ratio for estimation (default: 4 for English, ~3 for Arabic). */
  charsPerToken: number;
}

export const DEFAULT_TOKEN_BUDGET_CONFIG: TokenBudgetConfig = {
  maxTokens: 4000,
  reservedTokens: 500,
  charsPerToken: 4,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface TokenBudgetItem {
  text: string;
  [key: string]: unknown;
}

export interface TokenBudgetResult<T extends TokenBudgetItem> {
  items: T[];
  totalTokens: number;
  budgetUsed: number;
  budgetRemaining: number;
  truncatedCount: number;
  truncatedTexts: string[];
}

/**
 * Fits items within a token budget, truncating at safe boundaries when needed.
 *
 * @param items - Items to fit within the budget (in priority order).
 * @param config - Budget configuration.
 * @returns Items that fit, with truncation metadata.
 */
export function fitWithinBudget<T extends TokenBudgetItem>(
  items: T[],
  config: TokenBudgetConfig = DEFAULT_TOKEN_BUDGET_CONFIG,
): TokenBudgetResult<T> {
  const availableTokens = config.maxTokens - config.reservedTokens;
  let remainingTokens = availableTokens;
  const selected: T[] = [];
  const truncatedTexts: string[] = [];
  let truncatedCount = 0;

  for (const item of items) {
    const estimatedTokens = estimateTokens(item.text, config.charsPerToken);

    if (estimatedTokens <= remainingTokens) {
      selected.push(item);
      remainingTokens -= estimatedTokens;
    } else if (remainingTokens > 50) {
      // Try to fit a truncated version
      const truncated = truncateAtSafeBoundary(item.text, remainingTokens, config.charsPerToken);
      if (truncated.length > 0) {
        selected.push({ ...item, text: truncated } as T);
        truncatedTexts.push(item.text);
        truncatedCount++;
        remainingTokens = 0;
      }
    }
    // If remaining tokens < 50, skip this item entirely
  }

  return {
    items: selected,
    totalTokens: availableTokens - remainingTokens,
    budgetUsed: ((availableTokens - remainingTokens) / availableTokens) * 100,
    budgetRemaining: remainingTokens,
    truncatedCount,
    truncatedTexts,
  };
}

/**
 * Estimates token count for a text string.
 */
export function estimateTokens(text: string, charsPerToken: number = 4): number {
  return Math.ceil(text.length / charsPerToken);
}

// ---------------------------------------------------------------------------
// Safe-boundary truncation
// ---------------------------------------------------------------------------

/**
 * Truncates text at a safe semantic boundary (sentence end, paragraph, or clause).
 *
 * @param text - The text to truncate.
 * @param maxTokens - Maximum tokens allowed.
 * @param charsPerToken - Characters per token ratio.
 * @returns Truncated text that fits within the token budget.
 */
export function truncateAtSafeBoundary(
  text: string,
  maxTokens: number,
  charsPerToken: number = 4,
): string {
  const maxChars = maxTokens * charsPerToken;

  if (text.length <= maxChars) return text;

  // Find the last safe boundary before maxChars
  const truncated = text.slice(0, maxChars);

  // Priority 1: Last paragraph break
  const lastParagraph = truncated.lastIndexOf("\n\n");
  if (lastParagraph > maxChars * 0.5) {
    return truncated.slice(0, lastParagraph).trim();
  }

  // Priority 2: Last sentence end (. ! ? 。 ! ?)
  const sentenceEnders = /[.!?。！？]\s/g;
  let lastSentenceEnd = -1;
  let match;
  while ((match = sentenceEnders.exec(truncated)) !== null) {
    lastSentenceEnd = match.index + 1;
  }
  if (lastSentenceEnd > maxChars * 0.5) {
    return truncated.slice(0, lastSentenceEnd).trim();
  }

  // Priority 3: Last clause boundary (; : — ,)
  const clauseEnders = /[;:—,]\s/g;
  let lastClauseEnd = -1;
  while ((match = clauseEnders.exec(truncated)) !== null) {
    lastClauseEnd = match.index + 1;
  }
  if (lastClauseEnd > maxChars * 0.3) {
    return truncated.slice(0, lastClauseEnd).trim();
  }

  // Priority 4: Last word boundary
  const lastSpace = truncated.lastIndexOf(" ");
  if (lastSpace > maxChars * 0.5) {
    return truncated.slice(0, lastSpace).trim() + "...";
  }

  // Fallback: hard cut with ellipsis
  return truncated.trim() + "...";
}
