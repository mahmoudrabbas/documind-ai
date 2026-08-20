// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { act } from "react";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { I18nProvider } from "@/providers/i18n-provider";
import { Permission } from "@/types/api/permissions.types";
import type {
  DashboardSummary,
  DashboardSummaryResponse,
} from "@/types/api/dashboard.types";

const state = vi.hoisted(() => ({
  auth: {
    status: "authenticated" as const,
    user: {
      id: "u1",
      name: "Admin",
      email: "admin@example.com",
      role: "COMPANY_ADMIN" as const,
    },
    tenant: { id: "t1", name: "Acme" },
  },
  permissions: {
    status: "ready" as const,
    can: vi.fn((permission: string) => permission === Permission.ANALYTICS_READ),
  },
  summaryRequests: [] as Array<{
    signal?: AbortSignal;
    resolve: (value: DashboardSummaryResponse) => void;
    reject: (error: unknown) => void;
  }>,
}));

vi.mock("@/providers/auth-provider", () => ({ useAuth: () => state.auth }));
vi.mock("@/providers/permission-provider", () => ({
  usePermissions: () => state.permissions,
}));
vi.mock("@/components/billing/SubscriptionWidget", () => ({
  SubscriptionWidget: () => <div data-testid="subscription-widget" />,
}));
vi.mock("@/components/dashboard/UsageQuotaPanel", () => ({
  default: () => <div data-testid="usage-quota-panel" />,
}));
vi.mock("@/components/dashboard/RecentActivityFeed", () => ({
  __esModule: true,
  default: () => <div data-testid="recent-activity-feed" />,
  RecentActivityHeader: () => <div data-testid="recent-activity-header" />,
}));
vi.mock("@/services/dashboard.service", () => ({
  getDashboardSummary: vi.fn((signal?: AbortSignal) =>
    new Promise<DashboardSummaryResponse>((resolve, reject) => {
      state.summaryRequests.push({ signal, resolve, reject });
    }),
  ),
}));

import DashboardPage from "./page";
import { getDashboardSummary } from "@/services/dashboard.service";
const mockedGetDashboardSummary = vi.mocked(getDashboardSummary);

function renderPage(version = 0) {
  return render(
    <I18nProvider initialLocale="en">
      <DashboardPage key={version} />
    </I18nProvider>,
  );
}

function createSummary(overrides: Partial<DashboardSummary> = {}): DashboardSummary {
  return {
    generatedAt: "2026-08-20T10:00:00.000Z",
    tenant: { id: "t1", name: "Acme", slug: "acme", plan: "Pro", status: "ACTIVE" },
    users: { active: 7, total: 10, pendingInvitations: 2, disabled: 1 },
    documents: { processed: 12, processing: 1, failed: 0, total: 15 },
    usage: { questionsAsked30d: 42, questionsAsked7d: 9 },
    knowledgeGaps: { open: 3, total: 8 },
    recentActivity: [],
    ...overrides,
  } as DashboardSummary;
}

async function settle() {
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  state.summaryRequests.splice(0);
  state.permissions.can.mockImplementation(
    (permission: string) => permission === Permission.ANALYTICS_READ,
  );
});

describe("DashboardPage", () => {
  it("shows the loading skeleton on first render", () => {
    renderPage();

    expect(screen.getByText("System Overview")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(document.querySelectorAll(".animate-pulse").length).toBeGreaterThan(0);
    expect(screen.getByTestId("usage-quota-panel")).toBeInTheDocument();
    expect(screen.getByTestId("subscription-widget")).toBeInTheDocument();
  });

  it("ignores aborted requests instead of showing a dashboard error", async () => {
    const user = userEvent.setup();
    const view = renderPage();

    expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(1);
    const first = state.summaryRequests[0]!;

    await act(async () => {
      first.reject(new DOMException("The operation was aborted.", "AbortError"));
    });
    await settle();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("System Overview")).toBeInTheDocument();

    const retryButton = screen.getByRole("button", { name: "Refresh" });
    await user.click(retryButton);
    expect(mockedGetDashboardSummary).toHaveBeenCalledTimes(2);
    view.unmount();
  });

  it("shows a friendly error for a real backend failure and recovers on retry", async () => {
    const user = userEvent.setup();
    mockedGetDashboardSummary.mockRejectedValueOnce(
      new Error("signal is aborted without reason"),
    );

    renderPage();
    await settle();

    expect(screen.getByRole("alert")).toHaveTextContent(
      "Failed to load dashboard summary",
    );
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();

    mockedGetDashboardSummary.mockResolvedValueOnce({
      success: true,
      data: createSummary(),
    });

    await user.click(screen.getByRole("button", { name: "Retry" }));
    await settle();

    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.getByText("7/10")).toBeInTheDocument();
  });

  it("keeps an older request from overwriting a newer success", async () => {
    const requests: Array<{
      resolve: (value: DashboardSummaryResponse) => void;
      reject: (error: unknown) => void;
    }> = [];

    mockedGetDashboardSummary.mockImplementation(
      () =>
        new Promise<DashboardSummaryResponse>((resolve, reject) => {
          requests.push({ resolve, reject });
        }),
    );

    const view = renderPage(0);
    view.rerender(
      <I18nProvider initialLocale="en">
        <DashboardPage key={1} />
      </I18nProvider>,
    );

    await settle();
    expect(requests).toHaveLength(2);
    requests[1]!.resolve({
      success: true,
      data: createSummary({
        users: { active: 4, total: 8, pendingInvitations: 1, disabled: 0 },
      }),
    });
    await settle();

    requests[0]!.resolve({
      success: true,
      data: createSummary({
        users: { active: 99, total: 100, pendingInvitations: 0, disabled: 0 },
      }),
    });
    await settle();

    expect(screen.getByText("4/8")).toBeInTheDocument();
    expect(screen.queryByText("99/100")).not.toBeInTheDocument();
    view.unmount();
  });

  it("renders the loaded dashboard summary after a successful request", async () => {
    mockedGetDashboardSummary.mockResolvedValueOnce({
      success: true,
      data: createSummary(),
    });

    renderPage();
    await settle();

    expect(screen.queryByText("Loading…")).not.toBeInTheDocument();
    expect(screen.getByText("7/10")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });
});
