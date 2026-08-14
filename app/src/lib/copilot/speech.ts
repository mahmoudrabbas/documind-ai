import { API_BASE_URL } from "@/constants/api";

/**
 * Voice guide mode: lets the guide tooltip read each step aloud.
 *
 * Two engines, in order:
 *  1. The app's TTS API (`GET /public/tts`) — free Microsoft neural voices
 *     (Edge Read Aloud) synthesized server-side and streamed back as MP3.
 *  2. The browser's Web Speech API as an offline fallback when the API is
 *     unreachable.
 *
 * Reliability notes:
 *  - The enabled state lives in a module singleton (mirrored to localStorage)
 *    so it survives tooltip unmounts between guide steps.
 *  - A generation counter makes each speakText call authoritative: switching
 *    steps aborts the in-flight synthesis and playback of the previous step
 *    and starts the new one cleanly.
 *  - Web Speech fallback defers ~80ms after `cancel()` because Chromium
 *    cancels an utterance enqueued synchronously after `cancel()` — that race
 *    made subsequent guide steps silent and chopped current ones.
 */

export const VOICE_PREFERENCE_KEY = "documind.guide.voice";

/** Delay between cancel() and speak() for the Web Speech fallback. */
export const SPEAK_DEFER_MS = 80;

/** How long to wait for Web Speech voices to load before speaking. */
export const VOICES_LOAD_TIMEOUT_MS = 2_000;

const SPEECH_LANG: Record<"en" | "ar", string> = {
  en: "en-US",
  ar: "ar-SA",
};

/** Neural voices served by the TTS API, matching the API allowlist. */
export const TTS_VOICE_BY_LOCALE: Record<"en" | "ar", string> = {
  en: "en-US-GuyNeural",
  ar: "ar-SA-HamedNeural",
};

export const TTS_API_PATH = "/public/tts";

/** Preferred Web Speech voices in order (fallback engine only). */
const VOICE_PREFERENCES: Record<"en" | "ar", readonly string[]> = {
  en: [
    "Google US English",
    "Microsoft Aria Online (Natural)",
    "Microsoft Jenny Online (Natural)",
    "Microsoft Guy Online (Natural)",
    "Samantha",
    "Alex",
    "Daniel",
    "Google UK English Female",
    "Google UK English Male",
  ],
  ar: [
    "Google العربية",
    "Microsoft Hoda",
    "Faris",
    "Naayf",
  ],
};

export interface GuiVoice {
  name: string;
  lang: string;
  default: boolean;
  localService: boolean;
}

let voiceEnabled: boolean | null = null;
let playbackGeneration = 0;
let deferredSpeakTimer: number | null = null;
let activeAudio: HTMLAudioElement | null = null;
let activeObjectUrl: string | null = null;
let activeAbortController: AbortController | null = null;

/**
 * The guide can always speak in a browser: the TTS API is part of the app,
 * and the Web Speech fallback covers API outages.
 */
export function isSpeechSupported(): boolean {
  return typeof window !== "undefined";
}

/** Pick the best available Web Speech voice for the locale, or null. */
export function pickVoice(
  locale: "en" | "ar",
  voices: readonly GuiVoice[],
): GuiVoice | null {
  if (voices.length === 0) return null;
  const names = VOICE_PREFERENCES[locale];
  for (const name of names) {
    const match = voices.find((voice) => voice.name === name);
    if (match) return match;
  }
  const langPrefix = locale === "ar" ? "ar" : "en";
  return (
    voices.find((voice) => voice.lang.toLowerCase().startsWith(langPrefix)) ??
    null
  );
}

// ── TTS API engine ───────────────────────────────────────────────────────────

function stopApiPlayback(): void {
  if (activeAbortController) {
    activeAbortController.abort();
    activeAbortController = null;
  }
  if (activeAudio) {
    activeAudio.pause();
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio = null;
  }
  if (activeObjectUrl) {
    URL.revokeObjectURL(activeObjectUrl);
    activeObjectUrl = null;
  }
}

