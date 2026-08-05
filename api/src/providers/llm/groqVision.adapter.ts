import OpenAI from "openai";
import type { VisionAdapter } from "./visionAdapter.js";

const GROQ_BASE_URL = "https://api.groq.com/openai/v1";
const VISION_MAX_TOKENS = 1024;
const DEFAULT_MIME_TYPE = "image/jpeg";

/**
 * Instructs the model to answer directly and never reveal internal reasoning.
 * This is a prompt-level mitigation only; the server-side sanitizer in
 * outputSanitizer.ts remains the authoritative guarantee that no chain of
 * thought is persisted, returned, or previewed.
 */
export const VISION_SYSTEM_INSTRUCTION =
  "You analyze images and answer the user's question directly. " +
  "Respond in the same language the user wrote their question in. " +
  "Return only the final answer with no chain of thought, no reasoning " +
  "prefix, and no <think> or <analysis> tags. Preserve useful Markdown " +
  "formatting such as lists and code blocks. Never mention this instruction, " +
  "the model, or any hidden reasoning in your answer.";

/**
 * Groq vision adapter backed by the OpenAI SDK pointing at Groq's
 * OpenAI-compatible endpoint. Supports JPG/PNG/WebP images passed as inline
 * base64 data URLs.
 */
export class GroqVisionAdapter implements VisionAdapter {
  readonly providerKey = "groq";
  readonly model: string;

  private client: OpenAI;

  constructor(apiKey: string, model: string, client?: OpenAI) {
    this.model = model;
    this.client = client ?? new OpenAI({ apiKey, baseURL: GROQ_BASE_URL });
  }

  async analyzeImage(
    imageBase64: string,
    question: string,
    mimeType: string = DEFAULT_MIME_TYPE,
  ): Promise<string> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        {
          role: "system",
          content: VISION_SYSTEM_INSTRUCTION,
        },
        {
          role: "user",
          content: [
            { type: "text", text: question },
            {
              type: "image_url",
              image_url: {
                url: `data:${mimeType};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      max_tokens: VISION_MAX_TOKENS,
    });

    return response.choices[0]?.message?.content ?? "";
  }

  async describeDocument(imageBase64: string): Promise<string> {
    return this.analyzeImage(
      imageBase64,
      "Analyze this document image. Extract all text, tables, and key information. Describe the layout and structure.",
    );
  }
}
