import { describe, it, expect, afterEach, beforeEach, beforeAll, afterAll, vi } from "vitest";
import {
  cancelSpeech,
  getVoicePreference,
  isSpeechSupported,
  pickVoice,
  setVoicePreference,
  speakText,
  VOICE_PREFERENCE_KEY,
  SPEAK_DEFER_MS,
  TTS_API_PATH,
  TTS_VOICE_BY_LOCALE,
} from "@/lib/copilot/speech";
import type { GuiVoice } from "@/lib/copilot/speech";

interface WindowStub {
  localStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
  };
  setTimeout?: typeof setTimeout;
  clearTimeout?: typeof clearTimeout;
  speechSynthesis?: {
    getVoices?: () => GuiVoice[];
    cancel: () => void;
    speak: (utterance: unknown) => void;
    addEventListener?: (event: string, handler: () => void) => void;
    removeEventListener?: (event: string, handler: () => void) => void;
  };
  SpeechSynthesisUtterance?: new (
    text: string,
  ) => { lang: string; rate: number; pitch: number; volume: number };
}

const storage = new Map<string, string>();
const localStorageStub: WindowStub["localStorage"] = {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => void storage.set(key, value),
  removeItem: (key) => void storage.delete(key),
};

function installWindow(stub: Partial<WindowStub> = {}): void {
  (globalThis as { window?: WindowStub }).window = {
    localStorage: localStorageStub,
    setTimeout: globalThis.setTimeout,
    clearTimeout: globalThis.clearTimeout,
    ...stub,
  };
}

class AudioStub {
  static instances: AudioStub[] = [];
  src = "";
  preload = "auto";
  onended: (() => void) | null = null;
  onerror: (() => void) | null = null;
  play = vi.fn(async () => undefined);
  pause = vi.fn();
  constructor() {
    AudioStub.instances.push(this);
  }
}

function installSpeechStub(voiceList: GuiVoice[] = []) {
  const synth = {
    getVoices: vi.fn(() => voiceList),
    cancel: vi.fn(),
    speak: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  };
  installWindow({
    speechSynthesis: synth,
    SpeechSynthesisUtterance: class {
      lang = "";
      rate = 1;
      pitch = 1;
      volume = 1;
      constructor(public text: string) {}
    },
  });
  return synth;
}

let fetchMock: ReturnType<typeof vi.fn>;

async function flushMicrotasks(): Promise<void> {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

function mockTtsResponse(): void {
  fetchMock.mockResolvedValue(
    new Response(new Blob(["fake-audio"], { type: "audio/mpeg" }), {
      status: 200,
    }),
  );
}

beforeAll(() => {
  Object.defineProperty(URL, "createObjectURL", {
    configurable: true,
    value: vi.fn(() => "blob:test-url"),
  });
  Object.defineProperty(URL, "revokeObjectURL", {
    configurable: true,
    value: vi.fn(),
  });
});

afterAll(() => {
  delete (URL as { createObjectURL?: unknown }).createObjectURL;
  delete (URL as { revokeObjectURL?: unknown }).revokeObjectURL;
});

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("Audio", AudioStub);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  setVoicePreference(false);
  storage.clear();
  AudioStub.instances.length = 0;
  delete (globalThis as { window?: WindowStub }).window;
});

