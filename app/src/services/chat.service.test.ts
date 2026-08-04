import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, API_BASE_URL } from "@/lib/api-client";
import { getAccessToken } from "@/lib/auth-tokens";
import { getLocaleFromCookie } from "@/lib/i18n/i18n.utils";
import type { ChatSource } from "@/types/api/chat.types";
import { streamChat } from "./chat.service";

vi.mock("@/lib/auth-tokens", () => ({
  getAccessToken: vi.fn(),
  setAccessToken: vi.fn(),
  clearAccessToken: vi.fn(),
}));

vi.mock("@/lib/i18n/i18n.utils", () => ({
  getLocaleFromCookie: vi.fn(),
}));

const noopCallbacks = {
  onToken: () => undefined,
  onSources: () => undefined,
  onDone: () => undefined,
};

let fetchMock: ReturnType<typeof vi.fn>;

function streamResponse(body: ReadableStream<Uint8Array>): Response {
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    body,
  } as unknown as Response;
}

beforeEach(() => {
  vi.mocked(getAccessToken).mockReturnValue("test-token");
  vi.mocked(getLocaleFromCookie).mockReturnValue("en");
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});

describe("streamChat", () => {
  it("streams token/sources/done events in order and resolves after done", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode(
            'data: {"type":"token","content":"Hel"}\n\n' +
              'data: {"type":"token","content":"lo"}\n\n' +
              'data: {"type":"sources","sources":[{"chunkId":"c1"}]}\n\n' +
              'data: {"type":"done","messageId":"m1","conversationId":"c1"}\n\n',
          ),
        );
        controller.close();
      },
    });
    fetchMock.mockResolvedValue(streamResponse(body));

    const tokens: string[] = [];
    let sources: ChatSource[] = [];
    let done: { messageId: string; conversationId: string } | null = null;

    await streamChat(
      { message: "hello", conversationId: "c0" },
      {
        onToken: (content) => tokens.push(content),
        onSources: (next) => {
          sources = next;
        },
        onDone: (payload) => {
          done = payload;
        },
      },
    );

    expect(tokens).toEqual(["Hel", "lo"]);
    expect(sources).toEqual([{ chunkId: "c1" }]);
    expect(done).toEqual({ messageId: "m1", conversationId: "c1" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${API_BASE_URL}/chat/stream`);
    const headers = new Headers(init?.headers);
    expect(headers.get("Content-Type")).toBe("application/json");
    expect(headers.get("Accept-Language")).toBe("en");
    expect(headers.get("Authorization")).toBe("Bearer test-token");
    expect(init?.credentials).toBe("include");
    expect(init?.body).toBe(
      JSON.stringify({ message: "hello", conversationId: "c0" }),
    );
  });

  it("maps a 429 with a retry-after header to an ApiError with retryAfterSeconds", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers({ "retry-after": "30" }),
      json: async () => ({
        error: "ENTITLEMENT_EXCEEDED",
        message: "Monthly query limit reached",
      }),
    } as unknown as Response);

    await expect(streamChat({ message: "hi" }, noopCallbacks)).rejects.toBeInstanceOf(
      ApiError,
    );
    await expect(
      streamChat({ message: "hi" }, noopCallbacks),
    ).rejects.toMatchObject({
      status: 429,
      code: "ENTITLEMENT_EXCEEDED",
      message: "Monthly query limit reached",
      retryAfterSeconds: 30,
    });
  });

  it("maps a nested error envelope preferring the body retryAfterSeconds", async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      status: 429,
      headers: new Headers(),
      json: async () => ({
        error: {
          code: "ENTITLEMENT_EXCEEDED",
          message: "Quota exceeded",
          details: {},
        },
        retryAfterSeconds: 45,
      }),
    } as unknown as Response);

    await expect(
      streamChat({ message: "hi" }, noopCallbacks),
    ).rejects.toMatchObject({
      status: 429,
      code: "ENTITLEMENT_EXCEEDED",
      message: "Quota exceeded",
      retryAfterSeconds: 45,
    });
  });

  it("rejects with STREAM_ERROR when the SSE stream emits an error event", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(
          new TextEncoder().encode('data: {"type":"error","message":"boom"}\n\n'),
        );
        controller.close();
      },
    });
    fetchMock.mockResolvedValue(streamResponse(body));

    await expect(streamChat({ message: "hi" }, noopCallbacks)).rejects.toMatchObject({
      status: 0,
      code: "STREAM_ERROR",
      message: "boom",
    });
  });

  it("parses events split across separate read() chunks (buffer logic)", async () => {
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"type":"token","content":"He'));
        controller.enqueue(
          new TextEncoder().encode(
            'l"}\n\ndata: {"type":"sources","sources":[]}\n\n' +
              'data: {"type":"done","messageId":"m1","conversationId":"c1"}\n\n',
          ),
        );
        controller.close();
      },
    });
    fetchMock.mockResolvedValue(streamResponse(body));

    const tokens: string[] = [];
    let sources: ChatSource[] | null = null;
    let done: { messageId: string; conversationId: string } | null = null;

    await streamChat(
      { message: "hello" },
      {
        onToken: (content) => tokens.push(content),
        onSources: (next) => {
          sources = next;
        },
        onDone: (payload) => {
          done = payload;
        },
      },
    );

    expect(tokens).toEqual(["Hel"]);
    expect(sources).toEqual([]);
    expect(done).toEqual({ messageId: "m1", conversationId: "c1" });
  });
});
