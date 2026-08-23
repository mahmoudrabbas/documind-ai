import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../common/errors/AppError.js";
import { logger } from "../../common/logger/logger.js";
import type { ModelAdapter, ModelCompletionResponse } from "./agents.types.js";
import {
  CitationSemanticVerificationService,
  extractBoundedFactualClaims,
  MAX_RELEASE_GATE_PASSES,
  MAX_UNKNOWN_RETRIES,
  prepareSemanticClaims,
} from "./citationSemanticVerification.service.js";

const evidence = [
  { chunkId: "policy-a", text: "Employees receive 21 days of annual leave. Remote work is allowed two days per week. Core hours are 10 AM to 3 PM." },
  { chunkId: "policy-b", text: "The company supplies one laptop. Confidential records must use approved security controls." },
];

interface Payload { claims: string[] }
type Script = (payload: Payload, call: number) => unknown | Error;

function payloadFrom(content: string): Payload {
  const match = /SEMANTIC_VERIFICATION_DATA_START\n(?<json>.*)\nSEMANTIC_VERIFICATION_DATA_END/su.exec(content);
  assert.ok(match?.groups?.json);
  return JSON.parse(match.groups.json) as Payload;
}

function completion(content: unknown, provider = "scripted-verifier"): ModelCompletionResponse {
  return {
    id: "verification",
    provider,
    model: "verifier-model",
    choices: [{
      index: 0,
      finishReason: "stop",
      message: { role: "assistant", content: typeof content === "string" ? content : JSON.stringify(content) },
    }],
    usage: { promptTokens: 2, completionTokens: 3, totalTokens: 5 },
    latencyMs: 4,
    estimatedCost: 0.001,
  };
}

function scriptedModel(script: Script): ModelAdapter & {
  calls: Payload[];
  maxTokensByCall: Array<number | undefined>;
} {
  const calls: Payload[] = [];
  const maxTokensByCall: Array<number | undefined> = [];

  return {
    providerKey: "scripted-verifier",
    calls,
    maxTokensByCall,
    async complete(params) {
      assert.equal(params.temperature, 0);
      assert.deepEqual(params.structuredOutput, { type: "json_object" });

      const payload = payloadFrom(params.messages.at(-1)?.content ?? "");
      calls.push(payload);
      maxTokensByCall.push(params.maxTokens);

      const value = script(payload, calls.length);
      if (value instanceof Error) throw value;
      return completion(value);
    },
  };
}

function judgments(
  payload: Payload,
  state: (claim: string, index: number) => "supported" | "unsupported" | "contradicted" | "missing" = () => "supported",
): unknown {
  return {
    judgments: payload.claims.flatMap((claim, index) => {
      const verdict = state(claim, index);
      return verdict === "missing" ? [] : [{
        claimIndex: index,
        verdict,
        supportingEvidenceIds: verdict === "supported" ? ["policy-a"] : [],
      }];
    }),
  };
}

const supportAll = (payload: Payload): unknown => judgments(payload);

test("deterministic preparation strips bullets, numbering, headings, labels, and non-factual preambles", () => {
  const answer = [
    "## Policy summary",
    "The following key points apply:",
    "1. Leave: **Employees receive 21 days of annual leave.**",
    "- Schedule: Remote work is allowed two days per week.",
  ].join("\n");
  const prepared = prepareSemanticClaims(answer);
  assert.deepEqual(prepared.factualClaims.map((claim) => claim.text), [
    "Employees receive 21 days of annual leave.",
    "Remote work is allowed two days per week.",
  ]);
  assert.deepEqual(prepared.factualClaims.map((claim) => claim.answerClaimIndex), [2, 3]);
});

test("safe independent clauses become atomic claims without inventing abstract atoms", () => {
  assert.deepEqual(
    extractBoundedFactualClaims("Employees receive 21 days of leave; remote workers must observe core hours."),
    ["Employees receive 21 days of leave.", "remote workers must observe core hours."],
  );
  assert.deepEqual(
    extractBoundedFactualClaims("The company supplies one laptop and one headset."),
    ["The company supplies one laptop and one headset."],
  );
});

// A live "what is MySQL?" answer shipped as "it is available as both a free
// Community Server and a commercial Enterprise Server." - the writer had joined
// two clauses with ", and", the splitter made the second one its own claim, the
// first was judged unsupported and filtered, and the survivor went out with no
// subject. The clause is also unjudgeable alone: nothing in it says what "it" is.
test("an anaphoric clause is not split away from the antecedent it needs", () => {
  assert.deepEqual(
    extractBoundedFactualClaims(
      "MySQL is a relational database management system, and it is available as both a free Community Server and a commercial Enterprise Server.",
    ),
    [
      "MySQL is a relational database management system, and it is available as both a free Community Server and a commercial Enterprise Server.",
    ],
  );
  // Clauses that carry their own subject still split.
  assert.deepEqual(
    extractBoundedFactualClaims(
      "MySQL provides a Community Server, and the server uses port 3306.",
    ),
    ["MySQL provides a Community Server.", "the server uses port 3306."],
  );
});

