import { describe, test, expect } from "vitest";
import { generateIdempotencyKey } from "../generation.service.js";

describe("generation.service", () => {
  describe("generateIdempotencyKey", () => {
    test("produces a hex string", () => {
      const key = generateIdempotencyKey(1, "chunk", "abc123");
      expect(key).toMatch(/^[a-f0-9]{64}$/);
    });

    test("is deterministic for same inputs", () => {
      const k1 = generateIdempotencyKey(1, "chunk", "gen1");
      const k2 = generateIdempotencyKey(1, "chunk", "gen1");
      expect(k1).toBe(k2);
    });

    test("produces different keys for different stages", () => {
      const k1 = generateIdempotencyKey(1, "chunk", "gen1");
      const k2 = generateIdempotencyKey(1, "embed", "gen1");
      expect(k1).not.toBe(k2);
    });

    test("produces different keys for different generation IDs", () => {
      const k1 = generateIdempotencyKey(1, "chunk", "gen1");
      const k2 = generateIdempotencyKey(1, "chunk", "gen2");
      expect(k1).not.toBe(k2);
    });

    test("produces different keys for different versions", () => {
      const k1 = generateIdempotencyKey(1, "chunk", "gen1");
      const k2 = generateIdempotencyKey(2, "chunk", "gen1");
      expect(k1).not.toBe(k2);
    });
  });
});
