import { test } from "node:test";
import assert from "node:assert/strict";

import { runRerankPipeline } from "./rerankPipeline.js";
import { EVIDENCE_ITEM_MIN_TOTAL_SCORE } from "./reranker.types.js";
import type { RetrievalCandidate } from "../retrieval/retrieval.types.js";

/**
 * Sufficiency contract.
 *
 * `evaluate_evidence` approves evidence items one at a time, against
 * EVIDENCE_ITEM_MIN_TOTAL_SCORE, but only out of a bundle whose sufficiency
 * level is SUFFICIENT. So the bundle-level rule has to agree with the per-item
 * rule: if it is stricter, a bundle that demonstrably contains the answer is
 * thrown away whole and the question refuses.
 *
 * These tests pin that agreement, because the previous rule — mean total score
 * >= 0.5 — broke it in two ways that both produced live refusals.
 */
function candidate(
  chunkId: string,
  text: string,
  relevanceScore: number,
  documentId = chunkId,
): RetrievalCandidate {
  return {
    chunkId,
    documentId,
    documentVersionId: "v1",
    tenantId: "tenant-1",
    text,
    score: relevanceScore,
    retrievalMethod: "hybrid",
    scoreBreakdown: { fusionScore: relevanceScore, relevanceScore },
  };
}

const QUERY = "how to install the database server";

/** One page that answers the question, buried in a long tail of near-misses. */
function peakedBundle(): {
  candidates: RetrievalCandidate[];
  semanticScores: number[];
} {
  const candidates = [
    candidate(
      "install",
      "For Ubuntu and Debian run apt-get to fetch the mariadb server package.",
      0.7,
    ),
    candidate("history", "Sun Microsystems acquired the vendor in 2008.", 0.1),
    candidate("licensing", "Dual licensing terms are described here.", 0.1),
    candidate("gui", "Workbench offers a graphical schema designer.", 0.1),
    candidate("agenda", "Course outline and grading policy for the term.", 0.1),
    candidate("credits", "Slides adapted from the lecturer notes.", 0.1),
  ];
  // A cross-encoder concentrates its mass: one confident hit, the rest near
  // zero. Lexical relevance instead spreads across the mid-range, which is the
  // only reason the old mean-based rule ever produced SUFFICIENT.
  return { candidates, semanticScores: [0.9, 0.1, 0.1, 0.1, 0.1, 0.1] };
}

test("P1: a peaked score distribution is SUFFICIENT when any item clears the item gate", () => {
  const { candidates, semanticScores } = peakedBundle();

  const response = runRerankPipeline(
    { candidates, queryText: QUERY, maxItems: 20, maxTokenBudget: 8000 },
    semanticScores,
  );

  const qualifying = response.items.filter(
    (item) => item.scoreBreakdown.totalScore >= EVIDENCE_ITEM_MIN_TOTAL_SCORE,
  );
  assert.ok(qualifying.length > 0, "the install page must clear the item gate");

  const mean =
    response.items.reduce(
      (sum, item) => sum + item.scoreBreakdown.totalScore,
      0,
    ) / response.items.length;
  assert.ok(
    mean < 0.5,
    `mean ${mean.toFixed(3)} must stay under the old 0.5 cutoff for this test to mean anything`,
  );

  // The old rule returned WEAK here, and because evaluate_evidence approves
  // nothing out of a non-SUFFICIENT bundle, every question against this
  // document refused despite the answer sitting at rank 1.
  assert.equal(response.sufficiency.level, "SUFFICIENT");
});

test("P2: admitting more low-scoring evidence cannot downgrade sufficiency", () => {
  const { candidates, semanticScores } = peakedBundle();

  const small = runRerankPipeline(
    { candidates: candidates.slice(0, 2), queryText: QUERY, maxItems: 20 },
    semanticScores.slice(0, 2),
  );
  const large = runRerankPipeline(
    { candidates, queryText: QUERY, maxItems: 20, maxTokenBudget: 8000 },
    semanticScores,
  );

  // A mean punishes recall: raising maxItems so the answer stops being
  // truncated out of the bundle used to be able to flip the bundle to WEAK.
  assert.equal(small.sufficiency.level, "SUFFICIENT");
  assert.equal(large.sufficiency.level, "SUFFICIENT");
  assert.ok(large.items.length > small.items.length);
});

test("P3: WEAK when no item clears the item gate", () => {
  const candidates = [
    candidate("agenda", "Course outline and grading policy for the term.", 0.05),
    candidate("credits", "Slides adapted from the lecturer notes.", 0.05),
  ];

  const response = runRerankPipeline(
    { candidates, queryText: QUERY },
    [0.05, 0.05],
  );

  assert.equal(response.items.length, 2);
  for (const item of response.items) {
    assert.ok(
      item.scoreBreakdown.totalScore < EVIDENCE_ITEM_MIN_TOTAL_SCORE,
      "fixture must keep every item under the gate",
    );
  }
  assert.equal(response.sufficiency.level, "WEAK");
  assert.ok(response.sufficiency.reasons[0]?.includes("No item reached"));
});

test("P4: an empty candidate list is NO_EVIDENCE, not WEAK", () => {
  const response = runRerankPipeline(
    { candidates: [], queryText: QUERY },
    [],
  );

  assert.equal(response.items.length, 0);
  assert.equal(response.sufficiency.level, "NO_EVIDENCE");
});

