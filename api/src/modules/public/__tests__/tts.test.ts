import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { Readable } from "node:stream";

process.env.NODE_ENV = "test";
process.env.MONGODB_URI = "mongodb://localhost:27017/documind-test";
process.env.REDIS_URL = "redis://localhost:6379";

const setMetadata = vi.fn();
const close = vi.fn();

vi.mock("msedge-tts", () => {
  class FakeMsEdgeTTS {
    constructor() {}
    setMetadata(voice: string) {
      setMetadata(voice);
      return Promise.resolve();
    }
    toStream(_text: string) {
      const audioStream = Readable.from([Buffer.from("fake-mp3-bytes")]);
      const metadataStream = Readable.from([]);
      return { audioStream, metadataStream };
    }
    close() {
      close();
    }
  }
  return {
    MsEdgeTTS: FakeMsEdgeTTS,
    OUTPUT_FORMAT: {
      AUDIO_24KHZ_48KBITRATE_MONO_MP3: "audio-24khz-48kbitrate-mono-mp3",
    },
  };
});

import { clearTtsCache, ttsCacheSize } from "../tts.service.js";
import { createPublicRouter } from "../public.routes.js";
import { createRateLimiter } from "../../../common/middlewares/rateLimit.middleware.js";
import { errorHandlerMiddleware } from "../../../common/middlewares/errorHandler.middleware.js";

function createServer(): Promise<Server> {
  const app = express();
  app.use(
    "/public",
    createPublicRouter(
      createRateLimiter({
        windowMs: 60 * 1000,
        max: 30,
        message: "Too many speech requests, please try again later.",
        storePrefix: "rate-limit:tts:test:",
      }),
    ),
  );
  app.use(errorHandlerMiddleware);
  return new Promise((resolve) => {
    const srv = app.listen(0, () => resolve(srv));
  });
}

function closeServer(server: Server): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    server.close((err) => (err ? reject(err) : resolve()));
  });
}

let server: Server;
let port: number;

beforeEach(async () => {
  setMetadata.mockClear();
  close.mockClear();
  clearTtsCache();
  server = await createServer();
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("no port");
  port = address.port;
});

afterEach(async () => {
  await closeServer(server);
});

describe("GET /public/tts", () => {
  it("returns MP3 audio using the default voice when none is given", async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/public/tts?text=${encodeURIComponent("Upload a document")}`,
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("audio/mpeg");
    expect(Number(res.headers.get("content-length"))).toBeGreaterThan(0);
    expect(res.headers.get("cache-control")).toBe("public, max-age=3600");
    const bytes = Buffer.from(await res.arrayBuffer());
    expect(bytes.toString()).toBe("fake-mp3-bytes");
    expect(setMetadata).toHaveBeenCalledWith("en-US-GuyNeural");
  });

  it("accepts any allowlisted voice", async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/public/tts?text=hello&voice=${encodeURIComponent("ar-SA-HamedNeural")}`,
    );

    expect(res.status).toBe(200);
    expect(setMetadata).toHaveBeenCalledWith("ar-SA-HamedNeural");
  });

  it("rejects a voice outside the allowlist", async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/public/tts?text=hello&voice=evil-voice`,
    );
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(400);
    expect(body.error.code).toBe("VALIDATION_ERROR");
    expect(setMetadata).not.toHaveBeenCalled();
  });

  it("rejects missing or blank text", async () => {
    const missing = await fetch(`http://127.0.0.1:${port}/public/tts`);
    const blank = await fetch(
      `http://127.0.0.1:${port}/public/tts?text=${encodeURIComponent("   ")}`,
    );

    expect(missing.status).toBe(400);
    expect(blank.status).toBe(400);
    expect(setMetadata).not.toHaveBeenCalled();
  });

  it("escapes SSML metacharacters and strips control characters", async () => {
    const res = await fetch(
      `http://127.0.0.1:${port}/public/tts?text=${encodeURIComponent("<b>Hi & bye</b>\u0007\u001b")}`,
    );

    expect(res.status).toBe(200);
    expect(setMetadata).toHaveBeenCalled();
  });

  it("serves repeat requests from cache without re-synthesizing", async () => {
    const url = `http://127.0.0.1:${port}/public/tts?text=${encodeURIComponent("Same step twice")}`;

    const first = await fetch(url);
    const second = await fetch(url);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(setMetadata).toHaveBeenCalledTimes(1);
    expect(ttsCacheSize()).toBe(1);
  });

  it("maps a rate limit hit to 429", async () => {
    for (let i = 0; i < 30; i++) {
      const res = await fetch(
        `http://127.0.0.1:${port}/public/tts?text=${encodeURIComponent(`step ${i}`)}`,
      );
      expect(res.status).toBe(200);
    }
    const blocked = await fetch(
      `http://127.0.0.1:${port}/public/tts?text=${encodeURIComponent("step 31")}`,
    );
    const body = (await blocked.json()) as { error: string };

    expect(blocked.status).toBe(429);
    expect(body.error).toBe("RATE_LIMITED");
  });

  it("fails with 502 when the upstream synthesizer errors", async () => {
    const ttsService = await import("../tts.service.js");
    const spy = vi
      .spyOn(ttsService, "synthesizeText")
      .mockRejectedValueOnce(new Error("upstream unreachable"));

    const res = await fetch(
      `http://127.0.0.1:${port}/public/tts?text=${encodeURIComponent("boom")}`,
    );
    const body = (await res.json()) as { error: { code: string } };

    expect(res.status).toBe(502);
    expect(body.error.code).toBe("TTS_UPSTREAM_ERROR");
    spy.mockRestore();
  });
});
