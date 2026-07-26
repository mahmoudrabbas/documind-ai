import OpenAI from "openai";
import type {
  ModelAdapter,
  ModelCompletionMessage,
  ModelCompletionResponse,
} from "../../modules/agents/agents.types.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";

export class GroqChatAdapter implements ModelAdapter {
  readonly providerKey = "groq";

  private client: OpenAI;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.client = new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
    this.model = model;
  }

  async complete(params: {
    messages: ModelCompletionMessage[];
    tools?: Record<string, unknown>[];
    toolChoice?: string | Record<string, unknown>;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    signal?: AbortSignal;
  }): Promise<ModelCompletionResponse> {
    const startTime = Date.now();

    const requestParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      messages: params.messages.map((m) => ({
        role: m.role as "system" | "user" | "assistant",
        content: m.content,
      })),
      temperature: params.temperature ?? 0.7,
      top_p: params.topP,
      max_tokens: params.maxTokens,
    };

    if (params.tools && params.tools.length > 0) {
      requestParams.tools = params.tools as OpenAI.ChatCompletionTool[];
      if (params.toolChoice) {
        requestParams.tool_choice = params.toolChoice as
          | "auto"
          | "none"
          | "required"
          | { type: "function"; function: { name: string } };
      }
    }

    const response = await this.client.chat.completions.create(requestParams, {
      signal: params.signal,
    });

    const choice = response.choices[0];
    const latencyMs = Date.now() - startTime;

    return {
      id: response.id,
      provider: "groq",
      model: response.model,
      choices: [
        {
          index: choice.index,
          message: {
            role: choice.message.role as "system" | "user" | "assistant",
            content: choice.message.content ?? "",
          },
          finishReason: choice.finish_reason,
        },
      ],
      usage: {
        promptTokens: response.usage?.prompt_tokens ?? 0,
        completionTokens: response.usage?.completion_tokens ?? 0,
        totalTokens: response.usage?.total_tokens ?? 0,
      },
      latencyMs,
      estimatedCost: 0,
    };
  }
}
