import type {
  GuardrailHook,
  ModelAdapter,
  RegisteredTool,
  RunContext,
  SupervisorDecision,
  SupervisorPlan,
} from "./agents.types.js";

function describeTool(tool: RegisteredTool): string {
  const inputSchema = tool.schema.inputSchema as {
    shape?: Record<string, unknown>;
  } | null;
  const fields = inputSchema?.shape
    ? Object.keys(inputSchema.shape).join(", ")
    : "";
  return `- ${tool.schema.name}: ${tool.schema.description}${
    fields ? `\n  input fields: ${fields}` : ""
  }`;
}

export class Supervisor {
  constructor(
    private readonly model: ModelAdapter,
    private readonly guardrails: GuardrailHook[],
  ) {}

  async decide(
    context: RunContext,
    input: Record<string, unknown>,
    availableAgents: string[],
    availableTools: RegisteredTool[] = [],
  ): Promise<SupervisorDecision> {
    const toolCatalog =
      availableTools.length > 0
        ? `\nAvailable tools:\n${availableTools.map(describeTool).join("\n")}`
        : "";
    const prompt = `You are the supervisor for workflow '${context.workflowName}'. Current agent: ${context.agentName}. Available agents: ${availableAgents.join(", ")}.${toolCatalog}\nUser input: ${JSON.stringify(input)}. Choose a tool, handoff, plan, or fail. When you choose a tool, provide its input on an 'input:' line as JSON matching the tool's input fields.`;
    const response = await this.model.complete({
      messages: [
        {
          role: "system",
          content:
            "You are a deterministic supervisor. Output exactly one of these formats, then optional detail:\n" +
            "- tool_call: <toolName>\n  input: {<JSON matching the tool's input fields>}\n" +
            "- handoff: to <agentName>\n" +
            "- plan: <short plan>\n" +
            "- fail: <reason>\n" +
            "Only call tools listed in the Available tools section. Never invent a tool name.",
        },
        { role: "user", content: prompt },
      ],
      temperature: 0,
      maxTokens: 256,
    });

    const content = response.choices[0]?.message?.content ?? "";
    const plan = this.parsePlan(content, input);
    return {
      plan,
      fallbackPlan:
        plan.action === "handoff"
          ? {
              agentName: context.agentName,
              action: "plan",
              toolName: undefined,
              toolInput: undefined,
              handoffTo: undefined,
              reason: "Fallback to current agent after handoff blocked",
            }
          : null,
      budget: {
        maxSteps: context.maxSteps ?? 10,
        maxToolCalls: context.maxToolCalls ?? 50,
        maxTokens: context.maxTokens ?? 50_000,
        budgetMs: context.budgetMs ?? 120_000,
      },
    };
  }

  private parsePlan(
    content: string,
    input: Record<string, unknown>,
  ): SupervisorPlan {
    const lower = content.toLowerCase();
    if (lower.includes("handoff") || lower.includes("transfer")) {
      const match = content.match(/to\s+([A-Za-z0-9_-]+)/i);
      return {
        agentName: input.agentName as string,
        action: "handoff",
        handoffTo: match?.[1] ?? "unknown",
        reason: content.slice(0, 200),
      };
    }
    if (lower.includes("tool") || lower.includes("call")) {
      const toolMatch = content.match(/tool(?:_call)?[:\s]+([A-Za-z0-9_-]+)/i);
      const toolInput = this.extractToolInput(content) ?? {
        text: content.slice(0, 120),
      };
      return {
        agentName: input.agentName as string,
        action: "tool_call",
        toolName: toolMatch?.[1] ?? "echo",
        toolInput,
        reason: content.slice(0, 200),
      };
    }
    if (lower.includes("fail") || lower.includes("error")) {
      return {
        agentName: input.agentName as string,
        action: "fail",
        reason: content.slice(0, 200),
      };
    }
    return {
      agentName: input.agentName as string,
      action: "plan",
      reason: content.slice(0, 200),
    };
  }

  private extractToolInput(content: string): Record<string, unknown> | undefined {
    const match = content.match(/input[:\s]*\{[\s\S]*\}/i);
    if (!match) return undefined;
    const start = match[0].indexOf("{");
    const end = match[0].lastIndexOf("}");
    if (start === -1 || end <= start) return undefined;
    try {
      const parsed = JSON.parse(match[0].slice(start, end + 1)) as unknown;
      return parsed &&
        typeof parsed === "object" &&
        !Array.isArray(parsed)
        ? (parsed as Record<string, unknown>)
        : undefined;
    } catch {
      return undefined;
    }
  }

  async evaluateGuardrails(
    context: RunContext,
    phase: "input" | "tool_invocation" | "output" | "sensitive_action",
    payload: Record<string, unknown>,
  ): Promise<{
    passed: boolean;
    action: "allow" | "block" | "approval_required";
    reason: string | null;
  }> {
    const sorted = [...this.guardrails].sort((a, b) => a.priority - b.priority);
    for (const guardrail of sorted) {
      if (guardrail.name !== phase) continue;
      const result = await guardrail.evaluate(context, payload);
      if (!result.passed || result.action !== "allow") {
        return {
          passed: result.passed,
          action: result.action,
          reason: result.reason,
        };
      }
    }
    return { passed: true, action: "allow", reason: null };
  }
}