test("a released claim never opens with an anaphor whose antecedent was filtered out", async () => {
  // Keyed on claim text, not index: the release gate re-verifies the narrowed
  // candidate, which renumbers its claims.
  const model = scriptedModel((payload) =>
    judgments(payload, (claim) => (claim.startsWith("Alpha") ? "unsupported" : "supported")),
  );
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Alpha fact. It follows from alpha. Gamma fact.",
    evidence,
  });

  // The middle claim was supported on its own terms, but "It follows from alpha."
  // is unreadable once "Alpha fact." is gone, so it is dropped with it.
  assert.deepEqual(result.unsupportedClaims, ["Alpha fact."]);
  assert.equal(result.releasedAnswerText, "Gamma fact.");
});

test("an anaphoric claim is released when its antecedent survives", async () => {
  const model = scriptedModel((payload) =>
    judgments(payload, (_claim, index) => (index === 2 ? "unsupported" : "supported")),
  );
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Alpha fact. It follows from alpha. Gamma fact.",
    evidence,
  });

  assert.equal(result.releasedAnswerText, ["Alpha fact.", "It follows from alpha."].join("\n"));
});

test("four supported unchanged claims release after one verification pass", async () => {
  const model = scriptedModel(supportAll);
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Alpha fact. Beta fact. Gamma fact. Delta fact.",
    evidence,
  });
  assert.deepEqual(result.claimResults.map((claim) => claim.state), ["SUPPORTED", "SUPPORTED", "SUPPORTED", "SUPPORTED"]);
  assert.equal(result.releasedAnswerText, "Alpha fact. Beta fact. Gamma fact. Delta fact.");
  assert.equal(model.calls.length, 1, "the unchanged answer is already verified");
});

test("a fully supported unchanged answer skips redundant release verification", async () => {
  const model = scriptedModel((payload, call) => {
    if (call > 1) {
      return new Error("the unchanged answer must not be verified twice");
    }
    return judgments(payload);
  });

  const answerText = "Alpha fact. Beta fact. Gamma fact. Delta fact.";
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText,
    evidence,
  });

  assert.equal(result.reasonCode, "SEMANTIC_VERIFIED");
  assert.equal(result.releasedAnswerText, answerText);
  assert.equal(result.releasedClaimCount, 4);
  assert.equal(model.calls.length, 1);
});

test("an initial rejection narrows the answer and re-verifies the surviving text", async () => {
  const model = scriptedModel((payload, call) =>
    judgments(payload, (claim) =>
      call === 1 && claim.includes("Two") ? "unsupported" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Fact One. Fact Two. Fact Three.",
    evidence,
  });
  assert.equal(result.reasonCode, "SEMANTIC_VERIFIED");
  assert.equal(result.releasedAnswerText, "Fact One.\nFact Three.");
  assert.doesNotMatch(result.releasedAnswerText ?? "", /Two/u);
  assert.equal(result.releasedClaimCount, 2);
  assert.equal(model.calls.length, 2, "initial filtering and exact release verification");
  assert.deepEqual(model.calls[1]?.claims, ["Fact One.", "Fact Three."]);
});

test("released text is always re-verified in the exact form it ships in", async () => {
  // Guards the safety property the gate exists for: the last pass must have run
  // on precisely the released string, never on a superset of it.
  const model = scriptedModel((payload, call) =>
    judgments(payload, (claim) => {
      if (call === 1 && claim.includes("Two")) return "unsupported";
      if (call === 2 && claim.includes("Three")) return "unsupported";
      return "supported";
    }));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Fact One. Fact Two. Fact Three.",
    evidence,
  });
  const releasedClaims = prepareSemanticClaims(result.releasedAnswerText ?? "")
    .factualClaims.map((claim) => claim.text);
  assert.equal(model.calls.length, 3, "each changed candidate is verified before release");
  assert.deepEqual(model.calls.at(-1)?.claims, releasedClaims);
});

test("a gate that rejects every claim still fails closed", async () => {
  const model = scriptedModel((payload, call) =>
    judgments(payload, (claim) => {
      if (call === 1 && claim.includes("three")) return "unsupported";
      return call === 2 ? "unsupported" : "supported";
    }));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Fact one. Fact two. Fact three.",
    evidence,
  });
  assert.equal(result.releasedAnswerText, undefined);
  assert.equal(result.reasonCode, "SEMANTIC_VERIFICATION_FAILED");
  assert.equal(result.releasedClaimCount, 0);
  assert.deepEqual(result.supportingEvidenceIds, []);
  assert.equal(model.calls.length, 2, "the changed candidate is rejected once, then nothing survives");
  assert.deepEqual(model.calls[1]?.claims, ["Fact one.", "Fact two."]);
});

test("a gate that keeps rejecting is bounded and fails closed rather than looping", async () => {
  // Every gate pass declines the last remaining claim, so narrowing never
  // converges. The pass budget has to stop it.
  const model = scriptedModel((payload) =>
    judgments(payload, (_claim, index) =>
      index === payload.claims.length - 1 ? "unsupported" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Alpha is valid. Beta is valid. Gamma is valid. Delta is valid.",
    evidence,
  });
  assert.equal(result.releasedAnswerText, undefined);
  assert.equal(result.reasonCode, "SEMANTIC_VERIFICATION_FAILED");
  assert.equal(model.calls.length, 1 + MAX_RELEASE_GATE_PASSES, "initial pass plus the capped gate passes");
});

