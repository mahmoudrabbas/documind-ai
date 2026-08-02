// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { act, createElement, type ReactElement } from "react";
import { createRoot } from "react-dom/client";
import { io } from "socket.io-client";
import { API_BASE_URL } from "@/constants/api";
import {
  getAccessToken,
  setAccessToken,
  clearAccessToken,
} from "@/lib/auth-tokens";
import {
  useNotificationSocket,
  type UseNotificationSocketResult,
} from "./useNotificationSocket";
import {
  useUnreadCount,
  UNREAD_COUNT_POLL_INTERVAL_MS,
} from "./useUnreadCount";
import { getUnreadCount } from "@/services/notifications.service";

/* ── Module mocks (hoisted by vitest) ─────────────────────────────────── */

vi.mock("socket.io-client", () => ({ io: vi.fn() }));
vi.mock("@/services/notifications.service", () => ({
  getUnreadCount: vi.fn(),
}));

const ioMock = vi.mocked(io);
const getUnreadCountMock = vi.mocked(getUnreadCount);

/* ── Fake socket (records handlers; never touches the network) ─────────── */

interface FakeSocket {
  on: Mock;
  disconnect: Mock;
  removeAllListeners: Mock;
  emitEvent: (event: string, ...args: unknown[]) => void;
}

function createFakeSocket(): FakeSocket {
  const emitHandlers = new Map<string, Array<(...args: unknown[]) => void>>();
  const socket: FakeSocket = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const list = emitHandlers.get(event) ?? [];
      list.push(handler);
      emitHandlers.set(event, list);
      return socket;
    }) as Mock,
    disconnect: vi.fn(),
    removeAllListeners: vi.fn(),
    emitEvent: (event: string, ...args: unknown[]) => {
      for (const handler of emitHandlers.get(event) ?? []) {
        handler(...args);
      }
    },
  };
  return socket;
}

/* ── Test harness (mirrors useUnreadCount.test.tsx) ────────────────────── */

let result: UseNotificationSocketResult | undefined;
const mountedRoots: Array<ReturnType<typeof createRoot>> = [];

function Probe({
  onNotificationCreated,
  onNotificationUpdated,
}: {
  onNotificationCreated?: () => void;
  onNotificationUpdated?: () => void;
}) {
  // eslint-disable-next-line react-hooks/globals -- Test harness: capture the hook result into an outer variable for assertions.
  result = useNotificationSocket({ onNotificationCreated, onNotificationUpdated });
  return null;
}

async function mountNode(node: ReactElement) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(node);
  });
  return root;
}

async function mountProbe(
  props: { onNotificationCreated?: () => void; onNotificationUpdated?: () => void } = {},
) {
  const root = await mountNode(createElement(Probe, props));
  const lastCall = ioMock.mock.results[ioMock.mock.results.length - 1];
  const socket = lastCall ? (lastCall.value as FakeSocket) : undefined;
  return { root, socket };
}

/** Flush pending microtasks (mock resolution → setState) inside act. */
async function flushMicrotasks() {
  await act(async () => {
    for (let i = 0; i < 5; i += 1) {
      await Promise.resolve();
    }
  });
}

const unreadResponse = (count: number) => ({
  success: true,
  data: {
    count,
    byPriority: {
      critical: count > 0 ? 1 : 0,
      high: 0,
      normal: count,
      low: 0,
    },
  },
});

/* ── Tests ────────────────────────────────────────────────────────────── */

