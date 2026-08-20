// @vitest-environment jsdom
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const healthData = {
  status: "healthy",
  summary: "All critical services operational",
  checkedAt: "2026-08-20T17:23:00.000Z",
  services: {
    api: {
      name: "API",
      status: "healthy",
      checkedAt: "2026-08-20T17:23:00.000Z",
      latencyMs: null,
      details: { uptimeMs: 754000, connected: true },
    },
    mongodb: {
      name: "MongoDB",
      status: "healthy",
      checkedAt: "2026-08-20T17:23:00.000Z",
      latencyMs: 12,
      details: { connected: true },
    },
    redis: {
      name: "Redis",
      status: "healthy",
      checkedAt: "2026-08-20T17:23:00.000Z",
      latencyMs: 8,
      details: { connected: true, response: "PONG" },
    },
    workers: {
      name: "Background workers",
      status: "healthy",
      checkedAt: "2026-08-20T17:23:00.000Z",
      latencyMs: 149,
      details: {
        uptimeMs: 750000,
        reachable: true,
        workerStatus: "ready",
        checks: { redis: true, mongodb: true, handlers: true, consumer: true },
        details: {
          adapter: "BullMQ",
          queue: "documind-jobs",
          handlerCount: 11,
        },
      },
    },
  },
};

vi.mock("@/providers/i18n-provider", () => ({
  useI18n: () => ({
    t: (key: string) => {
      const labels: Record<string, string> = {
        "common.close": "Close",
        "common.refresh": "Refresh",
        "superAdmin.serviceStatus.healthy": "Healthy",
        "superAdmin.systemHealthSummary.healthy":
          "All 4 critical services operational",
        "superAdmin.systemHealthYes": "Yes",
        "superAdmin.systemHealthReady": "Ready",
        "superAdmin.systemHealthHealthChecks": "Health checks",
        "superAdmin.systemHealthRuntimeDetails": "Runtime details",
        "superAdmin.systemHealthViewDetails": "View details",
      };
      return labels[key] ?? key;
    },
  }),
  useIntlLocale: () => "en-US",
}));

vi.mock("@/components/super-admin/platform-ui", () => ({
  PlatformState: () => null,
  StatusPill: ({ label }: { label: string }) => <span>{label}</span>,
  usePlatformData: () => ({
    data: healthData,
    loading: false,
    error: "",
    reload: vi.fn(),
  }),
}));

vi.mock("@/services/super-admin.service", () => ({
  getPlatformHealth: vi.fn(),
}));

import SystemHealthPage from "./page";

describe("System Health service cards", () => {
  it("opens structured worker details from the compact card and closes with Escape", () => {
    render(<SystemHealthPage />);

    expect(screen.getAllByRole("button", { name: /healthy/i })).toHaveLength(4);
    expect(screen.queryByText("Adapter")).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", { name: /background workers: healthy/i }),
    );

    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Health checks")).toBeInTheDocument();
    expect(screen.getByText("Runtime details")).toBeInTheDocument();
    expect(screen.getByText("Adapter")).toBeInTheDocument();
    expect(screen.getByText("BullMQ")).toBeInTheDocument();
    expect(screen.getAllByText("Ready").length).toBeGreaterThan(0);
    expect(screen.queryByText('{"redis":true}')).not.toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
});