test("a claim dropped by the initial pass and another by the gate both stay out", async () => {
  const model = scriptedModel((payload, call) =>
    judgments(payload, (claim) => {
      if (claim.includes("Invented")) return "unsupported";
      return call === 2 && claim.includes("Doubtful") ? "unsupported" : "supported";
    }));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Solid fact. Invented benefit. Doubtful fact. Other solid fact.",
    evidence,
  });
  assert.equal(result.reasonCode, "SEMANTIC_VERIFIED");
  assert.equal(result.releasedAnswerText, "Solid fact.\nOther solid fact.");
  assert.deepEqual(result.unsupportedClaims, ["Invented benefit."]);
  assert.doesNotMatch(result.releasedAnswerText ?? "", /Invented|Doubtful/u);
});

test("three supported plus one explicit unsupported preserves and releases only supported claims", async () => {
  const model = scriptedModel((payload) => judgments(payload, (claim) => claim.includes("Fabricated") ? "unsupported" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Fact one. Fact two. Fabricated benefit. Fact three.",
    evidence,
  });
  assert.deepEqual(result.claimResults.map((claim) => claim.state), ["SUPPORTED", "SUPPORTED", "UNSUPPORTED", "SUPPORTED"]);
  assert.equal(result.releasedAnswerText, "Fact one.\nFact two.\nFact three.");
  assert.doesNotMatch(result.releasedAnswerText ?? "", /Fabricated/u);
});

test("a missing judgment is UNKNOWN while completed supported judgments are preserved", async () => {
  const model = scriptedModel((payload) => judgments(payload, (claim) => claim.includes("Unresolved") ? "missing" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Fact one. Fact two. Unresolved fact. Fact three.",
    evidence,
  });
  assert.deepEqual(result.claimResults.map((claim) => claim.state), ["SUPPORTED", "SUPPORTED", "UNKNOWN", "SUPPORTED"]);
  assert.deepEqual(result.unknownClaims, ["Unresolved fact."]);
  assert.equal(result.retryCount, MAX_UNKNOWN_RETRIES);
  assert.equal(result.releasedAnswerText, "Fact one.\nFact two.\nFact three.");
});

test("UNKNOWN succeeds on its single bounded retry", async () => {
  const model = scriptedModel((payload, call) => judgments(payload, (_claim, index) => call === 1 && index === 1 ? "missing" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Fact one. Fact two.",
    evidence,
  });
  assert.deepEqual(result.claimResults.map((claim) => claim.state), ["SUPPORTED", "SUPPORTED"]);
  assert.equal(result.retryCount, 1);
  assert.equal(model.calls[1]?.claims.length, 1, "only the unknown claim is retried");
  assert.equal(result.releasedAnswerText, "Fact one. Fact two.");
});

test("UNKNOWN remains unresolved after the bounded retry and is never released", async () => {
  const model = scriptedModel((payload) => judgments(payload, (claim) => claim.includes("Unknown") ? "missing" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Grounded fact. Unknown fact.",
    evidence,
  });
  assert.equal(result.retryCount, 1);
  assert.equal(result.claimResults[1]?.state, "UNKNOWN");
  assert.equal(result.releasedAnswerText, "Grounded fact.");
});

test("duplicate judgment index makes only the affected claim UNKNOWN", async () => {
  const model = scriptedModel((payload) => ({
    judgments: payload.claims.flatMap((claim, index) => claim.includes("Duplicate")
      ? [
          { claimIndex: index, verdict: "supported", supportingEvidenceIds: ["policy-a"] },
          { claimIndex: index, verdict: "supported", supportingEvidenceIds: ["policy-a"] },
        ]
      : [{ claimIndex: index, verdict: "supported", supportingEvidenceIds: ["policy-a"] }]),
  }));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Fact one. Duplicate fact. Fact three.",
    evidence,
  });
  assert.deepEqual(result.claimResults.map((claim) => claim.state), ["SUPPORTED", "UNKNOWN", "SUPPORTED"]);
  assert.equal(result.releasedAnswerText, "Fact one.\nFact three.");
});

test("malformed structured responses remain UNKNOWN and fail closed", async () => {
  const model = scriptedModel(() => "not-json");
  const result = await new CitationSemanticVerificationService(model).verify({ answerText: "A factual claim.", evidence });
  assert.deepEqual(result.unknownClaims, ["A factual claim."]);
  assert.equal(result.releasedAnswerText, undefined);
  assert.equal(model.calls.length, 2, "malformed output receives only the bounded UNKNOWN retry");
});

test("fenced JSON semantic judgments are parsed and released", async () => {
  const model = scriptedModel((payload) => [
    "```json",
    JSON.stringify(judgments(payload)),
    "```",
  ].join("\n"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Employees qualify for annual leave.",
    evidence: [{ chunkId: "policy-a", text: "Annual leave is available to every employee." }],
  });

  assert.equal(result.reasonCode, "SEMANTIC_VERIFIED");
  assert.equal(result.releasedAnswerText, "Employees qualify for annual leave.");
  assert.equal(model.calls.length, 1, "the unchanged fenced answer is already verified");
});

test("valid citation membership with unrelated evidence is semantically unsupported", async () => {
  const model = scriptedModel((payload) => judgments(payload, () => "unsupported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Family health insurance is included.",
    evidence,
  });
  assert.deepEqual(result.unsupportedClaims, ["Family health insurance is included."]);
  assert.equal(result.releasedAnswerText, undefined);
});

