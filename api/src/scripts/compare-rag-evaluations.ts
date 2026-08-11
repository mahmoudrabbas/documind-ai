import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  RagComparisonError,
  compareRagEvaluationReports,
} from "../modules/analytics/evaluation/evaluation.comparison.js";
import {
  DEFAULT_RAG_REGRESSION_POLICY,
  RagRegressionPolicySchema,
} from "../modules/analytics/evaluation/evaluation.regressionPolicy.js";

export interface RagComparisonCliOptions {
  baselinePath: string;
  candidatePath: string;
  policyPath?: string;
  outputPath: string;
}

export interface RagComparisonCliIo {
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
  generatedAt?: Date;
}

function usage(): string {
  return `DocuMind RAG baseline/candidate comparison

Usage:
  npm run evaluate:rag:compare -- --baseline <report.json> --candidate <report.json> [options]

Options:
  --policy <path>  Optional regression policy JSON
  --output <path>  Comparison report path (default: artifacts/rag-evaluation/comparison.json)
  --help           Show this help
`;
}

export function parseRagComparisonArgs(
  argv: readonly string[],
): RagComparisonCliOptions {
  const values = new Map<string, string>();
  for (let index = 0; index < argv.length; index += 2) {
    const flag = argv[index];
    const value = argv[index + 1];
    if (!flag?.startsWith("--") || !value || value.startsWith("--")) {
      throw new Error(`Invalid argument near ${flag ?? "end of input"}`);
    }
    values.set(flag, value);
  }
  const known = new Set(["--baseline", "--candidate", "--policy", "--output"]);
  for (const flag of values.keys()) {
    if (!known.has(flag)) throw new Error(`Unknown argument: ${flag}`);
  }
  const baselinePath = values.get("--baseline");
  const candidatePath = values.get("--candidate");
  if (!baselinePath || !candidatePath) {
    throw new Error("--baseline and --candidate are required");
  }
  return {
    baselinePath,
    candidatePath,
    policyPath: values.get("--policy"),
    outputPath:
      values.get("--output") ??
      path.resolve("artifacts/rag-evaluation/comparison.json"),
  };
}

async function readJson(filePath: string): Promise<unknown> {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

export async function runRagComparisonCli(
  argv: readonly string[],
  io: RagComparisonCliIo = {},
): Promise<number> {
  const stdout = io.stdout ?? ((message: string) => process.stdout.write(message));
  const stderr = io.stderr ?? ((message: string) => process.stderr.write(message));
  if (argv.includes("--help")) {
    stdout(usage());
    return 0;
  }
  try {
    const options = parseRagComparisonArgs(argv);
    const baseline = await readJson(options.baselinePath);
    const candidate = await readJson(options.candidatePath);
    const policy = options.policyPath
      ? RagRegressionPolicySchema.parse(await readJson(options.policyPath))
      : DEFAULT_RAG_REGRESSION_POLICY;
    const report = compareRagEvaluationReports(baseline, candidate, {
      policy,
      generatedAt: io.generatedAt,
    });
    await fs.mkdir(path.dirname(options.outputPath), { recursive: true });
    await fs.writeFile(options.outputPath, `${JSON.stringify(report, null, 2)}\n`, {
      encoding: "utf8",
      flag: "wx",
    });
    stdout(
      `[RAG comparison] gate=${report.gate.passed ? "PASS" : "FAIL"}; output=${options.outputPath}\n`,
    );
    return report.gate.passed ? 0 : 1;
  } catch (error) {
    if (error instanceof RagComparisonError) {
      stderr(`[RAG comparison error] ${error.code}: ${error.message}\n`);
      return error.code.startsWith("INCOMPATIBLE_") ? 3 : 2;
    }
    stderr(
      `[RAG comparison error] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return 2;
  }
}

async function main(): Promise<void> {
  process.exitCode = await runRagComparisonCli(process.argv.slice(2));
}

const isEntryPoint =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isEntryPoint) await main();
