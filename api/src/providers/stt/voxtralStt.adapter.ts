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
      "http://apiaccess.iti.net.eg"
    ).replace(/\/+$/, "");

    this.apiKey =
      options.apiKey ||
      process.env.BEDROCK_GATEWAY_API_KEY ||
      config.BEDROCK_GATEWAY_API_KEY ||
      process.env.SBG_API_KEY ||
      "";

    this.modelId = options.modelId || "mistral.voxtral-small-24b-2507";
    this.timeoutMs = options.timeoutMs || config.BEDROCK_TIMEOUT_MS || 30000;
  }

  private cleanTranscriptionText(rawText: string): string {
    let text = rawText.trim();
    if (!text) return "";

    // Strip timestamp markers like [ 0m1s162ms - 0m3s422ms ] or [0m1s694ms - 0m1s234ms]
    text = text.replace(/\[\s*\d+m\d+s[\s\S]*?\]\s*/g, "").trim();

    // If the model output is a chat disclaimer or silent audio hallucination, return empty string
    if (
      /text-based AI|unable to transcribe|cannot transcribe|can't transcribe audio|don't have the capability|capability to process|please provide the audio|please play the audio|speak clearly|start transcribing once you begin|how to transcribe audio yourself|simple circuit|light bulb|turn on the light|turn off the light|thank you for watching|subtitles by|amara\.org|subscribe to my channel/i.test(
        text,
      )
    ) {
      return "";
    }

    // Strip common intro headers if model prefixes them
    text = text.replace(
      /^(sure,?|here is the transcription:?|here's the transcription:?|transcription:?)\s*/i,
      "",
    );

    // Strip surrounding quotes
    text = text.replace(/^["']|["']$/g, "").trim();

    // Deduplicate repetitive hallucination loops (e.g. repeated identical sentences)
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lines.length > 3) {
      const uniqueLines = new Set(lines);
      if (uniqueLines.size <= 2) {
        return Array.from(uniqueLines)[0] || "";
      }
    }

    return text;
  }

  /**
   * Transcribes raw audio buffer into text using mistral.voxtral-small-24b-2507 model
   * via AWS Bedrock Gateway service or direct ITI student API.
   */
  async transcribe(
    audioBuffer: Buffer,
    mimeType = "audio/webm",
  ): Promise<string> {
    if (!audioBuffer || audioBuffer.length === 0) {
      throw new AppError(400, "BAD_REQUEST", "Audio buffer cannot be empty");
    }

    const base64Audio = audioBuffer.toString("base64");
    const rawFormat = mimeType.split("/")[1] || "webm";
    const audioFormat = rawFormat.includes(";") ? rawFormat.split(";")[0] : rawFormat;

    // 1. Try Groq Whisper API (Ultra-fast & 100% Free)
    const groqKey =
      process.env.GROQ_STT_API_KEY ||
      config.GROQ_STT_API_KEY ||
      process.env.GROQ_API_KEY ||
      config.GROQ_API_KEY ||
      "";
    if (groqKey && groqKey.trim()) {
      try {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
        formData.append("file", blob, `audio.${audioFormat}`);
        formData.append("model", "whisper-large-v3-turbo");

        const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${groqKey.trim()}`,
          },
          body: formData,
        });

        if (res.ok) {
          const data = (await res.json()) as { text?: string };
          if (data.text) {
            const cleaned = this.cleanTranscriptionText(data.text);
            if (cleaned) {
              logger.info(
                { text: cleaned, provider: "groq-whisper" },
                "[VoxtralSttAdapter] Transcribed audio output via Groq Whisper API",
              );
              return cleaned;
            }
          }
        } else {
          const errBody = await res.text().catch(() => "");
          logger.warn(
            { status: res.status, errBody },
            "[VoxtralSttAdapter] Groq API returned non-2xx status",
          );
        }
      } catch (err) {
        logger.warn(
          { error: (err as Error).message },
          "[VoxtralSttAdapter] Groq API request failed",
        );
      }
    }

    // 2. Try OpenAI Whisper API
    const openaiKey = process.env.OPENAI_API_KEY || config.OPENAI_API_KEY;
    if (openaiKey && openaiKey.trim()) {
      try {
        const formData = new FormData();
        const blob = new Blob([new Uint8Array(audioBuffer)], { type: mimeType });
        formData.append("file", blob, `audio.${audioFormat}`);
        formData.append("model", "whisper-1");

        const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${openaiKey.trim()}`,
          },
          body: formData,
        });

        if (res.ok) {
          const data = (await res.json()) as { text?: string };
          if (data.text) {
            const cleaned = this.cleanTranscriptionText(data.text);
            if (cleaned) {
              logger.info(
                { text: cleaned, provider: "openai-whisper" },
                "[VoxtralSttAdapter] Transcribed audio output via OpenAI Whisper API",
              );
              return cleaned;
            }
          }
        }
      } catch (err) {
        logger.warn(
          { error: (err as Error).message },
          "[VoxtralSttAdapter] OpenAI API request failed",
        );
      }
    }

    const endpointCandidates = [
      "http://apiaccess.iti.net.eg/api/v1/student/chat",
      `${this.gatewayUrl}/api/v1/student/chat`,
      `${this.gatewayUrl}/v1/chat/completions`,
      `${this.gatewayUrl}/v1/audio/transcriptions`,
      "http://127.0.0.1:8787/v1/chat/completions",
      "http://host.docker.internal:8787/v1/chat/completions",
    ];

    // Deduplicate candidates preserving priority order
    const uniqueCandidates = [...new Set(endpointCandidates)];

    let lastError: Error | null = null;

    // Create payloads compatible with different gateway schemas
    const payloads = [
      // Payload 1: Multimodal content array with input_audio (OpenAI / ITI format)
      {
        model_id: this.modelId,
        model: this.modelId,
        max_tokens: 2048,
        system_prompt:
          "You are a Speech-to-Text transcription engine. Output ONLY the verbatim spoken text from the audio.",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcribe the audio verbatim. Output ONLY the transcribed words.",
              },
              {
                type: "input_audio",
                input_audio: {
                  data: base64Audio,
                  format: audioFormat,
                },
              },
            ],
          },
        ],
      },
      // Payload 2: Bedrock top-level audio object schema
      {
        model_id: this.modelId,
        model: this.modelId,
        max_tokens: 2048,
        system_prompt:
          "You are a Speech-to-Text transcription engine. Output ONLY the verbatim spoken text from the audio.",
        messages: [
          {
            role: "user",
            content: "Transcribe the audio verbatim. Output ONLY the transcribed words.",
            audio: {
              data: base64Audio,
              format: audioFormat,
            },
          },
        ],
      },
      // Payload 3: Audio data URI scheme
      {
        model_id: this.modelId,
        model: this.modelId,
        max_tokens: 2048,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Transcribe the following audio verbatim.",
              },
              {
                type: "audio_url",
                audio_url: {
                  url: `data:${mimeType};base64,${base64Audio}`,
                },
              },
            ],
          },
        ],
      },
    ];

    for (const url of uniqueCandidates) {
      for (const bodyPayload of payloads) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeoutMs);

        try {
          const response = await fetch(url, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${this.apiKey}`,
            },
            body: JSON.stringify(bodyPayload),
            signal: controller.signal,
          });

          clearTimeout(timer);

          if (response.ok) {
            const data = (await response.json()) as {
              output_text?: string;
              response?: string;
              transcription?: string;
              text?: string;
              message?: { content?: string };
              choices?: Array<{ message?: { content?: string } }>;
            };

            const rawText =
              data.output_text ||
              data.response ||
              data.transcription ||
              data.text ||
              data.message?.content ||
              data.choices?.[0]?.message?.content ||
              "";

            const text = this.cleanTranscriptionText(rawText);
            logger.info(
              { url, rawText, cleanedText: text },
              "[VoxtralSttAdapter] Transcribed audio output",
            );

            if (!text) {
              logger.warn(
                { url, rawText },
                "[VoxtralSttAdapter] Endpoint returned empty or disclaimer text. Trying next payload/endpoint.",
              );
              continue;
            }

            return text;
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
