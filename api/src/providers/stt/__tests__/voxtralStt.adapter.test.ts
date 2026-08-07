import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { VoxtralSttAdapter } from "../voxtralStt.adapter.js";
import { AppError } from "../../../common/errors/AppError.js";

describe("VoxtralSttAdapter Unit Tests", () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it("instantiates with custom or environment config", () => {
    const adapter = new VoxtralSttAdapter({
      gatewayUrl: "https://custom-gateway.test",
      apiKey: "sbg_test_key_123",
      modelId: "mistral.voxtral-small-24b-2507",
    });
    expect(adapter).toBeInstanceOf(VoxtralSttAdapter);
  });

  it("throws BAD_REQUEST if audio buffer is empty", async () => {
    const adapter = new VoxtralSttAdapter();
    await expect(adapter.transcribe(Buffer.alloc(0))).rejects.toThrow(
      "Audio buffer cannot be empty",
    );
  });

  it("successfully transcribes audio when gateway returns valid transcription", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ transcription: "Hello world this is voice input" }),
    } as Response);

    const adapter = new VoxtralSttAdapter({
      gatewayUrl: "https://apiaccess.iti.net.eg",
      apiKey: "sbg_test_key_123",
    });

    const mockBuffer = Buffer.from("fake-audio-bytes");
    const result = await adapter.transcribe(mockBuffer, "audio/webm");

    expect(result).toBe("Hello world this is voice input");
    expect(global.fetch).toHaveBeenCalled();
  });

  it("fallback parses choices message content if transcription field is missing", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: "Transcribed text from choices" } }],
      }),
    } as Response);

    const adapter = new VoxtralSttAdapter();
    const result = await adapter.transcribe(Buffer.from("audio"), "audio/wav");

    expect(result).toBe("Transcribed text from choices");
  });

  it("throws STT_PROVIDER_UNAVAILABLE (503) when gateway endpoints fail", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      text: async () => "Internal Gateway Error",
    } as Response);

    const adapter = new VoxtralSttAdapter();
    const mockBuffer = Buffer.from("audio-bytes");

    try {
      await adapter.transcribe(mockBuffer);
      expect.fail("Should have thrown AppError");
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(AppError);
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(503);
      expect(appErr.code).toBe("STT_PROVIDER_UNAVAILABLE");
    }
  });
});
