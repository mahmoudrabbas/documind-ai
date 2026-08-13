import assert from "node:assert/strict";
import test from "node:test";
import type { RetrievalCandidate } from "../retrieval/retrieval.types.js";
import type {
  EvidenceBundle,
  EvidenceItem,
  SufficiencyLevel,
} from "../reranker/reranker.types.js";
import {
  filterSufficientEvidence,
  isSufficientEvidence,
} from "./chat.service.js";

function candidate(chunkId: string, score: number): RetrievalCandidate {
  return {
    chunkId,
    documentId: `document-${chunkId}`,
    documentVersionId: `version-${chunkId}`,
    tenantId: "tenant-1",
    text: `Evidence ${chunkId}`,
    score,
    retrievalMethod: "hybrid",
  };
}

function item(value: RetrievalCandidate, totalScore: number): EvidenceItem {
  return {
    rank: 1,
    candidate: value,
    scoreBreakdown: {
      fusionScore: value.score,
      rerankScore: totalScore,
      semanticScore: value.score,
      exactTermScore: 0,
      sourceAuthorityScore: 0,
      versionPreferenceScore: 0,
      totalScore,
    },
    citationAnchor: {
      chunkId: value.chunkId,
      documentId: value.documentId,
      documentVersionId: value.documentVersionId,
    },
    textExcerpt: value.text,
  };
}

function bundle(
  items: EvidenceItem[],
  level: SufficiencyLevel = "SUFFICIENT",
): EvidenceBundle {
  return {
    items,
    totalTokenCount: 0,
    maxTokenCount: 4000,
    inputCandidateCount: items.length,
    conflictGroups: [],
    sufficiency: { level, reasons: ["test"] },
    scoreExplanation: "test",
    accessPolicyVersion: "1",
    createdAt: new Date(0).toISOString(),
  };
}

test("isSufficientEvidence honours the shared weak boundary", () => {
  assert.equal(isSufficientEvidence(0.25), true);
  assert.equal(isSufficientEvidence(0.5), true);
  assert.equal(isSufficientEvidence(0.2499), false);
  assert.equal(isSufficientEvidence(Number.NaN), false);
  assert.equal(isSufficientEvidence(Number.POSITIVE_INFINITY), false);
});

test("filterSufficientEvidence preserves strong survivor order", () => {
  const strongA = candidate("a", 0.033);
  const weak = candidate("b", 0.02);
  const strongB = candidate("c", 0.033);
  const survivors = filterSufficientEvidence(
    [weak, strongA, weak, strongB],
    bundle([item(strongA, 0.31), item(strongB, 0.28), item(weak, 0.12)]),
  );
  assert.deepEqual(survivors.map(({ chunkId }) => chunkId), ["a", "c"]);
});

test("filterSufficientEvidence fails closed without usable bundle authority", () => {
  const strong = candidate("strong", 0.033);
  assert.deepEqual(filterSufficientEvidence([strong], null), []);
  assert.deepEqual(filterSufficientEvidence([strong], bundle([])), []);
  for (const level of ["NO_EVIDENCE", "WEAK", "CONFLICTING"] as const) {
    assert.deepEqual(
      filterSufficientEvidence([strong], bundle([item(strong, 0.31)], level)),
      [],
    );
  }
});

test("filterSufficientEvidence rejects non-finite and weak item scores", () => {
  const strong = candidate("strong", 0.033);
  const weak = candidate("weak", 0.02);
  const invalid = candidate("invalid", Number.NaN);
  const survivors = filterSufficientEvidence(
    [weak, invalid, strong],
    bundle([item(strong, 0.31), item(weak, 0.1), item(invalid, Number.NaN)]),
  );
  assert.deepEqual(survivors.map(({ chunkId }) => chunkId), ["strong"]);
});