describe("voice guide mode (speech)", () => {
  it("is unsupported outside a browser", () => {
    expect(isSpeechSupported()).toBe(false);
  });

  it("persists the opt-in preference", () => {
    installWindow({});
    expect(getVoicePreference()).toBe(false);
    setVoicePreference(true);
    expect(getVoicePreference()).toBe(true);
    expect(storage.get(VOICE_PREFERENCE_KEY)).toBe("1");
    setVoicePreference(false);
    expect(getVoicePreference()).toBe(false);
  });

  it("keeps the enabled state in memory across tooltip remounts", () => {
    installWindow({});
    setVoicePreference(true);
    expect(getVoicePreference()).toBe(true);
  });

  it("speaks via the TTS API with the locale voice and plays the audio", async () => {
    const synth = installSpeechStub();
    mockTtsResponse();

    speakText("Upload a document", "en");
    await flushMicrotasks();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toContain(TTS_API_PATH);
    expect(url).toContain(
      `voice=${encodeURIComponent(TTS_VOICE_BY_LOCALE.en)}`,
    );
    expect(url).toContain("text=Upload+a+document");
    expect(init.signal).toBeInstanceOf(AbortSignal);

    expect(AudioStub.instances).toHaveLength(1);
    const audio = AudioStub.instances[0]!;
    expect(audio.src).toBe("blob:test-url");
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("speaks Arabic steps with the Arabic neural voice", async () => {
    installSpeechStub();
    mockTtsResponse();

    speakText("ارفع مستندًا", "ar");
    await flushMicrotasks();

    const [url] = fetchMock.mock.calls[0] as [string];
    expect(url).toContain(`voice=${encodeURIComponent(TTS_VOICE_BY_LOCALE.ar)}`);
  });

  it("a new speakText aborts and supersedes the in-flight one", async () => {
    const synth = installSpeechStub();
    let resolveFirst: (response: Response) => void = () => {};
    fetchMock
      .mockReturnValueOnce(new Promise<Response>((resolve) => {
        resolveFirst = resolve;
      }))
      .mockImplementationOnce(async () => new Response(new Blob(["fake-audio"]), { status: 200 }));

    speakText("First step", "en");
    const [, firstInit] = fetchMock.mock.calls[0] as [string, RequestInit];
    speakText("Second step", "en");
    resolveFirst(new Response(new Blob(["fake-audio"]), { status: 200 }));
    await flushMicrotasks();

    expect((firstInit.signal as AbortSignal).aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(AudioStub.instances).toHaveLength(1);
    expect(AudioStub.instances[0]!.play).toHaveBeenCalledTimes(1);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("cancelSpeech aborts in-flight playback without a fallback", async () => {
    const synth = installSpeechStub();
    let resolveFetch: (response: Response) => void = () => {};
    fetchMock.mockReturnValueOnce(
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
    );

    speakText("Upload a document", "en");
    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    cancelSpeech();
    resolveFetch(new Response(new Blob(["fake-audio"]), { status: 200 }));
    await flushMicrotasks();

    expect((init.signal as AbortSignal).aborted).toBe(true);
    expect(AudioStub.instances).toHaveLength(0);
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("falls back to Web Speech (deferred) when the API is unreachable", async () => {
    vi.useFakeTimers();
    const synth = installSpeechStub([{ name: "Samantha", lang: "en-US", default: true, localService: true }]);
    fetchMock.mockRejectedValue(new Error("network down"));

    speakText("Upload a document", "en");
    await vi.advanceTimersByTimeAsync(SPEAK_DEFER_MS);

    expect(synth.cancel.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(synth.speak).toHaveBeenCalledTimes(1);
    const spoken = synth.speak.mock.calls[0][0] as {
      text: string;
      lang: string;
    };
    expect(spoken.text).toBe("Upload a document");
    expect(spoken.lang).toBe("en-US");
  });

  it("does not fall back when a newer step superseded the failed one", async () => {
    vi.useFakeTimers();
    const synth = installSpeechStub();
    fetchMock.mockRejectedValue(new Error("network down"));

    speakText("First step", "en");
    await flushMicrotasks();
    speakText("Second step", "en");
    await vi.advanceTimersByTimeAsync(SPEAK_DEFER_MS);

    expect(synth.speak).toHaveBeenCalledTimes(1);
    const spoken = synth.speak.mock.calls[0][0] as { text: string };
    expect(spoken.text).toBe("Second step");
  });

  it("cancelSpeech clears a pending fallback utterance", async () => {
    vi.useFakeTimers();
    const synth = installSpeechStub();
    fetchMock.mockRejectedValue(new Error("network down"));

    speakText("Upload a document", "en");
    await flushMicrotasks();
    cancelSpeech();
    await vi.advanceTimersByTimeAsync(SPEAK_DEFER_MS);

    expect(synth.speak).not.toHaveBeenCalled();
  });

  it("cancelSpeech cancels without throwing when unsupported", () => {
    expect(() => cancelSpeech()).not.toThrow();
  });

  it("pickVoice prefers ranked voices and falls back to the locale language", () => {
    expect(
      pickVoice("en", [
        { name: "Samantha", lang: "en-US", default: false, localService: true },
        { name: "Google US English", lang: "en-US", default: true, localService: false },
      ]),
    ).toEqual({ name: "Google US English", lang: "en-US", default: true, localService: false });
    expect(
      pickVoice("ar", [
        { name: "Microsoft Hoda", lang: "ar-SA", default: false, localService: true },
      ]),
    ).toEqual({ name: "Microsoft Hoda", lang: "ar-SA", default: false, localService: true });
    expect(
      pickVoice("en", [
        { name: "Rémi", lang: "fr-FR", default: true, localService: true },
      ]),
    ).toBeNull();
    expect(pickVoice("ar", [])).toBeNull();
  });
});