// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor, act } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

/* �"?�"? Module mocks (hoisted by vitest) �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"? */

vi.mock("@/providers/auth-provider", () => ({ useAuth: vi.fn() }));
vi.mock("socket.io-client", () => ({ io: vi.fn() }));
vi.mock("@/services/notifications.service", () => ({
  getUnreadCount: vi.fn(),
  listNotifications: vi.fn(),
  markRead: vi.fn(),
  markAllRead: vi.fn(),
  markSeenAll: vi.fn(),
  bulkRead: vi.fn(),
  archive: vi.fn(),
  softDelete: vi.fn(),
}));

/* �"?�"? Imports (resolved after hoisted mocks) �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"? */

import { useAuth } from "@/providers/auth-provider";
import { io } from "socket.io-client";
import {
  getUnreadCount,
  listNotifications,
  markRead,
  markSeenAll,
  archive,
  softDelete,
} from "@/services/notifications.service";
import { I18nProvider } from "@/providers/i18n-provider";
import { NotificationsBell } from "../NotificationsBell";
import { notificationsBadgeColor } from "@/lib/notification-utils";
import type { Notification } from "@/types/api/notifications.types";

const ioMock = vi.mocked(io);

/* �"?�"? Helpers �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"? */

function makeNotification(
  overrides: Partial<Notification> = {},
): Notification {
  return {
    id: "n1",
    type: "processing_failed",
    category: "documents",
    priority: "normal",
    title: { en: "OCR processing failed", ar: "فشلت معالجة OCR" },
    body: { en: "A document could not be processed.", ar: "تعذرت معالجة مستند." },
    actions: [],
    isRead: false,
    readAt: null,
    isSeen: false,
    seenAt: null,
    isArchived: false,
    archivedAt: null,
    lifecycleState: "VISIBLE",
    version: 1,
    collapsedCount: 0,
    createdAt: "2026-07-20T10:00:00Z",
    updatedAt: "2026-07-20T10:00:00Z",
    expiresAt: "2026-08-20T10:00:00Z",
    ...overrides,
  };
}

function mockUnread(count: number, overrides: Partial<Record<"critical" | "high" | "normal" | "low", number>> = {}) {
  (getUnreadCount as Mock).mockResolvedValue({
    success: true,
    data: {
      count,
      byPriority: { critical: 0, high: 0, normal: 0, low: 0, ...overrides },
    },
  });
}

function mockFeed(items: Notification[], total = items.length) {
  (listNotifications as Mock).mockResolvedValue({
    success: true,
    data: { items, total },
    meta: { page: 1, limit: 20 },
  });
}

function renderBell() {
  return render(
    <I18nProvider>
      <NotificationsBell />
    </I18nProvider>,
  );
}

