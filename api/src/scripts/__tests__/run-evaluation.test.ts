import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildLiveRagPrompt,
  decideFixtureExit,
  decideLiveRagExit,
  documentTitleFilter,
  evaluateLiveRagCase,
  EXIT_EVAL_FAILED,
  EXIT_INVALID,
  EXIT_OK,
  generateAnswerForCase,
  withManagedDbConnection,
} from "../run-evaluation.js";
import type { EvaluationCase } from "../../modules/analytics/evaluation/dataset.js";
import type { JudgeEvidence, JudgeOutcome, JudgePromptInput } from "../../modules/analytics/llmJudge.types.js";
import type { ModelAdapter } from "../../modules/agents/agents.types.js";

const scriptPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../run-evaluation.ts");
const apiRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function runScript(args: string[], options?: { env?: NodeJS.ProcessEnv }): { code: number; output: string } {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    NODE_ENV: "test",
    GROQ_API_KEY: "",
    SBG_API_KEY: "",
    BEDROCK_GATEWAY_API_KEY: "",
    OPENAI_API_KEY: "",
    ...options?.env,
  };
  try {
    const output = execFileSync(process.execPath, ["--import", "tsx", scriptPath, ...args], {
      cwd: apiRoot,
      encoding: "utf8",
      env,
    });
    return { code: 0, output };
  } catch (error) {
    const status = (error as { status?: number }).status;
    const stdout = (error as { stdout?: string }).stdout ?? "";
    return { code: status ?? EXIT_INVALID, output: stdout as string };
  }
}

function stubModelAdapter(content: string): ModelAdapter {
  return {
    providerKey: "stub",
    complete: async () => ({
      id: "stub-id",
      provider: "stub",
      model: "stub-model",
      choices: [{ index: 0, message: { role: "assistant", content }, finishReason: "stop" }],
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 },
      latencyMs: 1,
      estimatedCost: 0,
    }),
  };
}

function stubJudge(): { evaluate: (input: JudgePromptInput) => Promise<JudgeOutcome>; received: JudgePromptInput[] } {
  const received: JudgePromptInput[] = [];
  return {
    received,
    evaluate: async (input) => {
      received.push(input);
      return {
        status: "completed",
        scores: { faithfulness: 1, relevancy: 1, coherence: 1, overall: 1 },
        provider: "stub",
        model: "stub",
        errorCode: null,
      };
    },
  };
}

const evidence: JudgeEvidence[] = [
  {
    chunkId: "ch1",
    documentId: "d1",
    documentTitle: "Refund Policy",
    sectionTitle: "Returns",
    pageNumber: 3,
    text: "Refunds are issued within 14 days.",
  },
];

const caseEntry: EvaluationCase = {
  id: "c1",
  question: "What is the refund policy?",
  evidenceText: "Refunds are issued within 14 days.",
  evidenceChunks: [
    {
      chunkId: "ch1",
      documentId: "d1",
      documentTitle: "Refund Policy",
      sectionTitle: "Returns",
      pageNumber: 3,
      text: "Refunds are issued within 14 days.",
    },
  ],
  expectedTopics: ["refund"],
  expectedDocuments: ["Refund"],
  groundTruthAnswer: "GROUND TRUTH (must never reach the judge)",
};

describe("decideFixtureExit", () => {
  it("returns EXIT_OK for a clean run above the threshold", () => {
    expect(decideFixtureExit({ failedCount: 0, completedCount: 20, groundingChecked: 20, groundingAccuracy: 0.9 })).toBe(EXIT_OK);
  });

  it("returns EXIT_EVAL_FAILED when provider errors occurred", () => {
    expect(decideFixtureExit({ failedCount: 1, completedCount: 20, groundingChecked: 20, groundingAccuracy: 0.9 })).toBe(EXIT_EVAL_FAILED);
  });

  it("returns EXIT_EVAL_FAILED when grounding accuracy is below the threshold", () => {
    expect(decideFixtureExit({ failedCount: 0, completedCount: 20, groundingChecked: 20, groundingAccuracy: 0.4 })).toBe(EXIT_EVAL_FAILED);
  });

  it("honors a custom threshold", () => {
    expect(decideFixtureExit({ failedCount: 0, completedCount: 20, groundingChecked: 20, groundingAccuracy: 0.6, threshold: 0.5 })).toBe(EXIT_OK);
    expect(decideFixtureExit({ failedCount: 0, completedCount: 20, groundingChecked: 20, groundingAccuracy: 0.4, threshold: 0.5 })).toBe(EXIT_EVAL_FAILED);
  });

  it("returns EXIT_EVAL_FAILED when no evaluation completed (all degraded)", () => {
    expect(decideFixtureExit({ failedCount: 0, completedCount: 0, groundingChecked: 0, groundingAccuracy: 0 })).toBe(EXIT_EVAL_FAILED);
  });

  it("returns EXIT_OK for an all-degraded run with --allow-degraded", () => {
    expect(
      decideFixtureExit({ failedCount: 0, completedCount: 0, groundingChecked: 0, groundingAccuracy: 0, allowDegraded: true }),
    ).toBe(EXIT_OK);
  });

  it("does not let --allow-degraded mask provider failures", () => {
    expect(
      decideFixtureExit({ failedCount: 1, completedCount: 0, groundingChecked: 0, groundingAccuracy: 0, allowDegraded: true }),
    ).toBe(EXIT_EVAL_FAILED);
  });

  it("does not let --allow-degraded mask grounding violations", () => {
    expect(
      decideFixtureExit({ failedCount: 0, completedCount: 20, groundingChecked: 20, groundingAccuracy: 0.4, allowDegraded: true }),
    ).toBe(EXIT_EVAL_FAILED);
  });

  it("returns EXIT_OK when no grounding check could be computed but some evaluations completed", () => {
    expect(decideFixtureExit({ failedCount: 0, completedCount: 5, groundingChecked: 0, groundingAccuracy: 0 })).toBe(EXIT_OK);
  });
});

