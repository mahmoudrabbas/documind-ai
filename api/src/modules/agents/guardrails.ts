import type { GuardrailHook, GuardrailResult, RunContext } from "./agents.types.js";

export class InputGuardrail implements GuardrailHook {
  readonly name: GuardrailHook["name"] = "input";
  readonly priority = 100;
  async evaluate(_context: RunContext, payload: Record<string, unknown>): Promise<GuardrailResult> {
    const input = payload.input as Record<string, unknown> | undefined;
    if (input && typeof input === "object" && input !== null) {
      const str = JSON.stringify(input);
      if (str.length > 50_000) {
        return { passed: false, action: "block", reason: "Input payload exceeds maximum size", metadata: { size: str.length } };
      }
    }
    return { passed: true, action: "allow", reason: null, metadata: {} };
  }
}

export class ToolInvocationGuardrail implements GuardrailHook {
  readonly name: GuardrailHook["name"] = "tool_invocation";
  readonly priority = 90;
  async evaluate(_context: RunContext, payload: Record<string, unknown>): Promise<GuardrailResult> {
    const toolName = payload.toolName as string | undefined;
    if (!toolName) return { passed: true, action: "allow", reason: null, metadata: {} };
    if (toolName === "fail") {
      return { passed: true, action: "allow", reason: null, metadata: { note: "fail tool is allowed but may throw" } };
    }
    return { passed: true, action: "allow", reason: null, metadata: {} };
  }
}

export class OutputGuardrail implements GuardrailHook {
  readonly name: GuardrailHook["name"] = "output";
  readonly priority = 80;
  async evaluate(_context: RunContext, payload: Record<string, unknown>): Promise<GuardrailResult> {
    const output = payload.output as Record<string, unknown> | undefined;
    if (output && typeof output === "object" && output !== null) {
      const str = JSON.stringify(output);
      if (str.length > 100_000) {
        return { passed: false, action: "block", reason: "Output payload exceeds maximum size", metadata: { size: str.length } };
      }
    }
    return { passed: true, action: "allow", reason: null, metadata: {} };
  }
}

export class SensitiveActionGuardrail implements GuardrailHook {
  readonly name: GuardrailHook["name"] = "sensitive_action";
  readonly priority = 95;
  async evaluate(_context: RunContext, payload: Record<string, unknown>): Promise<GuardrailResult> {
    const toolName = payload.toolName as string | undefined;
    const action = payload.action as string | undefined;
    const sensitive = new Set(["request_approval", "handoff", "fail"]);
    const key = toolName ?? action ?? "";
    if (sensitive.has(key)) {
      return { passed: true, action: "approval_required", reason: "Sensitive tool requested", metadata: { toolName: key } };
    }
    return { passed: true, action: "allow", reason: null, metadata: {} };
  }
}

export function createDefaultGuardrails(): GuardrailHook[] {
  return [new InputGuardrail(), new SensitiveActionGuardrail(), new ToolInvocationGuardrail(), new OutputGuardrail()];
}
