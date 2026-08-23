import assert from "node:assert/strict";
import test from "node:test";
import {
  COPILOT_RATE_LIMIT_MAX_REQUESTS,
  COPILOT_RATE_LIMIT_WINDOW_MS,
} from "./copilot.routes.js";

test("Copilot mutating routes allow 100 requests per minute", () => {
  assert.equal(COPILOT_RATE_LIMIT_WINDOW_MS, 60_000);
  assert.equal(COPILOT_RATE_LIMIT_MAX_REQUESTS, 100);
});
