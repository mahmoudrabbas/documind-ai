import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { AppError } from "../../common/errors/AppError.js";
import { ToolRegistry } from "./toolRegistry.js";

test("ToolRegistry preserves AppError codes from failed tools", async () => {
  const registry = new ToolRegistry();
  registry.register({
    schema: {
      name: "failing-retrieval",
      version: "1.0.0",
      description: "Fails with a canonical retrieval error",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
    },
    handler: async () => {
      throw new AppError(
        503,
        "RETRIEVAL_UNAVAILABLE",
        "Document search is unavailable",
      );
    },
  });

  const result = await registry.execute(
    {
      tenantId: "1",
      actorId: "1",
      traceId: "t",
      requestId: "r",
      workflowName: "w",
      agentName: "a",
    },
    "failing-retrieval",
    {},
    async () => true,
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.error, {
    code: "RETRIEVAL_UNAVAILABLE",
    message: "Document search is unavailable",
  });
});

// The copilot reads structured details off a failed tool call to decide what to
// ask the user next, so they have to survive the registry - while an AppError
// without details keeps the two-key shape asserted above.
test("ToolRegistry forwards AppError details when the error carries them", async () => {
  const registry = new ToolRegistry();
  registry.register({
    schema: {
      name: "needs-input",
      version: "1.0.0",
      description: "Fails asking for missing parameters",
      inputSchema: z.object({}),
      outputSchema: z.object({}),
    },
    handler: async () => {
      throw new AppError(400, "ACTION_NEEDS_INPUT", "Missing parameters", {
        missing: ["name", "baseRole"],
      });
    },
  });

  const result = await registry.execute(
    {
      tenantId: "1",
      actorId: "1",
      traceId: "t",
      requestId: "r",
      workflowName: "w",
      agentName: "a",
    },
    "needs-input",
    {},
    async () => true,
  );

  assert.equal(result.ok, false);
  assert.deepEqual(result.error, {
    code: "ACTION_NEEDS_INPUT",
    message: "Missing parameters",
    details: { missing: ["name", "baseRole"] },
  });
});
