import type { CopilotTool } from "./tool.types.js";

export class CopilotToolRegistry {
  private tools = new Map<string, CopilotTool>();

  register(tool: CopilotTool): void {
    if (this.tools.has(tool.name)) {
      throw new Error(`Copilot tool ${tool.name} is already registered`);
    }
    this.tools.set(tool.name, tool);
  }

  get(name: string): CopilotTool | undefined {
    return this.tools.get(name);
  }

  list(): CopilotTool[] {
    return Array.from(this.tools.values());
  }

  findByCategory(category: string): CopilotTool[] {
    return this.list().filter((t) => t.category === category);
  }
}
