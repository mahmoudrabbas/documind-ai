import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeAssistantOutput,
  hasUnclosedReasoningBlock,
  REASONING_TAGS,
} from "./outputSanitizer.js";

describe("sanitizeAssistantOutput", () => {
  it("strips a complete think block and keeps the final answer", () => {
    const result = sanitizeAssistantOutput(
      "<think>Let me reason step by step.</think>The invoice total is $120.",
    );
    assert.equal(result, "The invoice total is $120.");
  });

  it("strips multiline think blocks", () => {
    const result = sanitizeAssistantOutput(
      "<think>\nStep one...\nStep two...\n</think>\n\nThe answer is 42.",
    );
    assert.equal(result, "The answer is 42.");
  });

  it("strips case-insensitive and mixed-case tags", () => {
    assert.equal(
      sanitizeAssistantOutput("<THINK>hidden</THINK>Visible"),
      "Visible",
    );
    assert.equal(
      sanitizeAssistantOutput("<ThInk>hidden</tHiNk>Visible"),
      "Visible",
    );
  });

  it("strips complete analysis blocks", () => {
    const result = sanitizeAssistantOutput(
      "<analysis>Token-level reasoning...</analysis>Final answer.",
    );
    assert.equal(result, "Final answer.");
  });

  it("handles an unclosed think block by dropping the remainder", () => {
    const result = sanitizeAssistantOutput(
      "The total is 42.<think>internal chain-of-thought that never closes",
    );
    assert.equal(result, "The total is 42.");
  });

  it("handles an unclosed analysis block", () => {
    const result = sanitizeAssistantOutput(
      "Answer here.<analysis>partial reasoning",
    );
    assert.equal(result, "Answer here.");
  });

  it("leaves ordinary content unchanged", () => {
    const input = "This is a plain answer about onboarding.";
    assert.equal(sanitizeAssistantOutput(input), input);
  });

  it("preserves the final Arabic answer and removes the reasoning prefix", () => {
    const result = sanitizeAssistantOutput(
      "<think>أفكر في الخطوات</think>الجواب النهائي هو ١٠٠.",
    );
    assert.equal(result, "الجواب النهائي هو ١٠٠.");
  });

  it("preserves Markdown in the final answer", () => {
    const result = sanitizeAssistantOutput(
      "<think>reasoning</think>\n\n## Summary\n\n- Point one\n- Point two\n\n```ts\nconst x = 1;\n```",
    );
    assert.equal(
      result,
      "## Summary\n\n- Point one\n- Point two\n\n```ts\nconst x = 1;\n```",
    );
  });

  it("returns an empty string when only reasoning remains", () => {
    assert.equal(
      sanitizeAssistantOutput("<think>Only chain-of-thought</think>"),
      "",
    );
    assert.equal(
      sanitizeAssistantOutput(
        "<analysis>only analysis</analysis>\n<think>only thinking</think>",
      ),
      "",
    );
  });

  it("returns an empty string for empty or non-string input", () => {
    assert.equal(sanitizeAssistantOutput(""), "");
    assert.equal(sanitizeAssistantOutput("   "), "");
    assert.equal(
      sanitizeAssistantOutput(null as unknown as string),
      "",
    );
  });

  it("removes nested same-tag reasoning blocks", () => {
    const result = sanitizeAssistantOutput(
      "<think>a <think>inner</think> c</think>Final.",
    );
    assert.equal(result, "Final.");
  });

  it("cleans up an orphan closing tag left by partial removal", () => {
    const result = sanitizeAssistantOutput(
      "<think>a <think>b</think> c</think>Final.</think>",
    );
    assert.equal(result, "Final.");
  });

  it("exposes the known reasoning tags", () => {
    assert.deepEqual([...REASONING_TAGS], ["think", "analysis"]);
  });
});

describe("hasUnclosedReasoningBlock", () => {
  it("is false for complete reasoning blocks", () => {
    assert.equal(
      hasUnclosedReasoningBlock(
        "<think>reasoning</think><analysis>more</analysis>Final.",
      ),
      false,
    );
  });

  it("is true when a reasoning block is opened but never closed", () => {
    assert.equal(
      hasUnclosedReasoningBlock("Incomplete.<think>never closes"),
      true,
    );
    assert.equal(
      hasUnclosedReasoningBlock("Incomplete.<analysis>never closes"),
      true,
    );
  });

  it("is true for nested same-tag blocks with an unbalanced open", () => {
    assert.equal(
      hasUnclosedReasoningBlock("<think>a <think>inner</think>"),
      true,
    );
  });

  it("is false when an unclosed block has no matching tag at all", () => {
    assert.equal(hasUnclosedReasoningBlock("Plain text, no tags."), false);
    assert.equal(hasUnclosedReasoningBlock(""), false);
  });
});