describe("decideLiveRagExit", () => {
  it("returns EXIT_OK for a clean run above the threshold", () => {
    expect(decideLiveRagExit({ failedCount: 0, completedCount: 20, evidenceFound: 20, documentMatchRate: 0.8, noEvidenceCount: 0, caseCount: 20 })).toBe(EXIT_OK);
  });

  it("returns EXIT_EVAL_FAILED on provider failures", () => {
    expect(decideLiveRagExit({ failedCount: 1, completedCount: 20, evidenceFound: 20, documentMatchRate: 0.9, noEvidenceCount: 0, caseCount: 20 })).toBe(EXIT_EVAL_FAILED);
  });

  it("returns EXIT_EVAL_FAILED when document match rate is below the threshold", () => {
    expect(decideLiveRagExit({ failedCount: 0, completedCount: 20, evidenceFound: 20, documentMatchRate: 0.2, noEvidenceCount: 0, caseCount: 20 })).toBe(EXIT_EVAL_FAILED);
  });

  it("returns EXIT_EVAL_FAILED when no evidence was retrieved for any case", () => {
    expect(decideLiveRagExit({ failedCount: 0, completedCount: 0, evidenceFound: 0, documentMatchRate: 0, noEvidenceCount: 22, caseCount: 22 })).toBe(EXIT_EVAL_FAILED);
  });

  it("returns EXIT_EVAL_FAILED when every case is degraded (no completed evaluations)", () => {
    expect(decideLiveRagExit({ failedCount: 0, completedCount: 0, evidenceFound: 20, documentMatchRate: 0.8, noEvidenceCount: 0, caseCount: 20 })).toBe(EXIT_EVAL_FAILED);
  });

  it("returns EXIT_OK for an all-degraded live-rag run with --allow-degraded", () => {
    expect(
      decideLiveRagExit({ failedCount: 0, completedCount: 0, evidenceFound: 20, documentMatchRate: 0.8, noEvidenceCount: 0, caseCount: 20, allowDegraded: true }),
    ).toBe(EXIT_OK);
  });

  it("does not let --allow-degraded mask no-evidence-at-all runs", () => {
    expect(
      decideLiveRagExit({ failedCount: 0, completedCount: 0, evidenceFound: 0, documentMatchRate: 0, noEvidenceCount: 22, caseCount: 22, allowDegraded: true }),
    ).toBe(EXIT_EVAL_FAILED);
  });
});

describe("run-evaluation CLI exit codes", () => {
  it("exits 2 when no mode flag is provided", () => {
    const { code } = runScript([]);
    expect(code).toBe(EXIT_INVALID);
  });

  it("exits 2 when both mode flags are provided", () => {
    const { code } = runScript(["--fixture", "--live-rag"]);
    expect(code).toBe(EXIT_INVALID);
  });

  it("exits 2 when the dataset file cannot be loaded", () => {
    const { code } = runScript(["--fixture", "--dataset", "/tmp/nonexistent-dataset.json"]);
    expect(code).toBe(EXIT_INVALID);
  });

  it("exits 2 for an out-of-range threshold", () => {
    const { code } = runScript(["--fixture", "--threshold", "2"]);
    expect(code).toBe(EXIT_INVALID);
  });

  it("exits 1 for a fixture run with no completed evaluations (all degraded)", () => {
    const env = { ...process.env, GROQ_API_KEY: "", SBG_API_KEY: "", NODE_ENV: "test" };
    const { code } = runScript(["--fixture"], { env });
    expect(code).toBe(EXIT_EVAL_FAILED);
  }, 120_000);

  it("exits 0 for a fixture --allow-degraded run when all evaluations degrade (no real provider)", () => {
    const { code } = runScript(["--fixture", "--allow-degraded"]);
    expect(code).toBe(EXIT_OK);
  }, 120_000);
});

