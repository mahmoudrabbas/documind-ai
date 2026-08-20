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
    const user = userEvent.setup();

    render(
      <NotificationActionMenu
        primaryAction={{ key: "view", label: "View document", onClick: onPrimary }}
        overflowActions={[
          { key: "archive", label: "Archive", onClick: onArchive, destructive: true },
        ]}
        moreLabel="More actions"
      />,
    );

    await user.click(screen.getByRole("button", { name: "View document" }));
    expect(onPrimary).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "More actions" }));
    await user.click(screen.getByRole("button", { name: "Archive" }));
    expect(onArchive).toHaveBeenCalledTimes(1);
  });
});
