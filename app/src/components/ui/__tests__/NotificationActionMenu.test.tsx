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

    const archiveButton = screen.getByRole("menuitem", { name: "Archive" });
    expect(archiveButton).toBeInTheDocument();
    await user.click(archiveButton);
    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onTriggered).toHaveBeenCalledTimes(2);

    // Menu is closed after clicking
    expect(screen.queryByRole("menuitem", { name: "Archive" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("menuitem", { name: "Option 1" })).toBeInTheDocument();

    await user.keyboard("{Escape}");
    expect(screen.queryByRole("menuitem", { name: "Option 1" })).not.toBeInTheDocument();
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

  it("exposes the popup as a menu whose actions are menuitems", async () => {
    const user = userEvent.setup();
    render(
      <NotificationActionMenu
        overflowActions={[
          {
            key: "archive",
            label: "Archive",
            onClick: vi.fn(),
            icon: "archive",
          },
          {
            key: "open",
            label: "Open document",
            href: "/dashboard/documents/1",
          },
        ]}
        moreLabel="More actions"
      />,
    );

    await user.click(screen.getByRole("button", { name: "More actions" }));

    // aria-haspopup="menu" on the trigger promises a menu; the popup has to
    // actually expose one, or its aria-label is not reliably announced.
    expect(
      screen.getByRole("menu", { name: "More actions" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Archive" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("menuitem", { name: "Open document" }),
    ).toHaveAttribute("href", "/dashboard/documents/1");
  });

  it("renders the menu outside a clipping ancestor via a portal", async () => {
    const user = userEvent.setup();
    const { container } = render(
      <div className="overflow-hidden" data-testid="clipper">
        <NotificationActionMenu
          overflowActions={[{ key: "clear", label: "Clear", onClick: vi.fn() }]}
          moreLabel="More actions"
        />
      </div>,
    );

    await user.click(screen.getByRole("button", { name: "More actions" }));

    const menu = screen.getByRole("menu", { name: "More actions" });
    // An absolutely positioned descendant cannot escape an ancestor with a
    // non-visible overflow, and z-index does not affect overflow clipping, so
    // the menu must not be a descendant of the clipping box at all.
    expect(screen.getByTestId("clipper").contains(menu)).toBe(false);
    expect(container.contains(menu)).toBe(false);
    expect(menu.parentElement).toBe(document.body);
    expect(menu.className).toContain("fixed");
  });

  it("keeps a portaled menu item clickable and still closes on an outside click", async () => {
    const onClear = vi.fn();
    const user = userEvent.setup();
    render(
      <div>
        <button type="button">Elsewhere</button>
        <NotificationActionMenu
          overflowActions={[{ key: "clear", label: "Clear", onClick: onClear }]}
          moreLabel="More actions"
        />
      </div>,
    );

    // The menu lives outside the component root, so the outside-pointer handler
    // has to treat it as inside; otherwise mousedown closes the menu and
    // unmounts the item before its click handler can run.
    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("menuitem", { name: "Clear" }));
    expect(onClear).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "More actions" }));
    expect(
      screen.getByRole("menu", { name: "More actions" }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Elsewhere" }));
    expect(
      screen.queryByRole("menu", { name: "More actions" }),
    ).not.toBeInTheDocument();
  });
});
