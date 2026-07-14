import assert from "node:assert/strict";
import test from "node:test";
import { createStructuredLogger } from "./structuredLogger.js";

test("creates a structured logger for the API service", () => {
  const logger = createStructuredLogger("api");

  assert.ok(logger);
});
