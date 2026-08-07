import { AppError } from "../../common/errors/AppError.js";
import { STT_PROVIDER_UNAVAILABLE } from "../../common/errors/errorCodes.js";
import { logger } from "../../common/logger/logger.js";
import { config } from "../../config/index.js";

export interface VoxtralSttOptions {
  gatewayUrl?: string;
  apiKey?: string;
  modelId?: string;
  timeoutMs?: number;
}

export class VoxtralSttAdapter {
  private readonly gatewayUrl: string;
  private readonly apiKey: string;
  private readonly modelId: string;
  private readonly timeoutMs: number;

  constructor(options: VoxtralSttOptions = {}) {
    this.gatewayUrl = (
      options.gatewayUrl ||
      process.env.BEDROCK_GATEWAY_URL ||
      config.BEDROCK_GATEWAY_URL ||
      process.env.SBG_BASE_URL ||
      "https://apiaccess.iti.net.eg"
    ).replace(/\/+$/, "");

    this.apiKey =
      options.apiKey ||
      process.env.BEDROCK_GATEWAY_API_KEY ||
      config.BEDROCK_GATEWAY_API_KEY ||
      process.env.SBG_API_KEY ||
      "sbg_A4zeYl4Jy__mmUYpDz2zL-0eemz5xMr_";

    this.modelId = options.modelId || "mistral.voxtral-small-24b-2507";
    this.timeoutMs = options.timeoutMs || config.BEDROCK_TIMEOUT_MS || 30000;
  }

  /**
   * Transcribes raw audio buffer into text using mistral.voxtral-small-24b-2507 model
   * via AWS Bedrock / Gateway service or direct ITI student API.
   */
  async transcribe(
    audioBuffer: Buffer,
    mimeType = "audio/webm",
  ): Promise<string> {
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new AppError(400, "BAD_REQUEST", "Audio buffer cannot be empty");
    }

    const base64Audio = audioBuffer.toString("base64");
    const audioFormat = mimeType.split("/")[1] || "webm";

    const endpointCandidates = [
      `${this.gatewayUrl}/api/v1/student/chat`,
      `${this.gatewayUrl}/v1/chat/completions`,
      `${this.gatewayUrl}/chat/completions`,
      `${this.gatewayUrl}/v1/stt`,
      `${this.gatewayUrl}/stt`,
      "https://apiaccess.iti.net.eg/api/v1/student/chat",
      "http://127.0.0.1:8787/v1/chat/completions",
      "http://host.docker.internal:8787/v1/chat/completions",
    ];

    // Deduplicate candidates preserving priority order
    const uniqueCandidates = [...new Set(endpointCandidates)];

    let lastError: Error | null = null;

    for (const url of uniqueCandidates) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model_id: this.modelId,
            modelId: this.modelId,
            model: this.modelId,
            contentType: mimeType,
            body: {
              audio: base64Audio,
              mimeType,
            },
            messages: [
              {
                role: "user",
                content: "Please accurately transcribe the following voice audio recording into text.",
                audio: {
                  data: base64Audio,
                  format: audioFormat,
                },
              },
            ],
          }),
          signal: controller.signal,
        });

        clearTimeout(timer);

        if (response.ok) {
          const data = (await response.json()) as {
            transcription?: string;
            text?: string;
            output_text?: string;
            choices?: Array<{ message?: { content?: string } }>;
          };

          const text =
            data.transcription ||
            data.text ||
            data.output_text ||
            data.choices?.[0]?.message?.content ||
            "";

          if (text) {
            return text.trim();
          }
        } else {
          const errorText = await response.text().catch(() => "");
          logger.warn(
            { url, status: response.status, errorText },
            "[VoxtralSttAdapter] Gateway endpoint returned non-2xx status",
          );
        }
      } catch (err) {
        clearTimeout(timer);
        lastError = err as Error;
        logger.warn(
          { url, error: (err as Error).message },
          "[VoxtralSttAdapter] Request to gateway candidate failed",
        );
      }
    }

    logger.error(
      { modelId: this.modelId, lastError: lastError?.message },
      "[VoxtralSttAdapter] All gateway endpoints failed or timed out",
    );

    throw new AppError(
      503,
      STT_PROVIDER_UNAVAILABLE,
      "Speech-to-text gateway service is currently unavailable. Please try again later.",
    );
  }
}
