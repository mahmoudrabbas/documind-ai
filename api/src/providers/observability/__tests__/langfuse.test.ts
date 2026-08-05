import test, { describe, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { getLangfuse, shutdownLangfuse } from "../langfuse.js";

describe("Langfuse Observability Provider", () => {
  const originalSecret = process.env.LANGFUSE_SECRET_KEY;
  const originalPublic = process.env.LANGFUSE_PUBLIC_KEY;
  const originalUrl = process.env.LANGFUSE_BASE_URL;

  beforeEach(() => {
    delete process.env.LANGFUSE_SECRET_KEY;
    delete process.env.LANGFUSE_PUBLIC_KEY;
    delete process.env.LANGFUSE_BASE_URL;
  });

  afterEach(async () => {
    if (originalSecret) process.env.LANGFUSE_SECRET_KEY = originalSecret;
    else delete process.env.LANGFUSE_SECRET_KEY;

    if (originalPublic) process.env.LANGFUSE_PUBLIC_KEY = originalPublic;
    else delete process.env.LANGFUSE_PUBLIC_KEY;

    if (originalUrl) process.env.LANGFUSE_BASE_URL = originalUrl;
    else delete process.env.LANGFUSE_BASE_URL;

    await shutdownLangfuse();
  });

  test("should return null when env vars are missing", () => {
    const instance = getLangfuse();
    assert.equal(instance, null);
  });

  test("should return null if secret key is missing", () => {
    process.env.LANGFUSE_PUBLIC_KEY = "pk-lf-test";
    const instance = getLangfuse();
    assert.equal(instance, null);
  });

  test("should return null if public key is missing", () => {
    process.env.LANGFUSE_SECRET_KEY = "sk-lf-test";
    const instance = getLangfuse();
    assert.equal(instance, null);
  });

  test("shutdownLangfuse should not throw when no instance exists", async () => {
    await assert.doesNotReject(() => shutdownLangfuse());
  });
});
