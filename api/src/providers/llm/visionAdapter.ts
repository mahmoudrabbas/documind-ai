import { AppError } from "../../common/errors/AppError.js";
import { VISION_UNAVAILABLE } from "../../common/errors/errorCodes.js";
import { FakeVisionAdapter } from "./fakeAdapters.js";
import { GroqVisionAdapter } from "./groqVision.adapter.js";

/**
 * Provider-neutral port for image understanding used by the chat vision flow.
 * No provider-specific types (OpenAI/Groq) leak into the chat domain.
 */
export interface VisionAdapter {
  readonly providerKey: string;
  readonly model: string;

  /**
   * Analyzes an image using a user-supplied question and returns the
   * provider's textual answer.
   */
  analyzeImage(
    imageBase64: string,
    question: string,
    mimeType?: string,
  ): Promise<string>;

  /**
   * Extracts text/tables/structure from a document image.
   */
  describeDocument(imageBase64: string): Promise<string>;
}

let singleton: VisionAdapter | null = null;

export function getVisionAdapter(): VisionAdapter {
  if (singleton) return singleton;
  singleton = createVisionAdapter();
  return singleton;
}

export function setVisionAdapter(adapter: VisionAdapter | null): void {
  singleton = adapter;
}

/**
 * Factory for a vision adapter. Exported for testability; callers should use
 * {@link getVisionAdapter} and {@link setVisionAdapter}.
 */
export function createVisionAdapter(): VisionAdapter {
  const aiProvider = process.env.AI_PROVIDER || "fake";

  if (aiProvider === "groq") {
    const apiKey = process.env.GROQ_API_KEY;
    const model =
      process.env.GROQ_VISION_MODEL || "qwen/qwen3.6-27b";
    if (!apiKey) {
      throw new AppError(
        503,
        VISION_UNAVAILABLE,
        "GROQ_API_KEY is required for vision analysis when AI_PROVIDER is groq",
      );
    }
    return new GroqVisionAdapter(apiKey, model);
  }

  if (aiProvider === "fake") {
    return new FakeVisionAdapter();
  }

  throw new AppError(
    503,
    VISION_UNAVAILABLE,
    `Vision analysis is not configured for AI_PROVIDER=${aiProvider}`,
  );
}