test("directly supported compound shell commands survive a semantic false negative", async () => {
  const answerText =
    "For Ubuntu/Debian: sudo apt-get install mariadb-server. " +
    "For CentOS/Red Hat Distros: sudo yum install mariadb-server, then sudo systemctl enable mariadb and sudo systemctl start mariadb.";
  const model = scriptedModel((payload) =>
    judgments(payload, () => "unsupported"),
  );

  const result = await new CitationSemanticVerificationService(model).verify({
    answerText,
    questionText: "How to install MySQL in Linux?",
    evidence: [{
      chunkId: "mysql-install",
      text: [
        "Installing",
        "For Ubuntu/Debian:",
        "$ sudo apt-get install mariadb-server",
        "For CentOS/Red Hat Distros:",
        "$ sudo yum install mariadb-server",
        "$ sudo systemctl enable mariadb",
        "$ sudo systemctl start mariadb",
      ].join("\n"),
    }],
  });

  assert.equal(result.reasonCode, "SEMANTIC_VERIFIED");
  assert.equal(result.releasedAnswerText, answerText);
  assert.deepEqual(result.supportingEvidenceIds, ["mysql-install"]);
  assert.equal(model.calls.length, 0, "verbatim authorized support must not depend on a model judgment");
});

test("natural command wording with quoted commands survives a semantic false negative", async () => {
  const answerText =
    "For Ubuntu/Debian, use 'sudo apt-get install mariadb-server'. " +
    "For CentOS/Red Hat distributions, use 'sudo yum install mariadb-server', then enable and start the service with 'sudo systemctl enable mariadb' and 'sudo systemctl start mariadb'.";
  const model = scriptedModel((payload) =>
    judgments(payload, () => "unsupported"),
  );

  const result = await new CitationSemanticVerificationService(model).verify({
    answerText,
    questionText: "How to install MySQL in Linux?",
    evidence: [{
      chunkId: "mysql-install",
      text: [
        "Installing",
        "For Ubuntu/Debian:",
        "$ sudo apt-get install mariadb-server",
        "For CentOS/Red Hat Distros:",
        "$ sudo yum install mariadb-server",
        "$ sudo systemctl enable mariadb",
        "$ sudo systemctl start mariadb",
      ].join("\n"),
    }],
  });

  assert.equal(result.reasonCode, "SEMANTIC_VERIFIED");
  assert.equal(result.releasedAnswerText, answerText);
  assert.deepEqual(result.supportingEvidenceIds, ["mysql-install"]);
  assert.equal(model.calls.length, 0, "explicit commands with safe presentation glue should not need the model");
});

test("unsupported extra shell command does not pass deterministic direct support", async () => {
  const model = scriptedModel((payload) =>
    judgments(payload, () => "unsupported"),
  );

  const result = await new CitationSemanticVerificationService(model).verify({
    answerText:
      "For Ubuntu/Debian: sudo apt-get install mariadb-server. " +
      "For CentOS/Red Hat Distros: sudo yum install mariadb-server, then sudo systemctl enable mariadb and sudo systemctl restart mariadb.",
    questionText: "How to install MySQL in Linux?",
    evidence: [{
      chunkId: "mysql-install",
      text: [
        "Installing",
        "For Ubuntu/Debian:",
        "$ sudo apt-get install mariadb-server",
        "For CentOS/Red Hat Distros:",
        "$ sudo yum install mariadb-server",
        "$ sudo systemctl enable mariadb",
        "$ sudo systemctl start mariadb",
      ].join("\n"),
    }],
  });

  assert.ok(model.calls.length > 0, "an unmatched factual command must reach semantic verification");
  assert.deepEqual(result.unsupportedClaims, [
    "sudo yum install mariadb-server, then sudo systemctl enable mariadb and sudo systemctl restart mariadb.",
  ]);
  assert.doesNotMatch(result.releasedAnswerText ?? "", /restart/u);
});

test("contextual command mentions do not bypass semantic verification", async () => {
  const model = scriptedModel((payload) =>
    judgments(payload, () => "unsupported"),
  );

  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "sudo systemctl start mariadb.",
    evidence: [{
      chunkId: "mysql-install",
      text: "Do not run sudo systemctl start mariadb; this is only a historical example.",
    }],
  });

  assert.ok(model.calls.length > 0, "contextual evidence must reach semantic verification");
  assert.equal(result.releasedAnswerText, undefined);
  assert.deepEqual(result.unsupportedClaims, ["sudo systemctl start mariadb."]);
});

test("quoted or example command mentions do not bypass semantic verification", async () => {
  const model = scriptedModel((payload) =>
    judgments(payload, () => "unsupported"),
  );

  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "sudo systemctl start mariadb.",
    evidence: [{
      chunkId: "mysql-install",
      text: 'Example text: "$ sudo systemctl start mariadb" is shown for reference only.',
    }],
  });

  assert.ok(model.calls.length > 0, "quoted/example evidence must reach semantic verification");
  assert.equal(result.releasedAnswerText, undefined);
});

test("direct support never combines command lines across evidence chunks", async () => {
  const model = scriptedModel((payload) =>
    judgments(payload, () => "unsupported"),
  );

  const result = await new CitationSemanticVerificationService(model).verify({
    answerText:
      "sudo yum install mariadb-server, then sudo systemctl enable mariadb and sudo systemctl start mariadb.",
    evidence: [
      { chunkId: "install", text: "$ sudo yum install mariadb-server" },
      {
        chunkId: "service",
        text: "$ sudo systemctl enable mariadb\n$ sudo systemctl start mariadb",
      },
    ],
  });

  assert.ok(model.calls.length > 0, "separate chunks must not be assembled into one direct proof");
  assert.equal(result.releasedAnswerText, undefined);
});