test("P5: a detected conflict still outranks a qualifying item", () => {
  // CONFLICTING must not be masked by a high-scoring item: the answer writer
  // has to be told the sources disagree rather than handed the better-scoring
  // side of the disagreement.
  const candidates = [
    candidate(
      "policy-old",
      "The annual leave entitlement is 21 days per year.",
      0.7,
      "doc-a",
    ),
    candidate(
      "policy-new",
      "The annual leave entitlement is 30 days per year.",
      0.7,
      "doc-b",
    ),
  ];

  const response = runRerankPipeline(
    {
      candidates,
      queryText: "how many annual leave days is the entitlement",
      maxItems: 20,
    },
    [0.9, 0.9],
  );

  assert.ok(response.conflictGroups.length > 0, "fixture must produce a conflict");
  assert.equal(response.sufficiency.level, "CONFLICTING");
});

test("P6: a similarity lead survives a much larger term-overlap deficit", () => {
  // The live regression, reduced to its arithmetic.
  //
  // "how to install MySQL on Linux" against the indexed lecture deck: the page
  // that actually answers it documents `apt-get install mariadb-server` and
  // never repeats "MySQL" or "Linux", so its exact-term overlap is near zero
  // while pages that merely mention those words score high on it. Relevance
  // varied only 0.733..0.866 across that bundle while overlap varied
  // 0.000..0.667, so under the previous 0.5/0.3 split the crude lexical signal
  // contributed more score-spread than relevance and decided the order: the
  // answering page held the 4th-best similarity and came out 12th overall.
  //
  // Substituting the weights into totalScore gives the exact trade each makes.
  // Writing dSem and dExact for the two differences:
  //
  //   old:  0.4*dSem + (0.5*dSem - 0.3*dExact)*0.6 = 0.70*dSem - 0.180*dExact
  //   new:  0.4*dSem + (0.7*dSem - 0.1*dExact)*0.6 = 0.82*dSem - 0.060*dExact
  //
  // So a similarity lead used to need dSem > 0.257*dExact to survive and now
  // needs dSem > 0.073*dExact - a 3.5x wider tolerance. The fixture below sits
  // between the two thresholds (dExact 0.667, dSem 0.100), which is what makes
  // it discriminating: reverting to 0.5/0.3 flips the ranking assertion.
  //
  // Note what the fix does and does not claim. On the live bundle it moved the
  // answering page from 12th to 6th by pure score, not to 1st - a page with
  // similarity 0.826 and overlap 0.500 still edges out one with 0.830 and
  // 0.167, because a 0.004 similarity lead is genuinely too small to overcome
  // a 0.333 overlap deficit under any weighting that keeps overlap non-zero.
  // 6th is inside the answer writer's attention window and 12th was not, which
  // is why the answer is now released. This test therefore pins the tolerance,
  // not an unconditional "similarity always wins".
  const answering = candidate(
    "install-page",
    "Installing For Ubuntu/Debian : $ sudo apt-get install mariadb-server " +
      "For CentOS/Red Hat Distros: $ sudo yum install mariadb-server",
    0.88,
    "doc-a",
  );
  const mentioning = candidate(
    "history-page",
    "How to install the database server is covered later; this page covers " +
      "the history of the database server and how to read it.",
    0.78,
    "doc-b",
  );

  const response = runRerankPipeline(
    { candidates: [mentioning, answering], queryText: QUERY, maxItems: 20 },
    [0.78, 0.88],
  );

  const install = response.items.find(
    (item) => item.candidate.chunkId === "install-page",
  )!;
  const history = response.items.find(
    (item) => item.candidate.chunkId === "history-page",
  )!;

  // The fixture is only meaningful if overlap really does favour the wrong page
  // by far more than similarity favours the right one.
  const overlapDeficit =
    history.scoreBreakdown.exactTermScore - install.scoreBreakdown.exactTermScore;
  const similarityLead =
    install.scoreBreakdown.semanticScore - history.scoreBreakdown.semanticScore;
  assert.ok(
    overlapDeficit > similarityLead * 4,
    "fixture must give the weaker page a far higher term overlap",
  );
  // Old weights: 0.70*0.100 - 0.180*0.667 = -0.050, the wrong page wins.
  // New weights: 0.82*0.100 - 0.060*0.667 = +0.042, the right page wins.
  assert.ok(
    install.scoreBreakdown.totalScore > history.scoreBreakdown.totalScore,
    "the higher-similarity page must win despite far lower term overlap",
  );
});

test("P7: term overlap still breaks a tie between equally relevant passages", () => {
  // Exact-term overlap is a tie-breaker, not dead weight: given equal
  // similarity, the passage using the asker's own words is the better citation.
  // This pins the weight above zero, so it cannot be dropped as "unused".
  const candidates = [
    candidate(
      "paraphrase",
      "Setting up the data store is described in the appendix section.",
      0.8,
      "doc-a",
    ),
    candidate(
      "verbatim",
      "How to install the database server is described in the appendix section.",
      0.8,
      "doc-b",
    ),
  ];

  const response = runRerankPipeline(
    { candidates, queryText: QUERY, maxItems: 20 },
    [0.8, 0.8],
  );

  const verbatim = response.items.find(
    (item) => item.candidate.chunkId === "verbatim",
  );
  const paraphrase = response.items.find(
    (item) => item.candidate.chunkId === "paraphrase",
  );
  assert.ok(
    verbatim!.scoreBreakdown.totalScore > paraphrase!.scoreBreakdown.totalScore,
  );
});
