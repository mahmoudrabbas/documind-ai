// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

import { io } from "socket.io-client";
import { I18nProvider } from "@/providers/i18n-provider";
import { ToastProvider, EXIT_ANIMATION_MS } from "@/providers/toast-provider";
import { Toaster } from "@/components/ui/Toaster";
import { useNotificationToasts } from "../useNotificationToasts";
import { markRead } from "@/services/notifications.service";
import type { NotificationSocketEvent } from "@/types/api/notifications.types";

/* ── Module mocks (hoisted by vitest) ─────────────────────────────────── */

vi.mock("socket.io-client", () => ({ io: vi.fn() }));
vi.mock("@/services/notifications.service", () => ({
  markRead: vi.fn(),
  getUnreadCount: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
}));

const ioMock = vi.mocked(io);
const markReadMock = vi.mocked(markRead);
const pushMock = vi.fn<(path: string) => void>();

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

/* ── Test harness ─────────────────────────────────────────────────────── */

function Probes() {
  useNotificationToasts();
  return (
    <>
      <Toaster />
    </>
  );
}

function renderProbes() {
  return render(
    <I18nProvider>
      <ToastProvider>
        <Probes />
      </ToastProvider>
    </I18nProvider>,
  );
}

const baseEvent: NotificationSocketEvent = {
  id: "n-1",
  type: "processing_failed",
  category: "workflow",
  priority: "high",
  title: "OCR failed for invoice-42.pdf",
  body: "The source file was damaged. Retry with a re-exported copy.",
  actions: [{ label: "Retry", url: "/documents/42/ocr/retry" }],
  isRead: false,
  createdAt: new Date().toISOString(),
};

describe("useNotificationToasts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    ioMock.mockReturnValue(createFakeSocket() as any);
    markReadMock.mockResolvedValue({ success: true, data: { notificationId: "n-1" } });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  async function emitCreated(event: Partial<NotificationSocketEvent>) {
    const socket = ioMock.mock.results[ioMock.mock.results.length - 1]
      ?.value as FakeSocket;
    await act(async () => {
      socket.emitEvent("notification:created", { ...baseEvent, ...event });
    });
  }

  it("shows a toast with title + body when notification:created arrives", async () => {
    renderProbes();
    await emitCreated({});

    expect(screen.getByText("OCR failed for invoice-42.pdf")).toBeInTheDocument();
    expect(
      screen.getByText("The source file was damaged. Retry with a re-exported copy."),
    ).toBeInTheDocument();
  });

  it("maps priority high → warning alert variant", async () => {
    renderProbes();
    await emitCreated({ priority: "high" });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("toast-warning")).toBeInTheDocument();
  });

  it("maps priority critical → error alert variant", async () => {
    renderProbes();
    await emitCreated({ priority: "critical" });

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByTestId("toast-error")).toBeInTheDocument();
  });

  it("ignores malformed events (no id / no title)", async () => {
    renderProbes();
    await emitCreated({ id: undefined });
    await emitCreated({ id: "n-2", title: undefined });

    expect(screen.queryByText(/OCR failed/)).not.toBeInTheDocument();
    expect(screen.queryByTestId(/^toast-/)).not.toBeInTheDocument();
  });

  it("dismisses the toast and does NOT mark read when closed manually", async () => {
    renderProbes();
    await emitCreated({});

    await fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));

    expect(markReadMock).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(EXIT_ANIMATION_MS + 1);
    });

    expect(screen.queryByText("OCR failed for invoice-42.pdf")).not.toBeInTheDocument();
  });

  it("navigates to the resolved action href and marks the notification read", async () => {
    renderProbes();
    await emitCreated({});

    fireEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(pushMock).toHaveBeenCalledWith("/dashboard/processing-failed");
    expect(markReadMock).toHaveBeenCalledWith("n-1");

    act(() => {
      vi.advanceTimersByTime(EXIT_ANIMATION_MS + 1);
    });

    expect(screen.queryByText("OCR failed for invoice-42.pdf")).not.toBeInTheDocument();
  });

  it("handles LocalizedText titles from the REST shape too", async () => {
    renderProbes();
    await emitCreated({
      title: { en: "New document processed", ar: "تمت معالجة مستند جديد" },
      body: { en: "All pages converted.", ar: "تم تحويل جميع الصفحات." },
    });

    expect(screen.getByText("New document processed")).toBeInTheDocument();
    expect(screen.getByText("All pages converted.")).toBeInTheDocument();
  });
});
