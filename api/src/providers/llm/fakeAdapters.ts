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

    const hasIntentSystemPrompt = params.messages.some(
      (m) => m.role === "system" && (m.content.includes("intent detection") || m.content.includes("QueryPlan"))
    );

    if (hasIntentSystemPrompt) {
      const question = rawContent;
      const lowerQ = question.toLowerCase();
      
      let detectedIntent = "knowledge_question";
      const intentConfidence = 0.95;
      let clarificationNeeded = false;
      let clarification = null;
      const isFollowUp = params.messages.length > 2; // system prompt + user question = length 2, anything more is context history

      if (/unsafe|hack|ignore\s+previous|system\s+prompt/i.test(question)) {
        detectedIntent = "unsafe";
        clarificationNeeded = true;
        clarification = {
          reason: "ambiguous_intent",
          suggestedQuestions: ["How can I help you safely?"],
          messageEn: "This request violates safety policies and cannot be processed.",
          messageAr: "لا يمكن معالجة هذا الطلب لمخالفته لسياسات الأمان."
        };
      } else if (lowerQ.includes("compare") || lowerQ.includes("مقارنة")) {
        detectedIntent = "comparison";
      } else if (lowerQ.includes("summarize") || lowerQ.includes("ملخص")) {
        detectedIntent = "summarization";
      } else if (lowerQ.includes("where") || lowerQ.includes("أين")) {
        detectedIntent = "navigation";
      } else if (lowerQ.includes("upload") || lowerQ.includes("delete") || lowerQ.includes("حذف")) {
        detectedIntent = "administrative_action";
      }

      const isArabic = /[\u0600-\u06FF]/.test(question);
      const language = isArabic ? "ar" : "en";

      const simulatedPlan = {
        schemaVersion: "1.0.0",
        normalizedQuestion: question.trim(),
        originalQuestion: question,
        language,
        detectedIntent,
        intentConfidence,
        entities: [],
        temporalConstraints: [],
        referencedDocumentIds: [],
        departments: [],
        categories: [],
        exactTerms: [],
        semanticQueries: [
          { text: question, language, weight: 1.0 }
        ],
        keywordQueries: [],
        clarificationNeeded,
        clarification,
        isFollowUp,
        conversationContextUsed: isFollowUp,
        promptVersion: "1.0.0",
        modelVersion: "fake-chat",
        processingMetadata: {
          tokensUsed: 100,
          latencyMs: 10,
          estimatedCost: 0,
          fallbackUsed: false
        }
      };

      text = JSON.stringify(simulatedPlan);
    } else {
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
