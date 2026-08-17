import assert from "node:assert/strict";
import { describe, it } from "vitest";
import { chatRagV1Definition } from "../chatWorkflow.js";

describe("chat-rag-v1 token budget", () => {
  it("defines an explicit total-token budget", () => {
    const workflow = chatRagV1Definition();

    assert.deepEqual(workflow.metadata?.budget, {
      maxTotalTokens: 50_000,
    });
  });
});
