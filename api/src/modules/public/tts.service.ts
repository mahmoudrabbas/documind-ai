import { MsEdgeTTS, OUTPUT_FORMAT, type ProsodyOptions } from "msedge-tts";

/**
 * Text-to-speech via Microsoft Edge's neural voices (the same voices the
 * Edge "Read Aloud" feature uses). Free, no API key, server-side only — the
 * Read Aloud endpoint rejects browser user agents, so this runs on the API.
 *
 * Design notes:
 *  - Input is sanitized: control characters are stripped, SSML-special
 *    characters escaped, and text length capped before synthesis.
 *  - Voices are constrained to an explicit allowlist (locale pairs we have
 *    deliberately chosen) so clients can only ever select our curated set.
 *  - Audio buffers are cached in a small in-memory LRU so repeated guide
 *    steps (and identical texts) never hit Microsoft twice.
 */

export const DEFAULT_VOICE = "en-US-GuyNeural";

/** Curated, allowlisted voice set with a matching locale mapping per pair. */
export const TTS_VOICE_ALLOWLIST: readonly string[] = [
  // English
  "en-US-GuyNeural", // natural male
  "en-US-JennyNeural", // natural female
  "en-US-ChristopherNeural", // deep male
  "en-US-AriaNeural", // warm female
  "en-GB-SoniaNeural", // British female
  "en-GB-RyanNeural", // British male
  // Arabic
  "ar-SA-HamedNeural", // male
  "ar-SA-ZariyahNeural", // female
  "ar-EG-SalmaNeural", // Egyptian female
  "ar-EG-ShakirNeural", // Egyptian male
];

/** Voices selected for each guide locale when none is requested explicitly. */
export const TTS_VOICE_BY_LOCALE: Record<"en" | "ar", string> = {
  en: "en-US-GuyNeural",
  ar: "ar-SA-HamedNeural",
};

export const MAX_TEXT_LENGTH = 1000;
const MAX_CACHE_ENTRIES = 50;

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

export function isVoiceAllowed(voice: string | null | undefined): boolean {
  return typeof voice === "string" && TTS_VOICE_ALLOWLIST.includes(voice);
}

/**
 * Normalize input for synthesis: strip control characters, escape SSML
 * metacharacters so user text can never inject XML, and cap the length.
 */
export function sanitizeText(raw: string): string {
  const cleaned = raw.replace(CONTROL_CHARS, "").trim();
  return cleaned
    .slice(0, MAX_TEXT_LENGTH)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

const OUTPUT_FORMAT_VALUE = OUTPUT_FORMAT.AUDIO_24KHZ_48KBITRATE_MONO_MP3;

function createSynthesizer() {
  return new MsEdgeTTS({ enableLogger: false });
}

/** Collect all audio chunks for a single synthesis into one Buffer. */
export async function synthesizeOnce(
  text: string,
  voice: string,
  prosody: ProsodyOptions = { rate: 1, pitch: "+0Hz", volume: "+0%" },
): Promise<Buffer> {
  const tts = createSynthesizer();
  try {
    await tts.setMetadata(voice, OUTPUT_FORMAT_VALUE);
    const { audioStream, metadataStream } = tts.toStream(text, prosody);
    if (metadataStream) {
      // The audio stream only flows once its paired metadata stream is
      // consumed; drain it eagerly so synthesis completes.
      metadataStream.resume();
    }
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk as Buffer);
    }
    const audio = Buffer.concat(chunks);
    if (audio.length === 0) {
      throw new Error("TTS synthesis returned no audio");
    }
    return audio;
  } finally {
    tts.close();
  }
}

/** Tiny LRU audio cache keyed by `${voice}\u0000${text}`. */
class AudioCache {
  private readonly entries = new Map<string, Buffer>();

  get(key: string): Buffer | undefined {
    const hit = this.entries.get(key);
    if (hit) {
      this.entries.delete(key);
      this.entries.set(key, hit);
    }
    return hit;
  }

  set(key: string, audio: Buffer): void {
    if (this.entries.has(key)) this.entries.delete(key);
    this.entries.set(key, audio);
    if (this.entries.size > MAX_CACHE_ENTRIES) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }

  clear(): void {
    this.entries.clear();
  }

  get size(): number {
    return this.entries.size;
  }
}

const audioCache = new AudioCache();

export function ttsCacheSize(): number {
  return audioCache.size;
}

export function clearTtsCache(): void {
  audioCache.clear();
}

/**
 * Synthesize (or serve from cache) speech audio for the given text + voice.
 * The text must already be sanitized by {@link sanitizeText}.
 */
export async function synthesizeText(
  sanitizedText: string,
  voice: string,
): Promise<Buffer> {
  const key = `${voice}\u0000${sanitizedText}`;
  const cached = audioCache.get(key);
  if (cached) return cached;

  const audio = await synthesizeOnce(sanitizedText, voice);
  audioCache.set(key, audio);
  return audio;
}