/** Fake socket.io socket: records handlers locally, never touches the network. */
function createFakeSocket() {
  const emitHandlers = new Map<string, Array<(...args: unknown[]) => void>>();
  const socket = {
    on: vi.fn((event: string, handler: (...args: unknown[]) => void) => {
      const list = emitHandlers.get(event) ?? [];
      list.push(handler);
      emitHandlers.set(event, list);
      return socket;
    }),
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

/* �"?�"? Tests �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"? */

describe("NotificationsBell", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    ioMock.mockReturnValue(createFakeSocket() as any);
    (useAuth as Mock).mockReturnValue({
      status: "authenticated",
      user: {
        id: "1",
        name: "Admin",
        email: "admin@test.com",
        role: "COMPANY_ADMIN",
      },
    });
    // The bell always calls markSeenAll() when opening the dropdown; give it a
    // default resolution so the returned promise is chainable in every test.
    (markSeenAll as Mock).mockResolvedValue({
      success: true,
      data: { matchedCount: 0 },
    });
  });

  it("renders nothing when unauthenticated", () => {
    (useAuth as Mock).mockReturnValue({ status: "unauthenticated" });

    const { container } = renderBell();
    expect(container).toBeEmptyDOMElement();
  });

  it("shows the unread badge with the highest-priority color", async () => {
    mockUnread(5, { critical: 1, high: 2, normal: 2, low: 0 });

    renderBell();

    const badge = await screen.findByTestId("unread-badge");
    expect(badge).toHaveTextContent("5");
    expect(badge).toHaveClass("bg-error");
  });

  it('caps the badge at "99+" and shows a warning color for high priority', async () => {
    mockUnread(150, { critical: 0, high: 4 });

    renderBell();

    const badge = await screen.findByTestId("unread-badge");
    expect(badge).toHaveTextContent("99+");
    expect(badge).toHaveClass("bg-warning");
  });

  it("opens on click, marks everything seen, and loads the latest 20", async () => {
    mockUnread(2);
    const items = [
      makeNotification({ id: "n1", title: { en: "First", ar: "الأول" } }),
      makeNotification({ id: "n2", title: { en: "Second", ar: "الثاني" } }),
    ];
    mockFeed(items);

    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(markSeenAll).toHaveBeenCalledTimes(1);
    expect(listNotifications).toHaveBeenCalledWith({ page: 1, limit: 20 });
    expect(await screen.findByText("First")).toBeInTheDocument();
    expect(screen.getByText("Second")).toBeInTheDocument();
  });

  it("shows the empty state when there are no notifications", async () => {
    mockUnread(0);
    mockFeed([]);

    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    expect(await screen.findByText("No notifications")).toBeInTheDocument();
  });

  it("hides the unread dot for read notifications", async () => {
    mockUnread(1);
    mockFeed([
      makeNotification({ id: "n1", isRead: true, title: { en: "Read one", ar: "مقروء" } }),
      makeNotification({ id: "n2", isRead: false, title: { en: "Unread one", ar: "غير مقروء" } }),
    ]);

    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await screen.findByText("Read one");
    await screen.findByText("Unread one");

    const dots = screen.getAllByTestId("unread-dot");
    expect(dots).toHaveLength(1);
  });

  it("marks a notification read when its row is clicked", async () => {
    mockUnread(1);
    mockFeed([makeNotification({ id: "n1" })]);
    (markRead as Mock).mockResolvedValue({
      success: true,
      data: { notificationId: "n1" },
    });

    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await user.click(await screen.findByText("OCR processing failed"));

    await waitFor(() => expect(markRead).toHaveBeenCalledWith("n1"));
  });

  it("archives a notification and removes it from the dropdown", async () => {
    mockUnread(2);
    const items = [
      makeNotification({ id: "n1", title: { en: "First", ar: "الأول" } }),
      makeNotification({ id: "n2", title: { en: "Second", ar: "الثاني" } }),
    ];
    mockFeed(items);
    (archive as Mock).mockResolvedValue({
      success: true,
      data: { notificationId: "n1", archived: true },
    });

    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await screen.findByText("First");

    await user.click(screen.getAllByRole("button", { name: "More actions" })[0]);
    await user.click(screen.getByRole("menuitem", { name: "Archive" }));

    await waitFor(() => expect(archive).toHaveBeenCalledWith("n1"));
    await waitFor(() =>
      expect(screen.queryByText("First")).not.toBeInTheDocument(),
    );
  });

  it("soft-deletes a notification when Clear is clicked", async () => {
    mockUnread(1);
    mockFeed([makeNotification({ id: "n1" })]);
    (softDelete as Mock).mockResolvedValue({
      success: true,
      data: { notificationId: "n1", deleted: true },
    });

    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole("button", { name: "Notifications" }));
    await user.click(await screen.findByRole("button", { name: "More actions" }));
    await user.click(await screen.findByRole("menuitem", { name: "Clear" }));

    await waitFor(() => expect(softDelete).toHaveBeenCalledWith("n1"));
  });

  it("links to the full notifications page", async () => {
    mockUnread(0);
    mockFeed([]);

    const user = userEvent.setup();
    renderBell();

    await user.click(screen.getByRole("button", { name: "Notifications" }));

    const viewAll = await screen.findByRole("link", { name: "View all" });
    expect(viewAll).toHaveAttribute("href", "/dashboard/notifications");
  });

  it("refreshes the unread count and feed when the socket pushes notification:created", async () => {
    mockUnread(1, { normal: 1 });
    mockFeed([]);
    const socket = createFakeSocket();
    ioMock.mockReturnValue(socket as any);

    renderBell();
    await screen.findByTestId("unread-badge");
    expect(getUnreadCount).toHaveBeenCalledTimes(1);
    expect(listNotifications).not.toHaveBeenCalled();

    await act(async () => {
      socket.emitEvent("notification:created", { id: "n9" });
    });

    await waitFor(() => expect(getUnreadCount).toHaveBeenCalledTimes(2));
    await waitFor(() =>
      expect(listNotifications).toHaveBeenCalledWith({ page: 1, limit: 20 }),
    );
  });
});

describe("notificationsBadgeColor", () => {
  it("picks the highest unread priority", () => {
    expect(
      notificationsBadgeColor({ critical: 1, high: 0, normal: 0, low: 0 }),
    ).toBe("bg-error");
    expect(
      notificationsBadgeColor({ critical: 0, high: 2, normal: 0, low: 0 }),
    ).toBe("bg-warning");
    expect(
      notificationsBadgeColor({ critical: 0, high: 0, normal: 1, low: 0 }),
    ).toBe("bg-info");
    expect(
      notificationsBadgeColor({ critical: 0, high: 0, normal: 0, low: 3 }),
    ).toBe("bg-on-surface-variant");
  });

  it("returns null when everything is read", () => {
    expect(
      notificationsBadgeColor({ critical: 0, high: 0, normal: 0, low: 0 }),
    ).toBeNull();
  });
});