test("unsupported command qualifiers do not bypass semantic verification", async () => {
  const model = scriptedModel((payload) =>
    judgments(payload, () => "unsupported"),
  );

  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "sudo systemctl start mariadb immediately.",
    evidence: [{
      chunkId: "mysql-install",
      text: "$ sudo systemctl start mariadb",
    }],
  });

  assert.ok(model.calls.length > 0, "unsupported qualifiers must reach semantic verification");
  assert.equal(result.releasedAnswerText, undefined);
});

test("numeric contradiction is authoritative and is not sent to or salvaged by the model", async () => {
  const model = scriptedModel(supportAll);
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Employees receive 30 days of annual leave.",
    evidence: [{ chunkId: "policy-a", text: "Employees receive 90 days of annual leave." }],
  });
  assert.equal(result.claimResults[0]?.state, "UNSUPPORTED");
  assert.equal(result.claimResults[0]?.deterministicContradiction, true);
  assert.equal(model.calls.length, 0);
  assert.equal(result.releasedAnswerText, undefined);
});

test("U+2011 hyphen in answer does not create a false numeric mismatch against evidence", async () => {
  const model = scriptedModel(supportAll);
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Any unused annual leave beyond the 10\u2011day carry\u2011over limit expires on 31 December.",
    questionText: "What happens to unused annual leave that exceeds the 10-day carry-over limit?",
    evidence: [{
      chunkId: "policy-a",
      text: "Unused annual leave may be carried over into the next calendar year up to a maximum of 10 days. Unused annual leave above the 10-day carry-over limit expires on 31 December.",
    }],
  });
  assert.equal(result.claimResults[0]?.deterministicContradiction, false);
  assert.deepEqual(result.claimResults.map((claim) => claim.state), ["SUPPORTED"]);
  assert.equal(result.reasonCode, "SEMANTIC_VERIFIED");
  assert.equal(result.releasedAnswerText, "Any unused annual leave beyond the 10‑day carry‑over limit expires on 31 December.");
});

test("supported cross-document comparison claim passes the deterministic numeric gate", async () => {
  const model = scriptedModel(supportAll);
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "The current policy allows up to 2 remote days per week, while the superseded policy allowed up to 3 remote days per week.",
    questionText: "How many remote days per week are allowed in the current Remote Work Policy compared to the superseded Remote Work Policy?",
    evidence: [
      { chunkId: "policy-a", text: "Eligible employees may work remotely up to 2 days per week." },
      { chunkId: "policy-b", text: "This old version allowed remote work up to 3 days per week." },
    ],
  });
  assert.deepEqual(result.claimResults.map((claim) => claim.state), ["SUPPORTED"]);
  assert.equal(result.claimResults[0]?.deterministicContradiction, false);
  assert.equal(result.reasonCode, "SEMANTIC_VERIFIED");
  assert.equal(result.releasedAnswerText, "The current policy allows up to 2 remote days per week, while the superseded policy allowed up to 3 remote days per week.");
});

test("wrong cross-document numeric claim still fails the deterministic numeric gate", async () => {
  const model = scriptedModel(supportAll);
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "The current policy allows up to 4 remote days per week, while the superseded policy allowed up to 3 remote days per week.",
    questionText: "How many remote days per week are allowed in the current Remote Work Policy compared to the superseded Remote Work Policy?",
    evidence: [
      { chunkId: "current-policy", text: "Eligible employees may work remotely up to 2 days per week." },
      { chunkId: "superseded-policy", text: "This old version allowed remote work up to 3 days per week." },
    ],
  });
  assert.equal(result.claimResults[0]?.state, "UNSUPPORTED");
  assert.equal(result.claimResults[0]?.deterministicContradiction, true);
  assert.equal(model.calls.length, 0, "deterministic contradiction must not reach the model");
  assert.equal(result.releasedAnswerText, undefined);
});

test("compound claim passes when all safely split atoms are supported", async () => {
  const result = await new CitationSemanticVerificationService(scriptedModel(supportAll)).verify({
    answerText: "Employees receive leave; remote workers must observe core hours.", evidence,
  });
  assert.equal(result.releasedAnswerText, "Employees receive leave; remote workers must observe core hours.");
  assert.equal(result.claimResults.length, 2);
});

test("unsupported atom is removed safely from a compound claim", async () => {
  const model = scriptedModel((payload) => judgments(payload, (claim) => claim.includes("company cars") ? "unsupported" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Employees receive 21 days of leave; employees receive company cars.", evidence,
  });
  assert.equal(result.releasedAnswerText, "Employees receive 21 days of leave.");
  assert.doesNotMatch(result.releasedAnswerText ?? "", /cars/u);
});

test("six supported facts survive one fabricated fact and final verification", async () => {
  const facts = ["Alpha is supported.", "Beta is supported.", "Gamma is supported.", "Delta is supported.", "Epsilon is supported.", "Zeta is supported."];
  const model = scriptedModel((payload) => judgments(payload, (claim) => claim.includes("Fabricated") ? "unsupported" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: [...facts, "Fabricated seventh fact."].join(" "), evidence,
  });
  assert.equal(result.releasedClaimCount, 6);
  assert.equal(result.reasonCode, "SEMANTIC_VERIFIED");
  assert.doesNotMatch(result.releasedAnswerText ?? "", /Fabricated/u);
});

