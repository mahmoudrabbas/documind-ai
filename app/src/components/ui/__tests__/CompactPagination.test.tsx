// @vitest-environment jsdom
/* eslint-disable @typescript-eslint/no-explicit-any */
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import "@testing-library/jest-dom/vitest";

import { CompactPagination } from "../CompactPagination";

describe("CompactPagination", () => {
  it("renders the summary, pagination controls, and rows-per-page selector", async () => {
    const onPageChange = vi.fn();
    const onPageSizeChange = vi.fn();
    const user = userEvent.setup();

    render(
      <CompactPagination
        page={2}
        totalPages={6}
        pageSize={25}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        summary="Showing 26–50 of 120"
        previousLabel="Previous"
        nextLabel="Next"
        rowsPerPageLabel="Rows per page"
      />,
    );

    expect(screen.getByText("Showing 26–50 of 120")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Previous" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Next" })).toBeEnabled();

    await user.click(screen.getByRole("button", { name: "3" }));
    expect(onPageChange).toHaveBeenCalledWith(3);

    await user.selectOptions(screen.getByRole("combobox"), "50");
    expect(onPageSizeChange).toHaveBeenCalledWith(50);
  });
});
