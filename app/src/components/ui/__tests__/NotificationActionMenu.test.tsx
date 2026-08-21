// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { NotificationActionMenu } from "../NotificationActionMenu";

describe("NotificationActionMenu", () => {
  it("shows a primary action and overflow menu actions", async () => {
    const onPrimary = vi.fn();
    const onArchive = vi.fn();
    const onTriggered = vi.fn();
    const user = userEvent.setup();

    render(
      <NotificationActionMenu
        primaryAction={{ key: "view", label: "View document", onClick: onPrimary, icon: "visibility" }}
        overflowActions={[
          { key: "archive", label: "Archive", onClick: onArchive, destructive: true, icon: "archive" },
        ]}
        moreLabel="More actions"
        onActionTriggered={onTriggered}
      />,
    );

    // Primary action is visible
    const primaryButton = screen.getByRole("button", { name: "View document" });
    expect(primaryButton).toBeInTheDocument();
    await user.click(primaryButton);
    expect(onPrimary).toHaveBeenCalledTimes(1);
    expect(onTriggered).toHaveBeenCalledTimes(1);

    // Overflow button opens menu
    const moreButton = screen.getByRole("button", { name: "More actions" });
    await user.click(moreButton);

    const archiveButton = screen.getByRole("button", { name: "Archive" });
    expect(archiveButton).toBeInTheDocument();
    await user.click(archiveButton);
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onTriggered).toHaveBeenCalledTimes(2);

    // Menu is closed after clicking
    expect(screen.queryByRole("button", { name: "Archive" })).not.toBeInTheDocument();
  });

  it("aligns to the end when there is no primary action", () => {
    const { container } = render(
      <NotificationActionMenu
        overflowActions={[
          { key: "clear", label: "Clear", onClick: vi.fn(), destructive: true },
        ]}
        moreLabel="More actions"
      />,
    );

    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass("justify-end");
    expect(screen.getByRole("button", { name: "More actions" })).toBeInTheDocument();
  });

  it("closes the menu on Escape key press", async () => {
    const user = userEvent.setup();
    render(
      <NotificationActionMenu
        overflowActions={[
          { key: "item1", label: "Option 1", onClick: vi.fn() },
        ]}
        moreLabel="More actions"
      />,
    );

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(screen.getByRole("button", { name: "Option 1" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("button", { name: "Option 1" })).not.toBeInTheDocument();
  });

  it("renders link actions properly", async () => {
    render(
      <NotificationActionMenu
        primaryAction={{ key: "link-primary", label: "Go to link", href: "/dashboard/test" }}
        overflowActions={[
          { key: "link-extra", label: "External link", href: "https://example.com" },
        ]}
        moreLabel="More actions"
      />,
    );

    const primaryLink = screen.getByRole("link", { name: "Go to link" });
    expect(primaryLink).toHaveAttribute("href", "/dashboard/test");
  });
});
