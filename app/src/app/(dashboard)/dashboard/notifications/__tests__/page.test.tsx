// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

/* Module mocks (hoisted by vitest) */
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

import {
  getUnreadCount,
  listNotifications,
  markAllRead,
  markRead,
} from "@/services/notifications.service";
import { I18nProvider } from "@/providers/i18n-provider";
import NotificationsPage from "../page";
import type { Notification } from "@/types/api/notifications.types";

/* Helpers */

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

function mockFeedOverPages(itemsPerPage: number, total: number) {
  (listNotifications as Mock).mockImplementation(
    async ({ page = 1, limit = 20 }: { page?: number; limit?: number } = {}) => {
      const start = (page - 1) * limit;
      const count = Math.min(limit, Math.max(0, total - start));
      return {
        success: true,
        data: {
          items: Array.from({ length: count }, (_, i) =>
            makeNotification({
              id: `n${start + i}`,
              title: { en: `Item ${start + i}`, ar: `عنصر ${start + i}` },
            }),
          ),
          total,
        },
        meta: { page, limit },
      };
    },
  );
}

function renderPage() {
  return render(
    <I18nProvider>
      <NotificationsPage />
    </I18nProvider>,
  );
}

/* Tests */

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (getUnreadCount as Mock).mockResolvedValue({
      success: true,
      data: {
        count: 2,
        byPriority: { critical: 0, high: 0, normal: 2, low: 0 },
      },
    });
    (markRead as Mock).mockResolvedValue({
      success: true,
      data: { notificationId: "n1" },
    });
    (markAllRead as Mock).mockResolvedValue({
      success: true,
      data: { matchedCount: 2 },
    });
  });

  it("loads the full history on mount and renders items", async () => {
    mockFeedOverPages(2, 2);
    renderPage();

    expect(await screen.findByText("Item 0")).toBeInTheDocument();
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(listNotifications).toHaveBeenCalledWith({
      page: 1,
      limit: 20,
    });
  });

  it("renders the empty state when there are no notifications", async () => {
    mockFeedOverPages(0, 0);
    renderPage();

    expect(await screen.findByText("No notifications")).toBeInTheDocument();
    expect(screen.getByText("You're all caught up.")).toBeInTheDocument();
  });

  it("refetches with the selected category when a tab is clicked", async () => {
    mockFeedOverPages(2, 2);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Item 0");

    await user.click(screen.getByRole("tab", { name: "Billing" }));

    await waitFor(() =>
      expect(listNotifications).toHaveBeenLastCalledWith({
        page: 1,
        limit: 20,
        category: "billing",
      }),
    );
  });

  it("paginates with Previous / Next when there are more than one page", async () => {
    mockFeedOverPages(20, 40);
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByText("Item 0")).toBeInTheDocument();
    expect(screen.getByText("Page 1 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next" }));

    expect(await screen.findByText("Item 20")).toBeInTheDocument();
    expect(screen.getByText("Page 2 of 2")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous" }));

    expect(await screen.findByText("Item 0")).toBeInTheDocument();
  });

  it("marks all notifications as read via the header action", async () => {
    mockFeedOverPages(2, 2);
    const user = userEvent.setup();
    renderPage();

    await screen.findByText("Item 0");

    await user.click(screen.getByRole("button", { name: "Mark all as read" }));

    await waitFor(() => expect(markAllRead).toHaveBeenCalledTimes(1));
  });

  it("marks a notification read when its row is clicked", async () => {
    mockFeedOverPages(2, 2);
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByText("Item 0"));

    await waitFor(() => expect(markRead).toHaveBeenCalledWith("n0"));
  });
});
