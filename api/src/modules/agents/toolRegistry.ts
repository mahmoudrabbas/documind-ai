import type { RegisteredTool, RunContext, ToolCallResult } from "./agents.types.js";

export class ToolRegistry {
  private tools = new Map<string, RegisteredTool>();

  register(tool: RegisteredTool): void {
    if (this.tools.has(tool.schema.name)) {
      throw new Error(`Tool ${tool.schema.name} is already registered`);
    }
    this.tools.set(tool.schema.name, tool);
  }

  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  list(): RegisteredTool[] {
    return Array.from(this.tools.values());
  }

  async execute(context: RunContext, toolName: string, input: unknown, reauthorize: (permission?: string) => Promise<boolean>): Promise<ToolCallResult> {
    const tool = this.tools.get(toolName);
    if (!tool) {
      return {
        ok: false,
        status: "unauthorized",
        output: null,
        error: { code: "UNREGISTERED_TOOL", message: `Tool ${toolName} is not registered` },
        latencyMs: 0,
        tokensUsed: null,
        estimatedCost: null,
        approvalRequired: false,
        approvalId: null,
      };
    }

    const start = Date.now();
    try {
      const allowed = await reauthorize(tool.schema.requiredPermission);
      if (!allowed) {
        return {
          ok: false,
          status: "unauthorized",
          output: null,
          error: { code: "TOOL_UNAUTHORIZED", message: `Insufficient permission for tool ${toolName}` },
          latencyMs: Date.now() - start,
          tokensUsed: null,
          estimatedCost: null,
          approvalRequired: tool.schema.approvalRequired ?? false,
          approvalId: null,
        };
      }

      const output = await tool.handler(context, input);
      return {
        ok: true,
        status: "completed",
        output,
        error: null,
        latencyMs: Date.now() - start,
        tokensUsed: null,
        estimatedCost: null,
        approvalRequired: tool.schema.approvalRequired ?? false,
        approvalId: null,
      };
    } catch (error) {
      return {
        ok: false,
        status: "failed",
        output: null,
        error: { message: error instanceof Error ? error.message : "Tool execution failed" },
        latencyMs: Date.now() - start,
        tokensUsed: null,
        estimatedCost: null,
        approvalRequired: tool.schema.approvalRequired ?? false,
        approvalId: null,
      };
    }
  }
}