test("all unsupported or unresolved claims produce no releasable answer", async () => {
  for (const verdict of ["unsupported", "missing"] as const) {
    const result = await new CitationSemanticVerificationService(
      scriptedModel((payload) => judgments(payload, () => verdict)),
    ).verify({ answerText: "Claim one. Claim two.", evidence });
    assert.equal(result.releasedAnswerText, undefined);
  }
});

test("redundant factual summary is verified as written without invented category atoms", async () => {
  const model = scriptedModel(supportAll);
  const summary = "Overall, the policy covers leave, remote scheduling, and security.";
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: `Employees receive 21 days of leave. ${summary}`,
    evidence,
  });
  assert.ok(result.releasedAnswerText);
  assert.equal(model.calls[0]?.claims.at(-1), summary);
});

test("unsupported summary addition is removed before final verification", async () => {
  const summary = "Overall, the policy includes free company cars.";
  const model = scriptedModel((payload) => judgments(payload, (claim) => claim === summary ? "unsupported" : "supported"));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: `Employees receive 21 days of leave. ${summary}`,
    evidence,
  });
  assert.equal(result.releasedAnswerText, "Employees receive 21 days of leave.");
});

test("safe provider field-name, casing, and string-index variants normalize", async () => {
  const model = scriptedModel((payload) => ({
    judgments: payload.claims.map((_claim, index) => ({
      claim_index: String(index),
      verdict: "SUPPORTED",
      supporting_evidence_ids: ["policy-a"],
    })),
  }));
  const result = await new CitationSemanticVerificationService(model).verify({ answerText: "Supported fact.", evidence });
  assert.equal(result.releasedAnswerText, "Supported fact.");
});

test("invalid supporting evidence membership remains UNKNOWN", async () => {
  const model = scriptedModel((payload) => ({
    judgments: payload.claims.map((_claim, index) => ({ claimIndex: index, verdict: "supported", supportingEvidenceIds: ["not-authorized"] })),
  }));
  const result = await new CitationSemanticVerificationService(model).verify({ answerText: "Supported fact.", evidence });
  assert.equal(result.claimResults[0]?.state, "UNKNOWN");
  assert.equal(result.releasedAnswerText, undefined);
});

test("Arabic and English grounded answers both pass the common semantic contract", async () => {
  for (const answerText of ["Employees receive 21 days of annual leave.", "يحصل الموظفون على 21 يومًا من الإجازة السنوية."]) {
    const result = await new CitationSemanticVerificationService(scriptedModel(supportAll)).verify({ answerText, evidence });
    assert.equal(result.releasedAnswerText, answerText);
  }
});

test("scripted incomplete variations have deterministic safe release semantics across repeated runs", async () => {
  for (let run = 0; run < 5; run += 1) {
    const model = scriptedModel((payload, call) => judgments(payload, (_claim, index) => call <= 2 && index === run % 3 ? "missing" : "supported"));
    const result = await new CitationSemanticVerificationService(model).verify({
      answerText: "Grounded one. Grounded two. Grounded three.", evidence,
    });
    assert.ok(result.releasedAnswerText);
    assert.doesNotMatch(result.releasedAnswerText ?? "", /undefined|null/u);
    assert.ok(result.claimResults.some((claim) => claim.state === "UNKNOWN") || result.claimResults.every((claim) => claim.state === "SUPPORTED"));
  }
});

test("a 13-claim summary receives the adaptive reasoning completion ceiling", async () => {
  const model = scriptedModel(supportAll);
  const labels = [
    "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta",
    "theta", "iota", "kappa", "lambda", "mu", "nu",
  ];
  const answerText = labels
    .map((label) => `Documented summary fact ${label} is supported.`)
    .join(" ");

  const result = await new CitationSemanticVerificationService(model).verify({
    answerText,
    evidence,
  });

  assert.equal(result.reasonCode, "SEMANTIC_VERIFIED");
  assert.equal(model.calls.length, 1, "the unchanged summary is verified once");
  // Base plus per-claim allowance. The base clears the worst case measured on a
  // reasoning verifier at the *small* end of the claim range, so wide summaries
  // like this one - which have never been observed to truncate - carry it too.
  assert.deepEqual(model.maxTokensByCall, [7_600]);
});

test("finite semantic budget lowers the provider completion allowance", async () => {
  const model = scriptedModel(supportAll);

  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Employees qualify for annual leave.",
    evidence: [{ chunkId: "policy-a", text: "Annual leave is available to every employee." }],
    maxTokens: 700,
  });

  assert.ok(model.maxTokensByCall.length >= 1);
  assert.ok(
    (model.maxTokensByCall[0] ?? 0) > 0 &&
      (model.maxTokensByCall[0] ?? 0) < 700,
    `expected provider completion budget below total budget, got ${String(model.maxTokensByCall[0])}`,
  );
  assert.ok(result.claimResults.length > 0);
});

