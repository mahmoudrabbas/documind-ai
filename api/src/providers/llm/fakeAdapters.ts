import type { EmbeddingAdapter, ModelAdapter, ModelCompletionResponse } from "../../modules/agents/agents.types.js";

export class FakeModelAdapter implements ModelAdapter {
  readonly providerKey = "fake";
  async complete(params: {
    messages: { role: string; content: string }[];
    tools?: Record<string, unknown>[];
    toolChoice?: string | Record<string, unknown>;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<ModelCompletionResponse> {
    const lastUser = [...params.messages].reverse().find((m) => m.role === "user");
    const rawContent = lastUser?.content ?? "";
    let text = "";
    const toolCall = params.tools?.length
      ? `[tool:${(params.tools[0] as Record<string, unknown>).function ? String((params.tools[0] as Record<string, unknown>).function) : "unknown"}(${JSON.stringify({ ok: true })})]`
      : "";

    const inputMatch = rawContent.match(/Input:\s*(\{.*?\})\s*\./s);
    const inputJson = inputMatch ? inputMatch[1] : rawContent;
    const lower = inputJson.toLowerCase();

    if (/handoff\s+to/i.test(lower)) {
      text = `Handoff requested. ${toolCall ? toolCall + " " : ""}Transferred to specialized agent.`;
    } else if (/\bapproval\b/i.test(lower)) {
      text = `Handoff to approval-agent for human approval.`;
    } else if (/\bfail\b/i.test(lower)) {
      text = `Simulated failure.`;
    } else if (/\btool\b|\bcall\b/i.test(lower)) {
      text = `Use tool: echo.`;
    } else {
      text = `Plan: continue with default agent.`;
    }

    return {
      id: `fake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      provider: "fake",
      model: params.tools?.length ? "fake-tool" : "fake-chat",
      choices: [
        {
          index: 0,
          message: { role: "assistant", content: text },
          finishReason: "stop",
        },
      ],
      usage: {
        promptTokens: rawContent.length,
        completionTokens: text.length,
        totalTokens: rawContent.length + text.length,
      },
      latencyMs: 10,
      estimatedCost: 0,
    };
  }
}

export class FakeEmbeddingAdapter implements EmbeddingAdapter {
  readonly providerKey = "fake";
  async embed(params: { inputs: string[]; signal?: AbortSignal }): Promise<{ vectors: number[][]; usage: { totalTokens: number } }> {
    const vectors = params.inputs.map((text) => {
      const vec = new Array(8).fill(0);
      for (let i = 0; i < Math.min(text.length, 8); i++) {
        vec[i] = text.charCodeAt(i) % 10;
      }
      return vec;
    });
    return {
      vectors,
      usage: { totalTokens: params.inputs.join(" ").length },
    };
  }
}
