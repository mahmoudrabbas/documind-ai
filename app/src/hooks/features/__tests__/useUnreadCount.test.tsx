// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  useUnreadCount,
  UNREAD_COUNT_POLL_INTERVAL_MS,
} from "../useUnreadCount";
import { getUnreadCount } from "@/services/notifications.service";

vi.mock("@/services/notifications.service", () => ({
  getUnreadCount: vi.fn(),
}));

const getUnreadCountMock = vi.mocked(getUnreadCount);

let result: ReturnType<typeof useUnreadCount> | undefined;
const mountedRoots: Array<ReturnType<typeof createRoot>> = [];

function Probe() {
  // eslint-disable-next-line react-hooks/globals -- Test harness: capture the hook result into an outer variable for assertions.
  result = useUnreadCount();
  return null;
}

async function mountProbe() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  mountedRoots.push(root);
  await act(async () => {
    root.render(<Probe />);
  });
  return { container, root };
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

describe("useUnreadCount", () => {
  beforeEach(() => {
    vi.useFakeTimers({
      toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval", "Date"],
    });
    vi.clearAllMocks();
    result = undefined;
  });

  afterEach(() => {
    for (const root of mountedRoots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  it("fetches the unread count immediately on mount", async () => {
    getUnreadCountMock.mockResolvedValue(unreadResponse(5));
    await mountProbe();
    await flushMicrotasks();

    expect(getUnreadCountMock).toHaveBeenCalledTimes(1);
    expect(result?.count).toBe(5);
    expect(result?.byPriority.normal).toBe(5);
    expect(result?.isLoading).toBe(false);
    expect(result?.error).toBeNull();
  });

  it("surfaces an error state without crashing when the API fails", async () => {
    getUnreadCountMock.mockRejectedValue(new Error("Network error"));
    await mountProbe();
    await flushMicrotasks();

    expect(result?.error).toBe("Network error");
    expect(result?.count).toBe(0);
  });

  it("polls on the 30s interval and updates state", async () => {
    getUnreadCountMock
      .mockResolvedValueOnce(unreadResponse(5))
      .mockResolvedValueOnce(unreadResponse(8));
    await mountProbe();
    await flushMicrotasks();
    expect(getUnreadCountMock).toHaveBeenCalledTimes(1);
    expect(result?.count).toBe(5);

    await act(async () => {
      vi.advanceTimersByTime(UNREAD_COUNT_POLL_INTERVAL_MS);
    });
    await flushMicrotasks();

    expect(getUnreadCountMock).toHaveBeenCalledTimes(2);
    expect(result?.count).toBe(8);
  });

  it("clears the polling interval on unmount", async () => {
    getUnreadCountMock.mockResolvedValue(unreadResponse(0));
    const { root } = await mountProbe();
    await flushMicrotasks();
    expect(getUnreadCountMock).toHaveBeenCalledTimes(1);

    await act(async () => root.unmount());
    await act(async () => {
      vi.advanceTimersByTime(UNREAD_COUNT_POLL_INTERVAL_MS * 4);
    });
    await flushMicrotasks();

    // No further polls after unmount.
    expect(getUnreadCountMock).toHaveBeenCalledTimes(1);
  });
});
