import { AppError } from "../../common/errors/AppError.js";
import {
  AGENT_CONTRACT_INVALID,
  AGENT_OUTPUT_SCHEMA_INVALID,
  AGENT_PROVIDER_ERROR,
} from "../../common/errors/errorCodes.js";
import type { AgentContract } from "./agentContract.js";
import { toAgentId } from "./agentContracts.js";
import type { AgentDefinition } from "./agentDefinition.schema.js";
import type { AgentExecutorRegistry } from "./agentExecutorRegistry.js";
import type { AgentRunContext } from "./agentRunContext.js";
import {
  ComplianceAgentInputSchema,
  ComplianceAgentOutputSchema,
  type ComplianceAgentInput,
  type ComplianceAgentOutput,
} from "./chatAgentIO.js";

export const COMPLIANCE_AGENT_ID = "compliance-agent";
export const COMPLIANCE_AGENT_VERSION = "1.0.0";

export interface ComplianceAgentDependencies {
  readonly evaluate: (input: ComplianceAgentInput) => ComplianceAgentOutput;
}

export function mapComplianceAgentError(caught: unknown): {
  status: "failed" | "unauthorized" | "cancelled" | "timeout";
  code: string;
  message: string;
} {
  if (caught instanceof AppError) {
    const unauthorized = caught.statusCode === 401 || caught.statusCode === 403;
    return {
      status: unauthorized ? "unauthorized" : "failed",
      code: caught.code,
      message: unauthorized ? "Compliance evaluation unauthorized" : "Compliance evaluation failed",
    };
  }
  return {
    status: "failed",
    code: AGENT_PROVIDER_ERROR,
    message: "Compliance evaluation failed",
  };
}

export class ComplianceAgentExecutor implements AgentContract<ComplianceAgentInput, ComplianceAgentOutput> {
  readonly id = toAgentId(COMPLIANCE_AGENT_ID);
  readonly version = COMPLIANCE_AGENT_VERSION;
  readonly capabilities = ["read", "sensitive_execute"] as const;
  readonly inputSchema = ComplianceAgentInputSchema;
  readonly outputSchema = ComplianceAgentOutputSchema;

  private readonly evaluate: (input: ComplianceAgentInput) => ComplianceAgentOutput;

  constructor(options: { deps: ComplianceAgentDependencies }) {
    this.evaluate = options.deps.evaluate;
  }

  async execute(
    context: AgentRunContext,
    input: unknown,
  ): Promise<{
    ok: true;
    status: "completed";
    output: ComplianceAgentOutput;
    latencyMs: number;
  } | {
    ok: false;
    status: "failed" | "unauthorized" | "cancelled" | "timeout";
    error: { code: string; message: string };
    latencyMs: number;
  }> {
    const startedAt = Date.now();
    const parsed = ComplianceAgentInputSchema.safeParse(input);
    if (!parsed.success) {
      return {
        ok: false,
        status: "failed",
        error: {
          code: AGENT_CONTRACT_INVALID,
          message: "Invalid compliance agent input",
        },
        latencyMs: Date.now() - startedAt,
      };
    }

    try {
      const output = this.evaluate(parsed.data);
      const round = ComplianceAgentOutputSchema.safeParse(output);
      if (!round.success) {
        return {
          ok: false,
          status: "failed",
          error: {
            code: AGENT_OUTPUT_SCHEMA_INVALID,
            message: "Compliance agent produced an invalid output",
          },
          latencyMs: Date.now() - startedAt,
        };
      }
      return {
        ok: true,
        status: "completed",
        output: round.data,
        latencyMs: Date.now() - startedAt,
      };
    } catch (caught) {
      const mapped = mapComplianceAgentError(caught);
      return {
        ok: false,
        status: mapped.status,
        error: { code: mapped.code, message: mapped.message },
        latencyMs: Date.now() - startedAt,
      };
    }
  }
}

export function registerComplianceAgentExecutor(
  registry: AgentExecutorRegistry,
  deps: ComplianceAgentDependencies,
): AgentDefinition {
  return registry.register(new ComplianceAgentExecutor({ deps }));
}