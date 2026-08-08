import type { EmbeddingAdapter, ModelCompletionResponse } from "../../modules/agents/agents.types.js";
import type { AvailabilityProbeModelAdapter } from "./failoverModelAdapter.js";
import type { VisionAdapter } from "./visionAdapter.js";
import { detectSocialMessage } from "../../modules/intent-query/intentQuery.socialDetector.js";

export class FakeModelAdapter implements AvailabilityProbeModelAdapter {
  readonly providerKey = "fake";

  async checkAvailability(): Promise<{ available: boolean; reason?: string }> {
    return { available: true };
  }
  async complete(params: {
    messages: { role: string; content: string }[];
    tools?: Record<string, unknown>[];
    toolChoice?: string | Record<string, unknown>;
    temperature?: number;
    topP?: number;
    maxTokens?: number;
    signal?: AbortSignal;
    structuredOutput?: { type: "json_object" };
  }): Promise<ModelCompletionResponse> {
    const lastUser = [...params.messages].reverse().find((m) => m.role === "user");
    const rawContent = lastUser?.content ?? "";
    let text = "";
    // Intentionally ignore toolCall for this fake adapter
    // toolCall intentionally unused in this fake adapter
    const _toolCall = params.tools?.length ? "tool-used" : undefined;

    const hasIntentSystemPrompt = params.messages.some(
      (m) => m.role === "system" && (m.content.includes("intent detection") || m.content.includes("QueryPlan") || m.content.includes("كشف النية"))
    );

    // Supervisor deterministic prompt handling: produce short plan text based on user message
    const isSupervisor = params.messages.some(
      (m) =>
        (m.role === "system" && m.content.includes("deterministic supervisor")) ||
        (m.content && typeof m.content === "string" && (m.content.includes("You are the supervisor") || m.content.includes("Choose plan, tool call, or handoff")))
    );

    if (isSupervisor) {
      const userMsg = params.messages.find((m) => m.role === "user")?.content ?? "";
      // Try to robustly extract the input JSON when Supervisor passes a prompt like:
      // "... Input: {"agentName":"a","note":"handoff to billing" }"
      let noteText = userMsg;
      try {
        const inputMatch = userMsg.match(/Input:\s*(\{[\s\S]*\})/i);
        if (inputMatch) {
          const parsed = JSON.parse(inputMatch[1]);
          if (parsed && typeof parsed.note === "string") {
            noteText = parsed.note;
          }
        }
      } catch (_e) {
        // fall back to raw userMsg
      }

      const lower = (noteText || "").toLowerCase();
      if (
          lower.includes("approval") ||
          lower.includes("approve") ||
          lower.includes("موافقة")
        ) {
          return {
            id: `fake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            provider: "fake",
            model: "fake-supervisor",
            choices: [
              {
                index: 0,
                message: {
                  role: "assistant",
                  content: "handoff to approval-agent",
                },
                finishReason: "stop",
              },
            ],
            usage: {
              promptTokens: rawContent.length,
              completionTokens: 4,
              totalTokens: rawContent.length + 4,
            },
            latencyMs: 5,
            estimatedCost: 0,
          };
        }
      if (lower.includes("handoff")) {
        const match = noteText.match(/handoff to ([A-Za-z0-9_-]+)/i);
        const target = match?.[1] ?? "handoff-agent";
        return {
          id: `fake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          provider: "fake",
          model: "fake-supervisor",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: `handoff to ${target}` },
              finishReason: "stop",
            },
          ],
          usage: { promptTokens: rawContent.length, completionTokens: 5, totalTokens: rawContent.length + 5 },
          latencyMs: 5,
          estimatedCost: 0,
        };
      }
      if (lower.includes("call") || lower.includes("tool")) {
        // respond with a tool call plan
        return {
          id: `fake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          provider: "fake",
          model: "fake-supervisor",
          choices: [
            {
              index: 0,
              message: { role: "assistant", content: `tool: echo` },
              finishReason: "stop",
            },
          ],
          usage: { promptTokens: rawContent.length, completionTokens: 3, totalTokens: rawContent.length + 3 },
          latencyMs: 5,
          estimatedCost: 0,
        };
      }
      // default plan
      return {
        id: `fake-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        provider: "fake",
        model: "fake-supervisor",
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: `plan: do something` },
            finishReason: "stop",
          },
        ],
        usage: { promptTokens: rawContent.length, completionTokens: 3, totalTokens: rawContent.length + 3 },
        latencyMs: 5,
        estimatedCost: 0,
      };
    }

    if (hasIntentSystemPrompt) {
      const question = rawContent;
      const lowerQ = question.toLowerCase();
      
      let detectedIntent = "knowledge_question";
      const intentConfidence = 0.95;
      let clarificationNeeded = false;
      let clarification = null;
      const priorMessages = params.messages.slice(1, -1);
      const hasConversationContext = priorMessages.length > 0;
      const hasContextDependentReference =
        /^(?:and\s+)?(?:what|how)\s+about\b|\b(?:it|that|those|they|them|the same)\b/i.test(
          question.trim(),
        );
      const isFollowUp = hasConversationContext && hasContextDependentReference;

      if (/unsafe|hack|ignore\s+previous|system\s+prompt/i.test(question)) {
        detectedIntent = "unsafe";
        clarificationNeeded = true;
        clarification = {
          reason: "ambiguous_intent",
          suggestedQuestions: ["How can I help you safely?"],
          messageEn: "This request violates safety policies and cannot be processed.",
          messageAr: "لا يمكن معالجة هذا الطلب لمخالفته لسياسات الأمان."
        };
      } else if (detectSocialMessage(question).isSocial) {
        detectedIntent = "social";
      } else if (lowerQ.includes("compare") || lowerQ.includes("مقارنة")) {
        detectedIntent = "comparison";
      } else if (lowerQ.includes("summarize") || lowerQ.includes("ملخص")) {
        detectedIntent = "summarization";
      } else if (lowerQ.includes("where") || lowerQ.includes("أين")) {
        detectedIntent = "navigation";
      } else if (lowerQ.includes("upload") || lowerQ.includes("delete") || lowerQ.includes("حذف")) {
        detectedIntent = "administrative_action";
      } else if (isFollowUp) {
        detectedIntent = "follow_up";
      }

      const isArabic = /[\u0600-\u06FF]/.test(question);
      const language = isArabic ? "ar" : "en";
      const social = detectSocialMessage(question);

      const priorUserQuestion = [...priorMessages]
        .reverse()
        .find((message) => message.role === "user")?.content;
      const normalizedQuestion =
        isFollowUp && priorUserQuestion
          ? `Regarding ${priorUserQuestion.replace(/[?.!]+$/, "")}, ${question.trim()}`
          : question.trim();

      const simulatedPlan = {
        schemaVersion: "1.0.0",
        normalizedQuestion,
        originalQuestion: question,
        language,
        detectedIntent,
        intentConfidence,
        socialSubtype:
          detectedIntent === "social"
            ? (social.subtype ?? "acknowledgement")
            : "acknowledgement",
        entities: [],
        temporalConstraints: [],
        referencedDocumentIds: [],
        referencedDocumentTitles: [],
        departments: [],
        categories: [],
        exactTerms: [],
        semanticQueries: detectedIntent === "social" ? [] : [
          { text: normalizedQuestion, language, weight: 1.0 }
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
      // For RAG/chat generation contexts, produce a strict JSON answer when
      // the prompt contains a Context block with source ids. Otherwise, emit
      // a structured insufficient_evidence JSON.
      const hasContext = params.messages.some((m) => m.content && m.content.includes("Context:"));
      if (hasContext) {
        // extract chunk ids embedded as 'id:chunkId' inside the context
        const combined = params.messages.map((m) => m.content).join("\n");
        const idRegex = /id:([^\s\]]+)/g;
        const ids: string[] = [];
        let match: RegExpExecArray | null;
        while ((match = idRegex.exec(combined))) {
          if (!ids.includes(match[1])) ids.push(match[1]);
        }
        const cited = ids.slice(0, 5);
        const json = {
          decision: cited.length > 0 ? "grounded_answer" : "insufficient_evidence",
          answer: cited.length > 0 ? "Simulated grounded answer." : "I could not find sufficient information in the provided documents.",
          citedChunkIds: cited,
        };
        text = JSON.stringify(json);
      } else {
        const json = {
          decision: "insufficient_evidence",
          answer: "Insufficient evidence.",
          citedChunkIds: [],
        };
        text = JSON.stringify(json);
      }
    }

    let finishReason: string | null = "stop";
    const CHARS_PER_TOKEN = 4;
    if (typeof params.maxTokens === "number" && params.maxTokens > 0) {
      const maxChars = params.maxTokens * CHARS_PER_TOKEN;
      if (text.length > maxChars) {
        text = text.slice(0, maxChars);
        finishReason = "length";
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
          finishReason,
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

/**
 * Deterministic vision adapter for development/test. Simulates a provider
 * failure when the question requests it so failure paths stay testable
 * without a network dependency.
 */
export class FakeVisionAdapter implements VisionAdapter {
  readonly providerKey = "fake";
  readonly model = "fake-vision";

  async analyzeImage(
    imageBase64: string,
    question: string,
    _mimeType?: string,
  ): Promise<string> {
    if (/fail|error/i.test(question)) {
      throw new Error("Simulated vision provider failure");
    }
    return `[fake-vision] Analyzed image (${imageBase64.length} base64 chars) for question: "${question}".`;
  }

  async describeDocument(imageBase64: string): Promise<string> {
    return `[fake-vision] Extracted text placeholder from document image (${imageBase64.length} base64 chars).`;
  }
}