test("actual usage from filtering reduces the budget available to release verification", async () => {
  const calls: Payload[] = [];
  const maxTokensByCall: Array<number | undefined> = [];
  let call = 0;

  const model: ModelAdapter = {
    providerKey: "budget-scripted",
    async complete(params) {
      const payload = payloadFrom(params.messages.at(-1)?.content ?? "");
      calls.push(payload);
      maxTokensByCall.push(params.maxTokens);
      call += 1;

      const response = completion(judgments(payload, (claim) =>
        call === 1 && claim.includes("Fabricated") ? "unsupported" : "supported"));
      return {
        ...response,
        usage: {
          promptTokens: 50,
          completionTokens: 50,
          totalTokens: call === 1 ? 250 : 5,
        },
      };
    },
  };

  await new CitationSemanticVerificationService(model).verify({
    answerText: "Grounded fact. Fabricated benefit.",
    evidence: [{ chunkId: "policy-a", text: "Annual leave is available to every employee." }],
    maxTokens: 1_000,
  });

  assert.equal(calls.length, 2, "the recomposed answer needs release verification");
  assert.ok(
    (maxTokensByCall[1] ?? 0) < (maxTokensByCall[0] ?? 0),
    `expected second call budget ${String(maxTokensByCall[1])} < first ${String(maxTokensByCall[0])}`,
  );
});

test("exhausted shared budget prevents additional semantic provider calls and fails closed", async () => {
  let calls = 0;

  const model: ModelAdapter = {
    providerKey: "budget-exhaustion",
    async complete(params) {
      calls += 1;
      const payload = payloadFrom(params.messages.at(-1)?.content ?? "");
      const response = completion(judgments(payload, (claim) =>
        claim.includes("Fabricated") ? "unsupported" : "supported"));

      return {
        ...response,
        usage: {
          promptTokens: 350,
          completionTokens: 350,
          totalTokens: 700,
        },
      };
    },
  };

  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Grounded fact. Fabricated benefit.",
    evidence: [{ chunkId: "policy-a", text: "Annual leave is available to every employee." }],
    maxTokens: 900,
  });

  assert.equal(calls, 1, "release verification must not start after the shared budget is exhausted");
  assert.equal(result.releasedAnswerText, undefined);
  assert.equal(result.reasonCode, "SEMANTIC_VERIFICATION_FAILED");
});

test("budget too small for the semantic prompt makes zero provider calls and leaves claims unresolved", async () => {
  let calls = 0;

  const model: ModelAdapter = {
    providerKey: "budget-too-small",
    async complete() {
      calls += 1;
      throw new Error("provider must not be called");
    },
  };

  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Employees qualify for annual leave.",
    evidence: [{ chunkId: "policy-a", text: "Annual leave is available to every employee." }],
    maxTokens: 1,
  });

  assert.equal(calls, 0);
  assert.deepEqual(result.claimResults.map((claim) => claim.state), ["UNKNOWN"]);
  assert.deepEqual(result.unknownClaims, ["Employees qualify for annual leave."]);
  assert.equal(result.releasedAnswerText, undefined);
  assert.equal(result.reasonCode, "SEMANTIC_VERIFICATION_FAILED");
});

async function assertProviderError(error: Error, expectedCode: string): Promise<void> {
  const service = new CitationSemanticVerificationService(scriptedModel(() => error));
  await assert.rejects(
    service.verify({ answerText: "A factual claim.", evidence }),
    (caught: unknown) => caught instanceof AppError && caught.code === expectedCode,
  );
}

test("provider rate limits remain canonical infrastructure errors", async () => {
  await assertProviderError(Object.assign(new Error("vendor secret"), { status: 429 }), "LLM_RATE_LIMITED");
});

test("provider unavailability remains a canonical infrastructure error", async () => {
  await assertProviderError(Object.assign(new Error("vendor secret"), { status: 503 }), "LLM_PROVIDER_UNAVAILABLE");
});

test("provider timeout remains a canonical infrastructure error", async () => {
  await assertProviderError(Object.assign(new Error("timed out"), { code: "ETIMEDOUT" }), "LLM_TIMEOUT");
});

test("a 25-sentence summary verifies in bounded batches and re-verifies after overflow recomposition", async () => {
  const sentences = Array.from({ length: 25 }, () =>
    "Employees receive twenty-one days of annual leave under company policy rules.",
  );
  const answerText = sentences.join(" ");
  const model = scriptedModel((payload) => ({
    judgments: payload.claims.map((_, index) => ({
      claimIndex: index,
      verdict: "supported",
      supportingEvidenceIds: ["policy-a"],
    })),
  }));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText,
    evidence,
  });

  assert.notEqual(result.reasonCode, "VERIFICATION_BOUNDS_EXCEEDED");
  assert.equal(model.calls.length, 4, "two initial batches and two release-verification batches");
  for (const call of model.calls) {
    assert.ok(call.claims.length <= 20, `batch size ${call.claims.length} exceeds 20`);
  }
  assert.equal(result.claimResults.length, 25);
  assert.ok(result.claimResults.every((claim) => claim.state === "SUPPORTED"));
  assert.equal(result.reasonCode, "SEMANTIC_VERIFIED");
  const releasedClaims = prepareSemanticClaims(result.releasedAnswerText ?? "")
    .factualClaims.map((claim) => claim.text);
  assert.deepEqual(
    model.calls.slice(-2).flatMap((call) => call.claims),
    releasedClaims,
    "overflow release verification must judge exactly the recomposed text",
  );
});

