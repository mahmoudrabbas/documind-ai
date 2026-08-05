/**
 * Server-side sanitizer for assistant/vision provider output.
 *
 * Reasoning-capable models sometimes leak internal chain-of-thought inside
 * tags such as `<think>...</think>` or `<analysis>...</analysis>`. This helper
 * strips those blocks before the answer is persisted, returned to the API
 * client, previewed in the conversation list, or replayed as RAG context.
 *
 * The sanitizer is deliberately provider-neutral and is applied unconditionally
 * as a defense-in-depth layer on top of the "final answer only" system
 * instruction. It is a pure function: it never logs the content it removes.
 */

export const REASONING_TAGS = ["think", "analysis"] as const;

export type ReasoningTag = (typeof REASONING_TAGS)[number];

/**
 * Removes complete and unclosed reasoning blocks for every known tag and
 * returns the trimmed remaining answer. Returns an empty string when nothing
 * usable remains (e.g. the provider only returned chain-of-thought).
 */
export function sanitizeAssistantOutput(text: string): string {
  if (typeof text !== "string" || text.length === 0) return "";

  let result = text;
  for (const tag of REASONING_TAGS) {
    result = stripReasoningTag(result, tag);
  }
  return result.trim();
}

/**
 * True when `text` contains a reasoning block that is opened but never closed
 * (including nested same-tag blocks with an unbalanced open). Such output has
 * no reliable boundary, so callers must not surface any part of it and should
 * retry the provider instead.
 */
export function hasUnclosedReasoningBlock(text: string): boolean {
  if (typeof text !== "string" || text.length === 0) return false;
  for (const tag of REASONING_TAGS) {
    const openings =
      text.match(new RegExp(`<\\s*${tag}\\b[^>]*>`, "gi")) ?? [];
    const closings =
      text.match(new RegExp(`<\\s*/\\s*${tag}\\s*>`, "gi")) ?? [];
    if (openings.length > closings.length) return true;
  }
  return false;
}

function stripReasoningTag(text: string, tag: string): string {
  let result = text;

  // Remove complete blocks starting with the innermost ones (a block whose
  // interior contains no further opening tag of the same kind). Looping lets
  // nested blocks of the same tag be unwrapped one level at a time, e.g.
  // <think>a <think>b</think> c</think>.
  const innermostBlock = new RegExp(
    `<\\s*${tag}\\b[^>]*>(?:(?!<\\s*${tag}\\b)[\\s\\S])*?<\\s*/\\s*${tag}\\s*>`,
    "gi",
  );
  let previous: string;
  do {
    previous = result;
    result = result.replace(innermostBlock, "");
  } while (result !== previous);

  // Remove unclosed blocks: everything from a dangling opening tag to the end.
  // A reasoning block without a closing tag has no reliable boundary, so the
  // conservative interpretation is to drop the remainder of the output.
  const unclosedBlock = new RegExp(`<\\s*${tag}\\b[^>]*>[\\s\\S]*$`, "i");
  result = result.replace(unclosedBlock, "");

  // Drop orphan closing tags that a partial block removal may have left behind.
  const orphanClosingTag = new RegExp(`<\\s*/\\s*${tag}\\s*>`, "gi");
  result = result.replace(orphanClosingTag, "");

  return result;
}
