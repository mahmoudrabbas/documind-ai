import crypto from "node:crypto";
import { z } from "zod";
import type { ModelAdapter } from "../../agents/agents.types.js";
import type { CopilotPlan, CopilotStep, PlannerInput } from "../copilot.types.js";
import { SYSTEM_PROMPT } from "./planner.prompts.js";
import { CopilotToolRegistry } from "../tools/toolRegistry.js";
import { logger } from "../../../common/logger/logger.js";
import { config } from "../../../config/index.js";

const stepSchema = z.object({
  action: z.string().min(1),
  description: z.string().min(1),
  tool: z.string().nullable(),
  parameters: z.record(z.string(), z.unknown()).nullable(),
  confirmationLevel: z.enum(["safe", "medium", "high"]),
  requiredPermission: z.string().nullable(),
});

const planSchema = z.object({
  summary: z.string().min(1),
  steps: z.array(stepSchema).min(1).max(20),
});

export class CopilotPlanner {
  constructor(
    private readonly model: ModelAdapter,
    private readonly toolRegistry: CopilotToolRegistry,
  ) {}

  async generatePlan(input: PlannerInput): Promise<CopilotPlan> {
    const userMessage = this.buildUserMessage(input);
    const fallbackPlan = this.buildFallbackPlan(input);

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), config.COPILOT_PLAN_TIMEOUT_MS);
      const response = await this.model.complete({
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userMessage },
        ],
        temperature: 0,
        maxTokens: 2000,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const content = response.choices[0]?.message?.content ?? "";
      const parsed = this.parsePlanResponse(content);
      if (!parsed) return fallbackPlan;

      return this.toCopilotPlan(parsed, input);
    } catch (err) {
      logger.warn({ err, query: input.query }, "Copilot planner LLM call failed, using fallback");
      return fallbackPlan;
    }
  }

  private buildUserMessage(input: PlannerInput): string {
    const toolList = this.toolRegistry
      .list()
      .map((t) => `- ${t.name}: ${t.description} (permission: ${t.requiredPermission ?? "none"}, confirmation: ${t.confirmationLevel})`)
      .join("\n");

    return `Current context:
- Mode: ${input.mode}
- Current page: ${input.currentRoute ?? "unknown"}
- Your role: ${input.actorRole}

Available tools:
${toolList}

User request: "${input.query}"

Generate a step-by-step plan.`;
  }

  private parsePlanResponse(content: string): z.infer<typeof planSchema> | null {
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return null;
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      const result = planSchema.safeParse(parsed);
      return result.success ? result.data : null;
    } catch {
      return null;
    }
  }

  private toCopilotPlan(parsed: z.infer<typeof planSchema>, input: PlannerInput): CopilotPlan {
    const now = new Date().toISOString();
    const steps: CopilotStep[] = parsed.steps.map((s, i) => ({
      stepIndex: i,
      action: s.action,
      description: s.description,
      tool: s.tool,
      parameters: s.parameters,
      confirmationLevel: s.confirmationLevel,
      requiredPermission: s.requiredPermission,
      status: "pending" as const,
      result: null,
      errorMessage: null,
    }));

    return {
      id: crypto.randomUUID(),
      summary: parsed.summary,
      mode: input.mode,
      steps,
      estimatedDurationMs: steps.length * 2000,
      createdAt: now,
      updatedAt: now,
      status: "active",
    };
  }

  private buildFallbackPlan(input: PlannerInput): CopilotPlan {
    const now = new Date().toISOString();
    return {
      id: crypto.randomUUID(),
      summary: `Process: ${input.query.slice(0, 100)}`,
      mode: input.mode,
      steps: [
        {
          stepIndex: 0,
          action: "navigate",
          description: `Navigate to the relevant section to ${input.query.toLowerCase()}`,
          tool: null,
          parameters: null,
          confirmationLevel: "safe",
          requiredPermission: null,
          status: "pending",
          result: null,
          errorMessage: null,
        },
      ],
      estimatedDurationMs: 2000,
      createdAt: now,
      updatedAt: now,
      status: "active",
    };
  }
}