test("oversized claims are split before verification instead of failing the whole answer", async () => {
  const longClaim = `Employees receive 21 days of annual leave ${"and extended policy conditions ".repeat(18)}without exceptions.`;
  const model = scriptedModel((payload) => ({
    judgments: payload.claims.map((_, index) => ({
      claimIndex: index,
      verdict: "supported",
      supportingEvidenceIds: ["policy-a"],
    })),
  }));
  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: longClaim,
    evidence,
  });

  assert.notEqual(result.reasonCode, "VERIFICATION_BOUNDS_EXCEEDED");
  for (const call of model.calls) {
    for (const claim of call.claims) {
      assert.ok(claim.length <= 500, `claim length ${claim.length} exceeds 500`);
    }
  }
  assert.equal(result.reasonCode, "SEMANTIC_VERIFIED");
});

// ── truncated verifier completions ─────────────────────────────────────────

/**
 * A verifier whose first `truncatedCalls` passes run out of room mid-JSON.
 *
 * Distinct from `scriptedModel`, which always reports finishReason "stop": what
 * matters here is a *non-empty* completion that cannot be parsed, which is what
 * a reasoning model returns when its thinking plus its output overruns
 * max_tokens. The batch degrades to UNKNOWN exactly as an empty completion
 * would, but only this case is fixed by asking for a larger ceiling.
 */
function truncatingModel(truncatedCalls: number): ModelAdapter & {
  maxTokensByCall: number[];
} {
  const maxTokensByCall: number[] = [];

  return {
    providerKey: "truncating-verifier",
    maxTokensByCall,
    async complete(params) {
      maxTokensByCall.push(params.maxTokens ?? 0);
      const payload = payloadFrom(params.messages.at(-1)?.content ?? "");

      if (maxTokensByCall.length > truncatedCalls) {
        return completion(judgments(payload), "truncating-verifier");
      }
      const cut = '{"judgments":[{"claimIndex":0,"verdict":"sup';
      return {
        id: "verification",
        provider: "truncating-verifier",
        model: "verifier-model",
        choices: [{
          index: 0,
          finishReason: "length",
          message: { role: "assistant" as const, content: cut },
        }],
        usage: {
          promptTokens: 881,
          completionTokens: params.maxTokens ?? 0,
          totalTokens: 881 + (params.maxTokens ?? 0),
        },
        latencyMs: 4,
        estimatedCost: 0.001,
      };
    },
  };
}

test("a truncated verification pass is retried with an escalated ceiling", async () => {
  const model = truncatingModel(1);

  const result = await new CitationSemanticVerificationService(model).verify({
    answerText: "Fact one. Fact two.",
    evidence,
  });

  // Re-asking for the ceiling that just ran out has no better chance, so the
  // retry doubles it. Both passes judge the same two claims, because a
  // truncated batch degrades wholesale rather than resolving part of itself.
  assert.equal(model.maxTokensByCall.length, 2);
  assert.equal(
    model.maxTokensByCall[1],
    (model.maxTokensByCall[0] ?? 0) * 2,
    `expected the retry ceiling to double, got ${model.maxTokensByCall.join(" then ")}`,
  );
  assert.deepEqual(result.claimResults.map((claim) => claim.state), ["SUPPORTED", "SUPPORTED"]);
  assert.equal(result.retryCount, 1);
  assert.equal(result.releasedAnswerText, "Fact one. Fact two.");
});

test("the two-claim ceiling clears the measured worst case for the reasoning verifier", async () => {
  const model = truncatingModel(0);

  await new CitationSemanticVerificationService(model).verify({
    answerText: "Fact one. Fact two.",
    evidence,
  });

  // 2558 completion tokens was the worst of nine live samples of this exact
  // shape of prompt on nvidia/nemotron-3-ultra-550b-a55b. A first pass sized
  // inside that spread makes a correct answer's survival a coin flip.
  assert.ok(
    (model.maxTokensByCall[0] ?? 0) > 2_558,
    `expected the first-pass ceiling to clear the measured worst case, got ${String(model.maxTokensByCall[0])}`,
  );
});

test("truncation is logged distinctly from an empty completion", async () => {
  const model = truncatingModel(1);
  const warnings: Array<{ fields: Record<string, unknown>; message: string }> = [];
  const restore = logger.warn;
  // The service logs through the module singleton, and the test env silences it,
  // so intercept the method itself rather than a destination stream.
  (logger as { warn: unknown }).warn = (fields: unknown, message?: string) => {
    warnings.push({ fields: fields as Record<string, unknown>, message: message ?? "" });
  };
  try {
    await new CitationSemanticVerificationService(model).verify({
      answerText: "Fact one. Fact two.",
      evidence,
    });
  } finally {
    (logger as { warn: unknown }).warn = restore;
  }

  const truncationWarnings = warnings.filter((entry) =>
    entry.message.includes("truncated mid-output"),
  );
  assert.equal(truncationWarnings.length, 1);
  assert.equal(truncationWarnings[0]?.fields.stage, "semantic_verification");
  assert.equal(truncationWarnings[0]?.fields.claimCount, 2);
  assert.equal(truncationWarnings[0]?.fields.attempt, 0);
  // The empty-completion warn must not also fire: the completion was present,
  // just unfinished, and the two failures have different fixes.
  assert.equal(
    warnings.some((entry) => entry.message.includes("returned no content")),
    false,
    `unexpected empty-completion warning: ${warnings.map((entry) => entry.message).join(" | ")}`,
  );
});