describe("useNotificationSocket", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: [
        "setTimeout",
        "clearTimeout",
        "setInterval",
        "clearInterval",
        "Date",
      ],
    });
    vi.clearAllMocks();
    result = undefined;
    setAccessToken("test-access-token");
  });

  afterEach(() => {
    for (const root of mountedRoots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = "";
    clearAccessToken();
    vi.useRealTimers();
  });

  it("connects to the API base URL with the access token from getAccessToken()", async () => {
    setAccessToken("token-abc");
    const socket = createFakeSocket();
    ioMock.mockReturnValue(socket as any);

    const { root } = await mountProbe();

    expect(ioMock).toHaveBeenCalledTimes(1);
    expect(ioMock).toHaveBeenCalledWith(API_BASE_URL, {
      auth: { token: "token-abc" },
    });
    // Connected only after the socket reports the transport is up.
    expect(result?.connected).toBe(false);

    await act(async () => root.unmount());
  });

  it("tracks connected=true after connect and false after disconnect", async () => {
    const socket = createFakeSocket();
    ioMock.mockReturnValue(socket as any);
    await mountProbe();

    act(() => socket.emitEvent("connect"));
    expect(result?.connected).toBe(true);

    act(() => socket.emitEvent("disconnect"));
    expect(result?.connected).toBe(false);
  });

  it("calls onNotificationCreated when notification:created arrives", async () => {
    const onNotificationCreated = vi.fn();
    const socket = createFakeSocket();
    ioMock.mockReturnValue(socket as any);
    await mountProbe({ onNotificationCreated });

    act(() => socket.emitEvent("notification:created", { id: "n1" }));

    expect(onNotificationCreated).toHaveBeenCalledTimes(1);
  });

  it("calls onNotificationUpdated when notification:updated arrives", async () => {
    const onNotificationUpdated = vi.fn();
    const socket = createFakeSocket();
    ioMock.mockReturnValue(socket as any);
    await mountProbe({ onNotificationUpdated });

    act(() =>
      socket.emitEvent("notification:updated", {
        notificationId: "n1",
        changes: { isRead: true },
      }),
    );

    expect(onNotificationUpdated).toHaveBeenCalledTimes(1);
  });

  it("uses the latest provided callbacks without reconnecting", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const socket = createFakeSocket();
    ioMock.mockReturnValue(socket as any);
    const { root } = await mountProbe({ onNotificationCreated: first });
    expect(ioMock).toHaveBeenCalledTimes(1);

    // Re-render with a new callback object — the socket must NOT reconnect.
    await act(async () => {
      root.render(createElement(Probe, { onNotificationCreated: second }));
    });
    expect(ioMock).toHaveBeenCalledTimes(1);

    act(() => socket.emitEvent("notification:created", { id: "n1" }));
    expect(second).toHaveBeenCalledTimes(1);
    expect(first).not.toHaveBeenCalled();
  });

  it("disconnects and removes listeners on unmount", async () => {
    const socket = createFakeSocket();
    ioMock.mockReturnValue(socket as any);
    const { root } = await mountProbe();

    await act(async () => root.unmount());

    expect(socket.removeAllListeners).toHaveBeenCalledTimes(1);
    expect(socket.disconnect).toHaveBeenCalledTimes(1);
  });

  it("connect error → connected=false and the 30s poll fallback keeps polling", async () => {
    getUnreadCountMock.mockResolvedValue(unreadResponse(3));
    const socket = createFakeSocket();
    ioMock.mockReturnValue(socket as any);
    const onNotificationCreated = vi.fn();
    const onNotificationUpdated = vi.fn();

    // Combined probe: the unread poll (fallback) + the socket side by side.
    let unreadResult: ReturnType<typeof useUnreadCount> | undefined;
    function CombinedProbe() {
      unreadResult = useUnreadCount();
      // eslint-disable-next-line react-hooks/globals -- Test harness capture.
      result = useNotificationSocket({ onNotificationCreated, onNotificationUpdated });
      return null;
    }

    const root = await mountNode(createElement(CombinedProbe));
    await flushMicrotasks();
    expect(getUnreadCountMock).toHaveBeenCalledTimes(1);

    // A rejected handshake surfaces as connect_error — the hook reports it and
    // must NOT fire any refresh callbacks on its own.
    act(() => socket.emitEvent("connect_error", new Error("unauthorized")));
    expect(result?.connected).toBe(false);
    expect(onNotificationCreated).not.toHaveBeenCalled();
    expect(onNotificationUpdated).not.toHaveBeenCalled();

    // The 30s poll fallback is untouched: it still fires on its interval.
    await act(async () => {
      vi.advanceTimersByTime(UNREAD_COUNT_POLL_INTERVAL_MS);
    });
    await flushMicrotasks();
    expect(getUnreadCountMock).toHaveBeenCalledTimes(2);

    // getAccessToken stays available for the caller (no auth-storage change).
    expect(getAccessToken()).toBe("test-access-token");

    await act(async () => root.unmount());
  });
});
