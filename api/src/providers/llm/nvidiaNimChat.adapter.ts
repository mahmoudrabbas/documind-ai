import OpenAI from "openai";
import type {
  ModelCompletionMessage,
  ModelCompletionResponse,
  ModelStructuredOutput,
} from "../../modules/agents/agents.types.js";
import type { AvailabilityProbeModelAdapter } from "./failoverModelAdapter.js";

const DEFAULT_BASE_URL = "https://integrate.api.nvidia.com/v1";
// Chosen over nemotron-3-ultra-550b on measured reliability, not size. On the
// shared development tier the 550b endpoint answered "503 Service temporarily
// overloaded" for 4 of 9 real RAG calls and took 22-45s when it did answer; the
// 120b answered all 9 in 1.5-31s. It also judged every claim of an 11-claim
// verification prompt without truncating, which the smaller lightning/49b models
// did not.
const DEFAULT_MODEL = "nvidia/nemotron-3-super-120b-a12b";
// Reasoning-capable NIM models bill thinking as completion tokens, so the
// hardest RAG task (a ten-source document summary) measured 22-25s end to end.
// A ceiling anywhere near that aborts healthy requests, and the abort used to be
// misread as an outage that parked the provider in the failover cache.
const DEFAULT_TIMEOUT_MS = 120_000;
const PROBE_TIMEOUT_MS = 5_000;
const MAX_SDK_RETRIES = 1;

/**
 * Thinking budget requested for every completion.
 *
 * Nemotron-class NIM models bill thinking as completion tokens and, left
 * unbounded, spend wildly different amounts of it on the same prompt. Replaying
 * the live two-claim citation-verification prompt against the real endpoint at
 * temperature 0 produced completions of 843 to 2558 tokens across nine samples,
 * and truncated its own JSON output in two of four samples at max_tokens=2000.
 * Every caller in this repo asks for structured JSON and parses it strictly, so
 * a long thinking pass does not buy a better answer - it buys a coin flip on
 * whether the answer survives the token ceiling at all.
 *
 * Asking for "low" collapsed that spread to 651-889 tokens over four samples
 * with identical verdicts, and left the answer writer's grounded output
 * unchanged on both the direct-question and document-summary prompts. It is
 * therefore a default, not a policy: NVIDIA_REASONING_EFFORT overrides it, and
 * "default" omits the parameter entirely for NIM models that reject it.
 */
const DEFAULT_REASONING_EFFORT = "low";
const REASONING_EFFORTS = ["low", "medium", "high"] as const;
export type NvidiaNimReasoningEffort = (typeof REASONING_EFFORTS)[number];

/**
 * Resolves the configured effort, or null when the parameter must be omitted.
 * Unrecognized values omit rather than throw: an unsupported parameter is a 400
 * from the gateway, which would take the whole provider down for a typo.
 */
function resolveReasoningEffort(value: string | undefined): NvidiaNimReasoningEffort | null {
  const normalized = (value ?? DEFAULT_REASONING_EFFORT).trim().toLowerCase();
  return (REASONING_EFFORTS as readonly string[]).includes(normalized)
    ? (normalized as NvidiaNimReasoningEffort)
    : null;
}

export interface NvidiaNimChatAdapterOptions {
  apiKey: string;
  baseUrl?: string;
  model?: string;
  timeoutMs?: number;
  /** "low" | "medium" | "high", or "default" to omit the parameter. */
  reasoningEffort?: string;
}

export class NvidiaNimChatAdapter implements AvailabilityProbeModelAdapter {
  readonly providerKey = "nvidia-nim";
  readonly model: string;
  readonly timeoutMs: number;
  readonly reasoningEffort: NvidiaNimReasoningEffort | null;
  readonly runtimeIdentity;

  private readonly apiKey: string;
  private readonly baseUrl: string;
  private client: OpenAI;

  constructor(options: NvidiaNimChatAdapterOptions) {
    this.apiKey = options.apiKey;
    this.baseUrl = (options.baseUrl?.trim() || DEFAULT_BASE_URL).replace(/\/+$/, "");
    this.model = options.model?.trim() || DEFAULT_MODEL;
    this.timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.reasoningEffort = resolveReasoningEffort(options.reasoningEffort);
    this.client = new OpenAI({
      apiKey: this.apiKey,
      baseURL: this.baseUrl,
      maxRetries: MAX_SDK_RETRIES,
    });
    this.runtimeIdentity = Object.freeze({
      provider: this.providerKey,
      model: this.model,
      modelRevisionStatus: "unavailable" as const,
      componentVersion: "nvidia-nim-chat-adapter-v1",
    });
  }

  async checkAvailability(
    signal?: AbortSignal,
  ): Promise<{ available: boolean; reason?: string }> {
    try {
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
        signal: signal ?? AbortSignal.timeout(PROBE_TIMEOUT_MS),
      });
      return {
        available: response.ok,
        reason: response.ok ? undefined : `HTTP ${response.status}`,
      };
    } catch (error) {
      return {
        available: false,
        reason: error instanceof Error ? error.message : String(error),
      };
    }
  }

  buildRequestParams(params: {
    messages: ModelCompletionMessage[];
    tools?: Record<string, unknown>[];
    toolChoice?: string | Record<string, unknown>;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    structuredOutput?: ModelStructuredOutput;
  }): OpenAI.ChatCompletionCreateParamsNonStreaming {
    const requestParams: OpenAI.ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      messages: params.messages.map((message) => ({
        role: message.role as "system" | "user" | "assistant",
        content: message.content,
      })),
      temperature: params.temperature ?? 0.7,
      max_tokens: params.maxTokens,
    };

    if (params.topP !== undefined) requestParams.top_p = params.topP;
    if (this.reasoningEffort) requestParams.reasoning_effort = this.reasoningEffort;

    // NIM model support for native JSON mode is not uniform. The agents still
    // request JSON in their prompts and validate it strictly after completion,
    // so omitting response_format keeps fallback requests model-portable.
    if (params.tools && params.tools.length > 0) {
      requestParams.tools = params.tools as unknown as OpenAI.ChatCompletionTool[];
      if (params.toolChoice) {
        requestParams.tool_choice = params.toolChoice as
          | "auto"
          | "none"
          | "required"
          | { type: "function"; function: { name: string } };
      }
    }

    return requestParams;
  }

  async complete(params: {
    messages: ModelCompletionMessage[];
    tools?: Record<string, unknown>[];
    toolChoice?: string | Record<string, unknown>;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    structuredOutput?: ModelStructuredOutput;
  }): Promise<ModelCompletionResponse> {
    const startedAt = Date.now();
    const timeoutSignal = AbortSignal.timeout(this.timeoutMs);
    const completionSignal = params.signal
      ? AbortSignal.any([timeoutSignal, params.signal])
      : timeoutSignal;
    const response = await this.client.chat.completions.create(
      this.buildRequestParams(params),
      { signal: completionSignal },
    );
    const choice = response.choices[0];

    return {
      id: response.id,
      provider: this.providerKey,
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
      latencyMs: Date.now() - startedAt,
      estimatedCost: 0,
    };
  }
}
