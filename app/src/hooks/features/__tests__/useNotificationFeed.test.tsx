// @vitest-environment jsdom
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { useNotificationFeed } from "../useNotificationFeed";
import {
  listNotifications,
  markRead,
} from "@/services/notifications.service";
import type { Notification } from "@/types/api/notifications.types";

vi.mock("@/services/notifications.service", () => ({
  listNotifications: vi.fn(),
  markRead: vi.fn(),
}));

const listNotificationsMock = vi.mocked(listNotifications);
const markReadMock = vi.mocked(markRead);

let result: ReturnType<typeof useNotificationFeed> | undefined;
const mountedRoots: Array<ReturnType<typeof createRoot>> = [];

function Probe() {
  // eslint-disable-next-line react-hooks/globals -- Test harness: capture the hook result into an outer variable for assertions.
  result = useNotificationFeed();
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

function makeNotification(id: string, isRead = false): Notification {
  return {
    id,
    type: "processing_failed",
    category: "documents",
    priority: "high",
    title: { en: "Processing failed", ar: "فشلت المعالجة" },
    body: {
      en: "A document failed to process",
      ar: "فشل معالجة مستند",
    },
    source: { type: "document", id: "doc-1", displayName: "report.pdf" },
    actions: [],
    isRead,
    readAt: null,
    isSeen: false,
    seenAt: null,
    isArchived: false,
    archivedAt: null,
    lifecycleState: "VISIBLE",
    version: 1,
    collapsedCount: 0,
    createdAt: "2026-08-01T10:00:00.000Z",
    updatedAt: "2026-08-01T10:00:00.000Z",
    expiresAt: "2026-10-30T10:00:00.000Z",
  };
}

describe("useNotificationFeed", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    result = undefined;
  });

  afterEach(() => {
    for (const root of mountedRoots.splice(0)) {
      act(() => root.unmount());
    }
    document.body.innerHTML = "";
  });

  it("loads page 1 and exposes items, total, and page state", async () => {
    listNotificationsMock.mockResolvedValue({
      success: true,
      data: { items: [makeNotification("n1"), makeNotification("n2")], total: 42 },
      meta: { page: 1, limit: 20 },
    });

    await mountProbe();
    await act(async () => {
      await result?.load(1);
    });

    expect(listNotificationsMock).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(result?.items).toHaveLength(2);
    expect(result?.total).toBe(42);
    expect(result?.page).toBe(1);
    expect(result?.isLoading).toBe(false);
    expect(result?.error).toBeNull();
  });

  it("paginates: load(page 2) fetches and replaces the feed", async () => {
    listNotificationsMock
      .mockResolvedValueOnce({
        success: true,
        data: { items: [makeNotification("n1")], total: 42 },
        meta: { page: 1, limit: 20 },
      })
      .mockResolvedValueOnce({
        success: true,
        data: { items: [makeNotification("n3")], total: 42 },
        meta: { page: 2, limit: 20 },
      });

    await mountProbe();
    await act(async () => {
      await result?.load(1);
    });
    await act(async () => {
      await result?.load(2);
    });

    expect(listNotificationsMock).toHaveBeenLastCalledWith({ page: 2, limit: 20 });
    expect(result?.items.map((item) => item.id)).toEqual(["n3"]);
    expect(result?.page).toBe(2);
  });

  it("supports category filtering via load options", async () => {
    listNotificationsMock.mockResolvedValue({
      success: true,
      data: { items: [makeNotification("n1")], total: 1 },
      meta: { page: 1, limit: 20 },
    });

    await mountProbe();
    await act(async () => {
      await result?.load(1, { category: "documents" });
    });

    expect(listNotificationsMock).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
      category: "documents",
    });
  });

  it("marks a notification read optimistically", async () => {
    listNotificationsMock.mockResolvedValue({
      success: true,
      data: { items: [makeNotification("n1", false)], total: 1 },
      meta: { page: 1, limit: 20 },
    });
    markReadMock.mockResolvedValue({
      success: true,
      data: { notificationId: "n1" },
    });

    await mountProbe();
    await act(async () => {
      await result?.load(1);
    });
    expect(result?.items[0].isRead).toBe(false);

    await act(async () => {
      await result?.markRead("n1");
    });

    expect(markReadMock).toHaveBeenCalledWith("n1");
    expect(result?.items[0].isRead).toBe(true);
    expect(result?.error).toBeNull();
  });

  it("rolls back the optimistic read when the API call fails", async () => {
    listNotificationsMock.mockResolvedValue({
      success: true,
      data: { items: [makeNotification("n1", false)], total: 1 },
      meta: { page: 1, limit: 20 },
    });
    markReadMock.mockRejectedValue(new Error("Network error"));

    await mountProbe();
    await act(async () => {
      await result?.load(1);
    });

    await act(async () => {
      await result?.markRead("n1");
    });

    expect(markReadMock).toHaveBeenCalledWith("n1");
    // Rolled back to the previous read state.
    expect(result?.items[0].isRead).toBe(false);
    expect(result?.error).toBe("Network error");
  });

  it("surfaces an error state when loading fails without crashing", async () => {
    listNotificationsMock.mockRejectedValue(new Error("Server error"));

    await mountProbe();
    await act(async () => {
      await result?.load(1);
    });

    expect(result?.error).toBe("Server error");
    expect(result?.items).toEqual([]);
  });
});