describe("buildLiveRagPrompt", () => {
  it("builds a system + user message pair from the question and evidence", () => {
    const messages = buildLiveRagPrompt(caseEntry.question, evidence);
    expect(messages.length).toBe(2);
    expect(messages[0].role).toBe("system");
    expect(messages[1].role).toBe("user");
    expect(messages[1].content).toContain(caseEntry.question);
    expect(messages[1].content).toContain("Refund Policy");
    expect(messages[1].content).toContain("Refunds are issued within 14 days.");
  });
});

describe("generateAnswerForCase", () => {
  it("returns the provider's sanitized content", async () => {
    const adapter = stubModelAdapter("GENERATED ANSWER");
    const answer = await generateAnswerForCase({ question: caseEntry.question, evidence, modelAdapter: adapter });
    expect(answer).toBe("GENERATED ANSWER");
  });

  it("rejects when the provider returns no usable content", async () => {
    const adapter = stubModelAdapter("");
    await expect(generateAnswerForCase({ question: caseEntry.question, evidence, modelAdapter: adapter })).rejects.toThrow();
  });
});

describe("evaluateLiveRagCase", () => {
  it("short-circuits to no-evidence without calling the judge", async () => {
    const judge = stubJudge();
    const result = await evaluateLiveRagCase({ entry: caseEntry, evidence: [], judge, modelAdapter: stubModelAdapter("x") });
    expect(result.status).toBe("no-evidence");
    expect(judge.received.length).toBe(0);
  });

  it("passes the generated answer to the judge, never the ground-truth answer", async () => {
    const judge = stubJudge();
    const result = await evaluateLiveRagCase({ entry: caseEntry, evidence, judge, modelAdapter: stubModelAdapter("GENERATED ANSWER") });
    expect(result.status).toBe("completed");
    expect(judge.received.length).toBe(1);
    expect(judge.received[0].answer).toBe("GENERATED ANSWER");
    expect(judge.received[0].answer).not.toBe(caseEntry.groundTruthAnswer);
    expect(judge.received[0].question).toBe(caseEntry.question);
    expect(result.documentMatched).toBe(true);
  });

  it("marks a case failed when generation throws and never calls the judge", async () => {
    const judge = stubJudge();
    const failingAdapter: ModelAdapter = {
      providerKey: "stub",
      complete: async () => {
        throw new Error("provider exploded");
      },
    };
    const result = await evaluateLiveRagCase({ entry: caseEntry, evidence, judge, modelAdapter: failingAdapter });
    expect(result.status).toBe("failed");
    expect(result.errorCode).toBeTruthy();
    expect(judge.received.length).toBe(0);
  });
});

describe("documentTitleFilter", () => {
  it("scopes the document lookup to the tenant and casts ids to ObjectIds", () => {
    const filter = documentTitleFilter("5f5f5f5f5f5f5f5f5f5f5f5f", ["5a5a5a5a5a5a5a5a5a5a5a5a", "5b5b5b5b5b5b5b5b5b5b5b5b"]);
    expect(filter.tenantId.toString()).toBe("5f5f5f5f5f5f5f5f5f5f5f5f");
    expect(filter._id.$in.map((id) => String(id))).toEqual(["5a5a5a5a5a5a5a5a5a5a5a5a", "5b5b5b5b5b5b5b5b5b5b5b5b"]);
  });
});

describe("withManagedDbConnection", () => {
  it("connects and disconnects on success", async () => {
    const calls: string[] = [];
    const result = await withManagedDbConnection(
      async () => {
        calls.push("connect");
      },
      async () => {
        calls.push("disconnect");
      },
      async () => {
        calls.push("run");
        return 42;
      },
    );
    expect(result).toBe(42);
    expect(calls).toEqual(["connect", "run", "disconnect"]);
  });

  it("disconnects even when the run throws", async () => {
    const calls: string[] = [];
    await expect(
      withManagedDbConnection(
        async () => {
          calls.push("connect");
        },
        async () => {
          calls.push("disconnect");
        },
        async () => {
          calls.push("run");
          throw new Error("boom");
        },
      ),
    ).rejects.toThrow("boom");
    expect(calls).toEqual(["connect", "run", "disconnect"]);
  });
});
