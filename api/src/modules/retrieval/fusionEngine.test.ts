import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { FusionEngine } from "./fusionEngine.js";
import type { RetrievalMethod } from "./retrieval.types.js";

describe("FusionEngine", () => {
  it("fuse two result lists with overlapping chunkIds — B ranked first", () => {
    const engine = new FusionEngine();

    const results = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      [
        "vector",
        [
          { chunkId: "A", score: 0.9 },
          { chunkId: "B", score: 0.8 },
        ],
      ],
      [
        "keyword",
        [
          { chunkId: "B", score: 0.95 },
          { chunkId: "C", score: 0.7 },
        ],
      ],
    ]);

    const candidates = engine.fuse(results);

    // B appears in both lists -> highest RRF score
    assert.equal(candidates[0]!.chunkId, "B");
    assert.equal(candidates[1]!.chunkId, "A");
    assert.equal(candidates[2]!.chunkId, "C");

    // Scores must be in descending order
    assert.ok(candidates[0]!.score > candidates[1]!.score);
    assert.ok(candidates[1]!.score > candidates[2]!.score);
  });

  it("single strategy — passthrough without fusion overhead", () => {
    const engine = new FusionEngine();

    const results = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      [
        "vector",
        [
          { chunkId: "A", score: 0.9 },
          { chunkId: "B", score: 0.8 },
        ],
      ],
    ]);

    const candidates = engine.fuse(results);

    assert.equal(candidates.length, 2);
    assert.equal(candidates[0]!.chunkId, "A");
    assert.equal(candidates[1]!.chunkId, "B");
    // Passthrough preserves original scores
    assert.equal(candidates[0]!.score, 0.9);
    assert.equal(candidates[1]!.score, 0.8);
  });

  it("empty result lists — returns empty array", () => {
    const engine = new FusionEngine();

    const results = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      ["vector", []],
      ["keyword", []],
    ]);

    const candidates = engine.fuse(results);

    assert.deepEqual(candidates, []);
  });

  it("weighted fusion — vector weight 2, keyword weight 1", () => {
    const engine = new FusionEngine({
      strategies: [
        { method: "vector", weight: 2 },
        { method: "keyword", weight: 1 },
      ],
      rrfK: 60,
      maxCandidates: 10,
    });

    const results = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      [
        "vector",
        [{ chunkId: "A", score: 0.9 }],
      ],
      [
        "keyword",
        [{ chunkId: "B", score: 0.9 }],
      ],
    ]);

    const candidates = engine.fuse(results);

    assert.equal(candidates.length, 2);
    // A gets 2/(60+1) = 2/61, B gets 1/(60+1) = 1/61 -> A should rank first
    assert.equal(candidates[0]!.chunkId, "A");
    assert.equal(candidates[1]!.chunkId, "B");
    assert.ok(candidates[0]!.score > candidates[1]!.score);
    // A's score should be exactly 2x B's score
    assert.equal(candidates[0]!.score, 2 * candidates[1]!.score);
  });

  it("maxCandidates cap limits output", () => {
    const engine = new FusionEngine({ maxCandidates: 2 });

    const results = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      [
        "vector",
        [
          { chunkId: "A", score: 0.9 },
          { chunkId: "B", score: 0.8 },
          { chunkId: "C", score: 0.7 },
        ],
      ],
      [
        "keyword",
        [
          { chunkId: "D", score: 0.95 },
          { chunkId: "E", score: 0.85 },
        ],
      ],
    ]);

    const candidates = engine.fuse(results);

    assert.equal(candidates.length, 2);
  });

  it("determinism — shuffled input produces same output", () => {
    const engine = new FusionEngine();
    // Use overlapping data to ensure unique RRF scores (no ties)
    const vectorResults: { chunkId: string; score: number }[] = [
      { chunkId: "A", score: 0.9 },
      { chunkId: "B", score: 0.8 },
      { chunkId: "C", score: 0.7 },
    ];
    const keywordResults: { chunkId: string; score: number }[] = [
      { chunkId: "B", score: 0.95 },
      { chunkId: "C", score: 0.85 },
    ];

    // Map with vector first, then keyword
    const map1 = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      ["vector", vectorResults],
      ["keyword", keywordResults],
    ]);

    // Map with keyword first, then vector (different insertion order)
    const map2 = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      ["keyword", keywordResults],
      ["vector", vectorResults],
    ]);

    const result1 = engine.fuse(map1);
    const result2 = engine.fuse(map2);

    // Must produce same number of candidates
    assert.equal(result1.length, result2.length);
    // Every candidate must match in chunkId, score, and order
    for (let i = 0; i < result1.length; i++) {
      assert.equal(result1[i]!.chunkId, result2[i]!.chunkId);
      assert.equal(result1[i]!.score, result2[i]!.score);
    }
  });

  it("scoreBreakdown is populated for each candidate", () => {
    const engine = new FusionEngine();

    const results = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      [
        "vector",
        [{ chunkId: "A", score: 0.9 }],
      ],
      [
        "keyword",
        [{ chunkId: "B", score: 0.8 }],
      ],
    ]);

    const candidates = engine.fuse(results);

    assert.equal(candidates.length, 2);

    for (const candidate of candidates) {
      assert.ok(candidate.scoreBreakdown, "scoreBreakdown should exist");
      assert.equal(
        candidate.scoreBreakdown!.fusionScore,
        candidate.score,
        "fusionScore should match candidate score",
      );
    }

    // Candidate A comes from vector only
    const candidateA = candidates.find((c) => c.chunkId === "A")!;
    assert.ok(candidateA.scoreBreakdown!.vectorScore !== undefined);
    assert.equal(candidateA.scoreBreakdown!.vectorScore, candidateA.score);
    // keywordScore should be absent since A only appeared in vector
    assert.equal(candidateA.scoreBreakdown!.keywordScore, undefined);

    // Candidate B comes from keyword only
    const candidateB = candidates.find((c) => c.chunkId === "B")!;
    assert.ok(candidateB.scoreBreakdown!.keywordScore !== undefined);
    assert.equal(candidateB.scoreBreakdown!.keywordScore, candidateB.score);
    assert.equal(candidateB.scoreBreakdown!.vectorScore, undefined);
  });

  it("single strategy keyword — passthrough with keyword in scoreBreakdown", () => {
    const engine = new FusionEngine();

    const results = new Map<RetrievalMethod, { chunkId: string; score: number }[]>([
      [
        "keyword",
        [
          { chunkId: "X", score: 0.95 },
          { chunkId: "Y", score: 0.85 },
        ],
      ],
    ]);

    const candidates = engine.fuse(results);

    assert.equal(candidates.length, 2);
    assert.equal(candidates[0]!.chunkId, "X");
    assert.equal(candidates[1]!.chunkId, "Y");
    // Passthrough preserves original scores
    assert.equal(candidates[0]!.score, 0.95);
    assert.equal(candidates[1]!.score, 0.85);
    // Score breakdown should contain fusionScore and keywordScore
    assert.equal(candidates[0]!.scoreBreakdown!.fusionScore, 0.95);
    assert.equal(candidates[0]!.scoreBreakdown!.keywordScore, 0.95);
    assert.equal(candidates[0]!.scoreBreakdown!.vectorScore, undefined);
  });
});
