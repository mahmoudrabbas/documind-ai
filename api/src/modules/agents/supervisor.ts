import type {
  GuardrailHook,
  ModelAdapter,
  RunContext,
  SupervisorDecision,
  SupervisorPlan,
} from "./agents.types.js";

export class Supervisor {
  constructor(
    private readonly model: ModelAdapter,
    private readonly guardrails: GuardrailHook[],
  ) {}

  async decide(
    context: RunContext,
    input: Record<string, unknown>,
    availableAgents: string[],
  ): Promise<SupervisorDecision> {
    const prompt = `You are the supervisor for workflow '${context.workflowName}'. Current agent: ${context.agentName}. Available agents: ${availableAgents.join(", ")}. Input: ${JSON.stringify(input)}. Choose plan, tool call, or handoff. Respond with a short plan.`;
    const response = await this.model.complete({
      messages: [
        {
          role: "system",
          content: "You are a deterministic supervisor. Output a concise plan.",
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
      const toolMatch = content.match(/tool[:\s]+([A-Za-z0-9_-]+)/i);
      return {
        agentName: input.agentName as string,
        action: "tool_call",
        toolName: toolMatch?.[1] ?? "echo",
        toolInput: { text: content.slice(0, 120) },
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
