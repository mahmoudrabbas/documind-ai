import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { AppError } from "../../common/errors/AppError.js";
import {
  createVisionAdapter,
  setVisionAdapter,
} from "./visionAdapter.js";

const PREVIOUS_ENV: Record<string, string | undefined> = {};

beforeEach(() => {
  setVisionAdapter(null);
  for (const key of ["AI_PROVIDER", "GROQ_API_KEY", "GROQ_VISION_MODEL"]) {
    PREVIOUS_ENV[key] = process.env[key];
    delete process.env[key];
  }
});

function restoreEnv() {
  for (const key of ["AI_PROVIDER", "GROQ_API_KEY", "GROQ_VISION_MODEL"]) {
    if (PREVIOUS_ENV[key] === undefined) delete process.env[key];
    else process.env[key] = PREVIOUS_ENV[key];
  }
}

describe("createVisionAdapter", () => {
  it("uses qwen/qwen3.6-27b by default when GROQ_VISION_MODEL is unset", () => {
    process.env.AI_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "test-key";

    const adapter = createVisionAdapter();

    assert.equal(adapter.providerKey, "groq");
    assert.equal(adapter.model, "qwen/qwen3.6-27b");
    restoreEnv();
  });

  it("honors an explicitly configured GROQ_VISION_MODEL override", () => {
    process.env.AI_PROVIDER = "groq";
    process.env.GROQ_API_KEY = "test-key";
    process.env.GROQ_VISION_MODEL = "custom/vision-model-1";

    const adapter = createVisionAdapter();

    assert.equal(adapter.model, "custom/vision-model-1");
    restoreEnv();
  });

  it("throws a controlled VISION_UNAVAILABLE error when GROQ_API_KEY is missing", () => {
    process.env.AI_PROVIDER = "groq";

    assert.throws(
      () => createVisionAdapter(),
      (error: unknown) =>
        error instanceof AppError &&
        error.code === "VISION_UNAVAILABLE" &&
        error.statusCode === 503,
    );
    restoreEnv();
  });

  it("uses the fake adapter by default", () => {
    const adapter = createVisionAdapter();
    assert.equal(adapter.providerKey, "fake");
    restoreEnv();
  });
});