async function speakViaApi(
  text: string,
  locale: "en" | "ar",
  generation: number,
): Promise<void> {
  const controller = new AbortController();
  activeAbortController = controller;

  const params = new URLSearchParams({
    text,
    voice: TTS_VOICE_BY_LOCALE[locale],
  });
  const response = await fetch(`${API_BASE_URL}${TTS_API_PATH}?${params}`, {
    signal: controller.signal,
  });
  if (!response.ok) throw new Error(`tts request failed with ${response.status}`);
  const blob = await response.blob();
  if (generation !== playbackGeneration || controller.signal.aborted) return;

  const audio = new Audio();
  const objectUrl = URL.createObjectURL(blob);
  activeAudio = audio;
  activeObjectUrl = objectUrl;
  audio.preload = "auto";
  audio.onended = () => {
    if (activeAudio === audio) {
      activeAudio = null;
      if (activeObjectUrl) {
        URL.revokeObjectURL(activeObjectUrl);
        activeObjectUrl = null;
      }
    }
  };
  audio.src = objectUrl;
  try {
    await audio.play();
  } catch {
    // Autoplay policies or a vanished element: nothing else to do.
  }
}

// ── Web Speech fallback engine ───────────────────────────────────────────────

function currentVoices(): GuiVoice[] {
  const synth = window.speechSynthesis;
  return typeof synth.getVoices === "function"
    ? (synth.getVoices() as GuiVoice[])
    : [];
}

function onVoicesLoaded(callback: () => void): void {
  const synth = window.speechSynthesis;
  const handle = () => {
    synth.removeEventListener?.("voiceschanged", handle);
    callback();
  };
  synth.addEventListener?.("voiceschanged", handle);
  window.setTimeout(() => {
    synth.removeEventListener?.("voiceschanged", handle);
  }, VOICES_LOAD_TIMEOUT_MS);
}

function speakNow(text: string, locale: "en" | "ar"): boolean {
  if (!isSpeechSupported() || !text.trim()) return false;
  const synth = window.speechSynthesis;
  const utterance = new window.SpeechSynthesisUtterance(text);
  utterance.lang = SPEECH_LANG[locale];
  utterance.rate = 1;
  utterance.pitch = 1;
  utterance.volume = 1;
  const voice = pickVoice(locale, currentVoices());
  if (voice) utterance.voice = voice as unknown as SpeechSynthesisVoice;
  synth.speak(utterance);
  return voice !== null;
}

function cancelFallback(): void {
  if (deferredSpeakTimer !== null) {
    window.clearTimeout(deferredSpeakTimer);
    deferredSpeakTimer = null;
  }
  if (!isSpeechSupported()) return;
  window.speechSynthesis.cancel();
}

function speakViaWebSpeech(text: string, locale: "en" | "ar"): void {
  if (!isSpeechSupported() || !text.trim()) return;
  const synth = window.speechSynthesis;
  if (deferredSpeakTimer !== null) {
    window.clearTimeout(deferredSpeakTimer);
  }
  synth.cancel();

  const enqueue = () => {
    deferredSpeakTimer = null;
    const spokeWithVoice = speakNow(text, locale);
    if (!spokeWithVoice) {
      onVoicesLoaded(() => speakNow(text, locale));
    }
  };

  deferredSpeakTimer = window.setTimeout(enqueue, SPEAK_DEFER_MS);
}

// ── Public API ───────────────────────────────────────────────────────────────

/**
 * Speak a step aloud: TTS API first, Web Speech fallback on failure. Each
 * call supersedes any in-flight or pending speech from a previous call.
 */
export function speakText(text: string, locale: "en" | "ar"): void {
  if (!text.trim() || typeof window === "undefined") return;

  const generation = ++playbackGeneration;
  cancelFallback();
  stopApiPlayback();

  void speakViaApi(text, locale, generation).catch(() => {
    if (generation !== playbackGeneration) return;
    speakViaWebSpeech(text, locale);
  });
}

/** Stop current speech and drop any pending speak requests. */
export function cancelSpeech(): void {
  playbackGeneration += 1;
  cancelFallback();
  stopApiPlayback();
}

/** Module-singleton enabled state, lazily initialised from localStorage. */
export function getVoicePreference(): boolean {
  if (voiceEnabled !== null) return voiceEnabled;
  if (typeof window === "undefined") {
    voiceEnabled = false;
    return false;
  }
  voiceEnabled = window.localStorage.getItem(VOICE_PREFERENCE_KEY) === "1";
  return voiceEnabled;
}

export function setVoicePreference(enabled: boolean): void {
  voiceEnabled = Boolean(enabled);
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(VOICE_PREFERENCE_KEY, voiceEnabled ? "1" : "0");
  } catch {
    // Private browsing modes can throw on write; the singleton still holds.
  }
}