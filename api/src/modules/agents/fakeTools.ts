import { z } from "zod";
import type { RegisteredTool, RunContext } from "./agents.types.js";

export function createFakeTools(): RegisteredTool[] {
  return [
    {
      schema: {
        name: "echo",
        version: "1.0.0",
        description: "Echoes the input back as output.",
        inputSchema: z.object({ text: z.string() }),
        outputSchema: z.object({ echoed: z.string() }),
        requiredPermission: "agents:tools:echo:use",
        approvalRequired: false,
        timeoutMs: 1_000,
        maxRetries: 0,
      },
      handler: async (_context: RunContext, input: unknown) => {
        const parsed = z.object({ text: z.string() }).parse(input);
        return { echoed: parsed.text };
      },
    },
    {
      schema: {
        name: "reverse",
        version: "1.0.0",
        description: "Reverses the provided text.",
        inputSchema: z.object({ text: z.string() }),
        outputSchema: z.object({ reversed: z.string() }),
        requiredPermission: "agents:tools:reverse:use",
        approvalRequired: false,
        timeoutMs: 1_000,
        maxRetries: 0,
      },
      handler: async (_context: RunContext, input: unknown) => {
        const parsed = z.object({ text: z.string() }).parse(input);
        return { reversed: parsed.text.split("").reverse().join("") };
      },
    },
    {
      schema: {
        name: "request_approval",
        version: "1.0.0",
        description: "Requests human approval for a sensitive action.",
        inputSchema: z.object({ reason: z.string(), details: z.record(z.string(), z.unknown()) }),
        outputSchema: z.object({ approvalId: z.string(), status: z.literal("pending") }),
        requiredPermission: "agents:approval:request",
        approvalRequired: true,
        timeoutMs: 2_000,
        maxRetries: 0,
      },
      handler: async (_context: RunContext, _input: unknown) => {
        return { approvalId: `approval-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, status: "pending" };
      },
    },
    {
      schema: {
        name: "handoff",
        version: "1.0.0",
        description: "Hands off the workflow to another agent.",
        inputSchema: z.object({ toAgent: z.string(), reason: z.string(), input: z.record(z.string(), z.unknown()) }),
        outputSchema: z.object({ handoffId: z.string(), toAgent: z.string() }),
        requiredPermission: "agents:handoff:request",
        approvalRequired: true,
        timeoutMs: 2_000,
        maxRetries: 0,
      },
      handler: async (_context: RunContext, input: unknown) => {
        const parsed = z.object({ toAgent: z.string(), reason: z.string(), input: z.record(z.string(), z.unknown()) }).parse(input);
        return { handoffId: `handoff-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`, toAgent: parsed.toAgent };
      },
    },
    {
      schema: {
        name: "fail",
        version: "1.0.0",
        description: "Simulates a tool failure.",
        inputSchema: z.object({ message: z.string().optional() }),
        outputSchema: z.object({ ok: z.literal(false) }),
        requiredPermission: "agents:tools:fail:use",
        approvalRequired: false,
        timeoutMs: 1_000,
        maxRetries: 0,
      },
      handler: async () => {
        throw new Error("Simulated fake tool failure");
      },
    },
  ];
}
