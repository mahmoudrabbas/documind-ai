import { z } from "zod";
import type {
  ModelAdapter,
  RegisteredTool,
  RunContext,
} from "../agents.types.js";

const SUMMARIZE_TOOL_INPUT = z.object({
  text: z.string().min(1).max(50000),
  style: z.enum(["brief", "detailed", "bullet-points"]).default("brief"),
  language: z.enum(["en", "ar"]).default("en"),
});

const SUMMARIZE_TOOL_OUTPUT = z.object({
  summary: z.string(),
});

const STYLE_GUIDANCE = {
  brief:
    "Produce a concise summary in 1-3 sentences capturing the single most important point.",
  detailed:
    "Produce a thorough summary covering all main points, key details, and supporting nuance.",
  "bullet-points":
    "Produce a summary as a short bulleted list of the most important points.",
} as const;

const EN_SYSTEM_PROMPT = [
  "You are an expert document summarizer.",
  "Summarize the provided text faithfully, in English, without inventing facts.",
  "Preserve the original meaning, key figures, and important caveats.",
].join(" ");

const AR_SYSTEM_PROMPT = [
  "أنت خبير في تلخيص المستندات.",
  "لخّص النص المقدّم بدقة وباللغة العربية دون إضافة معلومات غير موجودة فيه.",
  "حافظ على المعنى الأصلي والأرقام والملاحظات المهمة.",
].join(" ");

/**
 * Creates the `summarize` agent tool.
 *
 * This tool condenses a document or text passage using the configured model
 * adapter, supporting English and Arabic output in brief, detailed, or
 * bullet-point styles.
 */
export function createSummarizeTool(model: ModelAdapter): RegisteredTool {
  return {
    schema: {
      name: "summarize",
      version: "1.0.0",
      description:
        "Summarizes a document or text passage in the requested style and language. " +
        "Supports brief, detailed, or bullet-point summaries in English or Arabic.",
      inputSchema: SUMMARIZE_TOOL_INPUT,
      outputSchema: SUMMARIZE_TOOL_OUTPUT,
      requiredPermission: "documents:read",
      approvalRequired: false,
      timeoutMs: 15_000,
      maxRetries: 1,
    },
    handler: async (_context: RunContext, input: unknown) => {
      const params = SUMMARIZE_TOOL_INPUT.parse(input);

      const systemPrompt =
        params.language === "ar" ? AR_SYSTEM_PROMPT : EN_SYSTEM_PROMPT;
      const styleGuidance = STYLE_GUIDANCE[params.style];

      const completion = await model.complete({
        messages: [
          {
            role: "system",
            content: `${systemPrompt} ${styleGuidance}`,
          },
          { role: "user", content: params.text },
        ],
        temperature: 0.3,
        maxTokens: 2048,
      });

      const summary = completion.choices[0]?.message.content?.trim() ?? "";
      return { summary };
    },
  };
}
